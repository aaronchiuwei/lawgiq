"""Triage a Clio matter's entries with Jev and rank them by importance.

Clio access is READ ONLY: this module only ever issues GET requests to Clio.

Usage:
  python scripts/triage.py                      # matter matching "Sapini"
  python scripts/triage.py --query Sapini --force
  python scripts/triage.py --matter-id 123456 --ocr-dir data/ocr

Document text comes from the OCR pipeline (python ocr_pipeline.py -> data/ocr/{document_id}.json).
Results go to data/triage/{source_type}_{source_id}.json; ui/dashboard.py displays them.

Env (.env): CLIO_TOKEN, MATTER_ID, CLIO_BASE_URL (default https://app.clio.com),
            TYPESAFE_API_KEY, JEV_BASE_URL, JEV_MODEL
"""
import argparse
import html
import json
import os
import pathlib
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent
TRIAGE_DIR = ROOT / "data" / "triage"
USAGE_LOG = ROOT / "data" / "jev_usage.jsonl"
MAX_TEXT_CHARS = 6000
DOC_PAGES = 2


def load_env(path=ROOT / ".env"):
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


def http_json(req, timeout=60, attempts=5):
    """Send a request, retrying 429/5xx with exponential backoff (honours Retry-After)."""
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            if e.code in (429, 500, 502, 503, 529) and attempt < attempts - 1:
                wait = float(e.headers.get("Retry-After") or 2 ** attempt)
                time.sleep(min(wait, 60))
                continue
            raise RuntimeError(f"HTTP {e.code} {req.full_url}: {body[:500]}") from None
        except urllib.error.URLError:
            if attempt < attempts - 1:
                time.sleep(2 ** attempt)
                continue
            raise


# ---------------------------------------------------------------- Clio (GET only)

class Clio:
    def __init__(self, token, base_url):
        self.token = token
        self.api = base_url.rstrip("/") + "/api/v4"
        self.requests = 0

    def get(self, path, params=None):
        url = path if path.startswith("http") else f"{self.api}/{path}"
        if params:
            url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
        req = urllib.request.Request(
            url, headers={"Authorization": f"Bearer {self.token}"}, method="GET"
        )
        self.requests += 1
        return http_json(req)

    def get_all(self, path, params):
        """Follow Clio's meta.paging.next links."""
        data = self.get(path, {**params, "limit": 200})
        rows = list(data.get("data", []))
        nxt = data.get("meta", {}).get("paging", {}).get("next")
        while nxt:
            data = self.get(nxt)
            rows += data.get("data", [])
            nxt = data.get("meta", {}).get("paging", {}).get("next")
        return rows


def clean(text):
    text = html.unescape(re.sub(r"<[^>]+>", " ", text or ""))
    return re.sub(r"\s+", " ", text).strip()


def find_matter(clio, query):
    rows = clio.get_all("matters.json", {"query": query, "fields": "id,display_number,description,status"})
    if not rows:
        sys.exit(f"No Clio matter matches {query!r}")
    for r in rows:
        print(f"  matter {r['id']}: {r.get('display_number')} - {r.get('description')} ({r.get('status')})")
    if len(rows) > 1:
        print(f"  {len(rows)} matches; using the first. Pass --matter-id to choose.")
    return rows[0]["id"]


def fetch_entries(clio, matter_id):
    """Pull text entries for one matter. Each source is fetched independently."""
    specs = [
        ("note", "notes.json", "id,subject,detail,date,created_at",
         lambda r: (r.get("date") or r.get("created_at"), r.get("subject") or "", r.get("detail"))),
        ("communication", "communications.json", "id,subject,body,date,received_at,created_at,type",
         lambda r: (r.get("received_at") or r.get("date") or r.get("created_at"), r.get("subject") or "", r.get("body"))),
        ("task", "tasks.json", "id,name,description,due_at,created_at,status",
         lambda r: (r.get("due_at") or r.get("created_at"), r.get("name") or "", r.get("description"))),
        ("calendar_entry", "calendar_entries.json", "id,summary,description,start_at,location",
         lambda r: (r.get("start_at"), r.get("summary") or "", r.get("description"))),
    ]
    entries = []
    for source_type, path, fields, unpack in specs:
        params = {"matter_id": matter_id, "fields": fields}
        if source_type == "note":
            params["type"] = "Matter"  # Clio requires Matter or Contact
        try:
            rows = clio.get_all(path, params)
        except RuntimeError as e:
            print(f"  ! {source_type}: {e}")
            continue
        for r in rows:
            date, title, body = unpack(r)
            entries.append({
                "source_type": source_type,
                "source_id": str(r["id"]),
                "date": date,
                "title": title,
                "text": clean(body)[:MAX_TEXT_CHARS],
            })
        print(f"  {source_type}: {len(rows)}")
    return entries


def fetch_documents(clio, matter_id, ocr_dirs):
    """Document metadata from Clio, text from the OCR pipeline's output when present."""
    try:
        rows = clio.get_all("documents.json", {"matter_id": matter_id, "fields": "id,name,created_at,content_type"})
    except RuntimeError as e:
        print(f"  ! document: {e}")
        return []
    entries, with_text = [], 0
    for r in rows:
        text = ""
        for d in ocr_dirs:
            f = d / f"{r['id']}.json"
            if f.exists():
                pages = json.loads(f.read_text(encoding="utf-8")).get("pages", [])
                text = "\n".join(p.get("text", "") for p in pages[:DOC_PAGES])
                with_text += 1
                break
        entries.append({
            "source_type": "document",
            "source_id": str(r["id"]),
            "date": r.get("created_at"),
            "uploaded_at": r.get("created_at"),
            "title": r.get("name") or "",
            "text": clean(text)[:MAX_TEXT_CHARS],
            "text_source": "ocr" if text else "name_only",
        })
    print(f"  document: {len(rows)} ({with_text} with OCR text, {len(rows) - with_text} name only)")
    return entries


# ---------------------------------------------------------------- Jev

CATEGORIES = {
    "incident_liability": "How the accident happened, fault, police reports, witness statements, admissions.",
    "injury_treatment": "Diagnoses, injuries, treatment visits, imaging findings, surgery, medical records.",
    "medical_bills": "Bills, liens, charges, medical specials amounts.",
    "coverage_insurance": "Insurance policies, policy limits, coverage disclosures, adjuster communication about coverage.",
    "settlement_negotiation": "Demand letters, offers, counteroffers, settlement discussions.",
    "litigation_deadline": "Lawsuit filings, court dates, depositions, statute of limitations, discovery deadlines.",
    "client_contact": (
        "Actual conversations with the client (calls, meetings, substantive messages) that are not "
        "mainly about one of the topics above. A client call that mainly reports new treatment or "
        "injury information is injury_treatment."
    ),
    "routine_admin": "Scheduling, voicemails, records requests, reminders, internal housekeeping.",
}

# Ordered low -> high; each level must stand on its own (TypeSafe Score guidance).
IMPACT_LEVELS = [
    "Housekeeping with no bearing on the case: scheduling logistics, reminders, voicemails, routine records requests or follow-ups.",
    "Routine progress that adds no new facts: an ordinary check-in, a routine treatment visit, standard correspondence.",
    "Adds case evidence: a new medical record, diagnosis, imaging result, bill, witness or liability fact, or coverage detail.",
    "Materially changes damages, liability or coverage: surgery recommended, treatment escalated, a new injury finding, "
    "policy limits disclosed, liability admitted or denied, benefits exhausted, a lien asserted.",
    "Pivotal case event: surgery performed, demand served, settlement offer or counteroffer, lawsuit filed, "
    "statute of limitations date, deposition or trial of a party, case settled or dismissed.",
]
URGENCY_LEVELS = [
    "No action or deadline involved.",
    "Some follow-up is needed but there is no fixed date.",
    "Action is required by a specific date, or an appointment or event is scheduled.",
    "Hard legal deadline with serious consequences if missed: statute of limitations, court-ordered date, "
    "filing or discovery deadline, deposition, trial.",
]

QUESTIONS = {
    "category": {
        "type": "choice",
        "instructions": "Which category best describes this entry from a personal-injury law firm's case file?",
        "criteria": CATEGORIES,
    },
    "impact": {
        "type": "score",
        "instructions": "How much does this entry matter to the outcome of the client's personal-injury case?",
        "criteria": IMPACT_LEVELS,
    },
    "urgency": {
        "type": "score",
        "instructions": "How time-sensitive is the action or deadline described in this entry?",
        "criteria": URGENCY_LEVELS,
    },
    "shareable": {
        "type": "noul",
        "instructions": (
            "Could this entry be sent to the client's treating medical provider without revealing anything "
            "the law firm must keep confidential?"
        ),
        "criteria": {
            "true": (
                "Contains only treatment facts, medical records, bills or balances, appointment details, "
                "or a plain case-status update."
            ),
            "false": (
                "Mentions settlement demands, offers or counteroffers, case value, negotiation with adjusters "
                "or defense counsel, litigation or discovery strategy, legal advice to the client, or the "
                "client's confidential statements to the firm."
            ),
        },
    },
}

# Policy lives in code, so these can change without re-running Jev.
WEIGHTS = {"impact": 0.75, "urgency": 0.25}
SHARE_AT, REVIEW_AT = 0.9, 0.5


def share_status(p):
    return "share" if p >= SHARE_AT else "review" if p >= REVIEW_AT else "internal"


# ---------------------------------------------------------------- document dates
# Select, don't generate: code finds every date span in the text, Jev picks one
# (or NO_DATE), and code parses the chosen span. Jev can't invent a date.

_MONTHS = r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
DATE_RE = re.compile(
    rf"\b{_MONTHS}\.?\s+\d{{1,2}}(?:st|nd|rd|th)?,?\s+\d{{4}}\b"       # March 3, 2024
    rf"|\b\d{{1,2}}(?:st|nd|rd|th)?\s+(?:day\s+of\s+)?{_MONTHS},?\s+\d{{4}}\b"  # 3 March 2024 / 3rd day of March, 2024
    r"|\b\d{1,2}[/-]\d{1,2}[/-](?:\d{4}|\d{2})\b"                      # 03/03/2024, 3-3-24
    r"|\b\d{4}-\d{2}-\d{2}\b",                                          # 2024-03-03
    re.IGNORECASE,
)
NO_DATE = "NO_DATE"
DATE_CONFIDENCE_MIN = 0.5
MAX_DATE_CANDIDATES = 60


def parse_date(span):
    s = re.sub(r"(\d)(st|nd|rd|th)\b", r"\1", span, flags=re.IGNORECASE)
    s = re.sub(r"\bday of\b", "", s, flags=re.IGNORECASE)
    s = re.sub(r"[.,]", " ", s)
    s = re.sub(r"\bSept\b", "Sep", s, flags=re.IGNORECASE)
    s = " ".join(s.split())
    for fmt in ("%B %d %Y", "%b %d %Y", "%d %B %Y", "%d %b %Y",
                "%m/%d/%Y", "%m/%d/%y", "%m-%d-%Y", "%m-%d-%y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            pass
    return None


def date_candidates(text):
    seen = {}
    for m in DATE_RE.finditer(text):
        span = m.group(0)
        if span not in seen and parse_date(span):
            seen[span] = None
        if len(seen) >= MAX_DATE_CANDIDATES:
            break
    return list(seen)


def date_question(candidates):
    return {
        "type": "choice",
        "instructions": (
            "Which date is this document's own date: when it was written, signed, filed or served, or "
            "when the visit, procedure or event it records took place? Do not pick the accident date, "
            "a date of birth, or an earlier date the document merely refers to, unless that is the "
            "document's own date."
        ),
        "criteria": {c: None for c in candidates} | {NO_DATE: "None of these is the document's own date."},
    }


class Jev:
    def __init__(self, key, base_url, model):
        self.key, self.url, self.model = key, base_url.rstrip("/") + "/v1/systemone", model
        self.lock = threading.Lock()
        self.calls = self.input_tokens = self.output_tokens = 0

    def ask(self, state, questions):
        body = {"model": self.model, "state": state, "questions": questions}
        req = urllib.request.Request(
            self.url, data=json.dumps(body).encode(), method="POST",
            headers={"Authorization": f"Bearer {self.key}", "Content-Type": "application/json"},
        )
        data = http_json(req)
        usage = data.get("usage") or {}
        with self.lock:
            self.calls += 1
            self.input_tokens += usage.get("input_tokens", 0)
            self.output_tokens += usage.get("output_tokens", 0)
        return data


def triage(jev, entry):
    is_doc = entry["source_type"] == "document"
    # A document's Clio date is just its upload time, so don't show it to Jev.
    keys = ("source_type", "title", "text") if is_doc else ("source_type", "title", "date", "text")
    state = {k: entry[k] for k in keys if entry.get(k)}
    questions = dict(QUESTIONS)
    candidates = date_candidates(entry["text"]) if is_doc else []
    if candidates:
        questions["doc_date"] = date_question(candidates)
    data = jev.ask(state, questions)
    answers = data["answers"]
    cat = answers["category"]
    probs = {k: cat["probabilities"].get(k, 0.0) for k in CATEGORIES}
    # Score answers are probability-weighted level positions; normalise to 0-1.
    impact = answers["impact"]["score"] / (len(IMPACT_LEVELS) - 1)
    urgency = answers["urgency"]["score"] / (len(URGENCY_LEVELS) - 1)
    shareable = answers["shareable"]["noul"]
    result = {
        "source_type": entry["source_type"],
        "source_id": entry["source_id"],
        "date": entry["date"],
        "title": entry["title"],
        "category_probs": probs,
        "top_category": cat["choice"],
        "importance_score": round(WEIGHTS["impact"] * impact + WEIGHTS["urgency"] * urgency, 4),
        "impact_score": round(impact, 4),
        "urgency_score": round(urgency, 4),
        "shareable_prob": shareable,
        "shareable_status": share_status(shareable),
        "model": data.get("model", jev.model),
    }
    if is_doc:
        result["text_source"] = entry["text_source"]
        result["uploaded_at"] = entry["uploaded_at"]
        result["date_source"] = "clio_upload"
        if candidates:
            pick = answers["doc_date"]
            result["date_text"] = pick["choice"]
            result["date_confidence"] = pick["confidence"]
            if pick["choice"] != NO_DATE and pick["confidence"] >= DATE_CONFIDENCE_MIN:
                result["date"] = parse_date(pick["choice"])
                result["date_source"] = "document_text"
    out = TRIAGE_DIR / f"{entry['source_type']}_{entry['source_id']}.json"
    out.write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--query", default="Sapini")
    ap.add_argument("--matter-id")
    ap.add_argument("--ocr-dir", action="append", default=[])
    ap.add_argument("--no-documents", action="store_true")
    ap.add_argument("--force", action="store_true", help="re-classify entries already in data/triage")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--top", type=int, default=15)
    args = ap.parse_args()

    load_env()
    token = os.environ.get("CLIO_TOKEN") or os.environ.get("CLIO_ACCESS_TOKEN")
    jev_key = os.environ.get("TYPESAFE_API_KEY") or os.environ.get("JEV_API_KEY")
    if not token or not jev_key:
        sys.exit("Need CLIO_TOKEN and TYPESAFE_API_KEY in .env")

    clio = Clio(token, os.environ.get("CLIO_BASE_URL", "https://app.clio.com"))
    jev = Jev(jev_key, os.environ.get("JEV_BASE_URL", "https://api.typesafe.ai"), os.environ.get("JEV_MODEL", "jev-latest"))
    TRIAGE_DIR.mkdir(parents=True, exist_ok=True)

    print("Clio:")
    matter_id = args.matter_id or os.environ.get("MATTER_ID") or find_matter(clio, args.query)
    entries = fetch_entries(clio, matter_id)
    if not args.no_documents:
        ocr_dirs = [pathlib.Path(d) for d in args.ocr_dir] or [ROOT / "data" / "ocr"]
        entries += fetch_documents(clio, matter_id, ocr_dirs)

    def cached(e):
        f = TRIAGE_DIR / f"{e['source_type']}_{e['source_id']}.json"
        if not f.exists():
            return False
        r = json.loads(f.read_text(encoding="utf-8"))
        return "impact_score" in r and (e["source_type"] != "document" or "date_source" in r)

    todo = [e for e in entries if args.force or not cached(e)]
    print(f"\nJev: {len(todo)} to classify ({len(entries) - len(todo)} cached)")
    started, failures = time.time(), 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(triage, jev, e): e for e in todo}
        for f in as_completed(futures):
            try:
                f.result()
            except Exception as ex:  # keep going; report at the end
                failures += 1
                e = futures[f]
                print(f"  ! {e['source_type']} {e['source_id']}: {ex}")
    elapsed = time.time() - started

    usage = {
        "at": datetime.now(timezone.utc).isoformat(), "matter_id": matter_id,
        "jev_calls": jev.calls, "input_tokens": jev.input_tokens, "output_tokens": jev.output_tokens,
        "clio_get_requests": clio.requests, "failures": failures, "seconds": round(elapsed, 1),
    }
    with USAGE_LOG.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(usage) + "\n")
    print(f"  {jev.calls} calls, {jev.input_tokens} in / {jev.output_tokens} out tokens, "
          f"{failures} failures, {elapsed:.1f}s; {clio.requests} Clio GETs")

    wanted = {(e["source_type"], e["source_id"]) for e in entries}
    results = []
    for p in TRIAGE_DIR.glob("*.json"):
        r = json.loads(p.read_text(encoding="utf-8"))
        if (r["source_type"], r["source_id"]) in wanted:
            results.append(r)
    results.sort(key=lambda r: r["importance_score"], reverse=True)

    print(f"\nTop {args.top} of {len(results)} by importance:")
    print(f"{'score':>5} {'imp':>4} {'urg':>4}  {'share':14}  {'date':10}  {'type':14}  {'category':22}  title")
    for r in results[: args.top]:
        share = f"{r.get('shareable_status', '?')} {r['shareable_prob']:.2f}"
        print(f"{r['importance_score']:5.2f} {r.get('impact_score', 0):4.2f} {r.get('urgency_score', 0):4.2f}  "
              f"{share:14}  {(r['date'] or '')[:10]:10}  {r['source_type']:14}  {r['top_category']:22}  "
              f"{r['title'][:60]}")


if __name__ == "__main__":
    main()
