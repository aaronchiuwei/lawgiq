"""Link every Clio task to the records related to it, and ask who (if anyone) the task is waiting on.

Clio has no links between tasks and other records, so they are inferred in two steps:
  1. Code proposes candidates: calendar entries, notes, communications, other tasks, expenses and
     individual document pages, scored on shared contacts (from the matter's own contact list),
     shared distinctive words and nearby dates. Records that mention most contacts (a HIPAA
     authorization listing every provider) are discounted.
  2. Jev confirms: for each candidate, is it related and how (scheduled as / produces / verifies /
     follow-up / context). Jev only chooses among candidates code found; it cannot invent a link.
     The same call asks whether the next step waits on someone outside the firm, and who.

Reads data/clio/matter.json (scripts/export_matter.py) and data/ocr (ocr_pipeline.py); no Clio calls.
Writes data/links/task_{id}.json. Cached; --force re-asks Jev.

  python scripts/link_tasks.py [--force] [--task-id ID]
"""
import argparse
import html
import json
import math
import os
import pathlib
import re
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timezone

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from triage import Jev, load_env  # noqa: E402  (same Jev client and .env loading as triage)

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
LINKS_DIR = DATA / "links"
USAGE_LOG = DATA / "jev_usage.jsonl"

MAX_CANDIDATES = 10
MIN_SCORE = 0.12
PAGES_PER_DOC = 2
GENERIC_CONTACTS = 5        # a record naming more contacts than this is treated as generic
DATE_WINDOW_DAYS = 21
RELATED_MIN = 0.5           # keep a link when Jev's related probability is at least this
CANDIDATE_CHARS = 450

RELATIONS = {
    "scheduled_as": "It is the appointment, visit or event where the task is carried out.",
    "produces": "It is the document, record, bill or reply the task asks for or results in.",
    "verifies": "The task requires checking, reviewing or reconciling it.",
    "follow_up": "It is a request, chaser, reply or reminder about the same piece of work.",
    "context": "Background that explains why the task exists or what it depends on.",
}
NOBODY = "Nobody outside the firm"

STOP = set("""about after again against also among another because been before being between both
could does doing during each either every from further have having here into itself just more most
must other over same should some such than that their them then there these they this those through
under until very were what when where which while will with within would your client firm matter
sapini justin please regards dear thank thanks request records record date dates page""".split())


def clean(text):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", text or ""))).strip()


def words(text):
    return [w for w in re.findall(r"[a-z][a-z0-9-]{3,}", text.lower()) if w not in STOP]


def day(value):
    try:
        return date.fromisoformat(str(value)[:10]) if value else None
    except ValueError:
        return None


def contact_aliases(contacts, client_id):
    """Alias strings per contact, built from the matter's own contacts (nothing hardcoded)."""
    out = []
    for c in contacts:
        name = c.get("name") or ""
        if c.get("type") == "Person":
            aliases = {c.get("last_name") or name.split()[-1]}
        else:
            distinct = [w for w in re.findall(r"[A-Za-z][\w.'-]+", name)
                        if len(w) > 3 and w.lower() not in STOP | {"inc.", "llc", "pllc", "company", "services",
                                                                     "offices", "associates", "group", "center",
                                                                     "insurance", "medical", "commuter", "york"}]
            aliases = {" ".join(distinct[:2])} if distinct else {name}
        out.append({"id": str(c["id"]), "name": name, "is_client": str(c["id"]) == client_id,
                    "aliases": {a.lower() for a in aliases if a and len(a) > 2}})
    return out


def mentions(text, contacts):
    low = text.lower()
    return {c["id"] for c in contacts if any(a in low for a in c["aliases"])}


def build_items(m, ocr_dir):
    """Every record a task could link to, as {type, id, page, title, date, text}."""
    items = []
    for n in m.get("notes", []):
        items.append({"type": "note", "id": str(n["id"]), "title": n.get("subject") or "",
                      "date": n.get("date") or n.get("created_at"), "text": clean(n.get("detail"))})
    for c in m.get("communications", []):
        items.append({"type": "communication", "id": str(c["id"]), "title": c.get("subject") or "",
                      "date": c.get("received_at") or c.get("date") or c.get("created_at"), "text": clean(c.get("body"))})
    for e in m.get("calendar_entries", []):
        items.append({"type": "calendar_entry", "id": str(e["id"]), "title": e.get("summary") or "",
                      "date": e.get("start_at"), "text": clean(e.get("description"))})
    for x in m.get("expenses", []):
        items.append({"type": "expense", "id": str(x["id"]), "title": (clean(x.get("note")) or "Expense")[:90],
                      "date": x.get("date"), "text": clean(x.get("note"))})
    for t in m.get("tasks", []):
        items.append({"type": "task", "id": str(t["id"]), "title": t.get("name") or "",
                      "date": t.get("due_at"), "text": clean(t.get("description"))})
    names = {str(d["id"]): d.get("name") or "" for d in m.get("documents", [])}
    for f in sorted(ocr_dir.glob("*.json")) if ocr_dir.exists() else []:
        doc = json.loads(f.read_text(encoding="utf-8"))
        doc_id = str(doc["source_id"])
        if doc_id not in names:
            continue
        readable = names[doc_id].rsplit(".", 1)[0].replace("__", " ").replace("-", " ")
        for p in doc["pages"]:
            if p.get("char_count", 0) < 40:
                continue
            items.append({"type": "document", "id": doc_id, "page": p["page"], "title": names[doc_id],
                          "date": None, "text": f"{readable}. {clean(p['text'])}"})
    return items


def score_candidates(task, items, contacts, idf):
    t_text = f"{task['name']} {clean(task.get('description'))}"
    t_words = set(words(t_text))
    t_weight = sum(idf.get(w, 0) for w in t_words) or 1
    t_contacts = {c for c in mentions(t_text, contacts) if not CLIENT_IDS & {c}}
    t_day = day(task.get("due_at"))
    scored = []
    for it in items:
        if it["type"] == "task" and it["id"] == str(task["id"]):
            continue
        text = f"{it['title']} {it['text']}"
        shared = t_words & set(words(text))
        topic = sum(idf.get(w, 0) for w in shared) / t_weight
        it_contacts = mentions(text, contacts)
        shared_contacts = t_contacts & it_contacts
        contact = min(1.0, 0.6 * len(shared_contacts))
        i_day = day(it["date"])
        gap = abs((t_day - i_day).days) if t_day and i_day else None
        near = max(0.0, 1 - gap / DATE_WINDOW_DAYS) if gap is not None else 0.0
        score = 0.5 * min(1.0, topic) + 0.35 * contact + 0.15 * near
        if len(it_contacts) > GENERIC_CONTACTS:
            score *= 0.3
        if score < MIN_SCORE:
            continue
        signals = []
        if shared_contacts:
            signals.append("contact: " + ", ".join(sorted(CONTACT_NAMES[c] for c in shared_contacts)))
        top_words = sorted(shared, key=lambda w: -idf.get(w, 0))[:3]
        if top_words and topic >= 0.15:
            signals.append("topic: " + ", ".join(top_words))
        if gap is not None and gap <= DATE_WINDOW_DAYS:
            signals.append(f"date: {gap} day{'s' if gap != 1 else ''} apart")
        scored.append((score, it, signals))
    scored.sort(key=lambda x: -x[0])
    out, per_doc = [], Counter()
    for score, it, signals in scored:
        if it["type"] == "document":
            if per_doc[it["id"]] >= PAGES_PER_DOC:
                continue
            per_doc[it["id"]] += 1
        out.append((score, it, signals))
        if len(out) >= MAX_CANDIDATES:
            break
    return out


def describe(it):
    kind = {"calendar_entry": "Calendar entry", "communication": "Communication", "note": "Note",
            "expense": "Expense", "task": "Task", "document": "Document"}[it["type"]]
    where = f", page {it['page']}" if it.get("page") else ""
    when = f" ({str(it['date'])[:10]})" if it.get("date") else ""
    return f"{kind}{where}{when}: {it['title']}. {it['text'][:CANDIDATE_CHARS]}"


def ask_jev(jev, task, candidates, parties):
    status = "complete" if task.get("status") == "complete" else "open"
    state = {"task": f"{task['name']} (due {str(task.get('due_at'))[:10]}, {status}). {clean(task.get('description'))}"}
    questions = {
        "waiting": {"type": "noul",
                    "instructions": "Is the next step on this task waiting on someone outside the law firm "
                                    "(a medical provider, the client, an insurer, the court or opposing counsel) "
                                    "rather than on the firm itself?",
                    "criteria": {"true": "Someone outside the firm must act or reply before the task can be done.",
                                 "false": "The firm itself has to act next, or the task is already done."}},
        "waiting_on": {"type": "choice", "instructions": "Who must act next on this task?", "criteria": parties},
    }
    for i, (_, it, _) in enumerate(candidates):
        state[f"candidate_{i}"] = describe(it)
        questions[f"related_{i}"] = {
            "type": "noul",
            "instructions": f"Is candidate_{i} part of doing, scheduling, evidencing or following up this task?",
            "criteria": {"true": "It is about the same piece of work as the task.",
                         "false": "It only shares a name, date or topic with the task."}}
        questions[f"relation_{i}"] = {"type": "choice",
                                      "instructions": f"How does candidate_{i} relate to the task?",
                                      "criteria": RELATIONS}
    return jev.ask(state, questions)["answers"]


def link_task(jev, task, items, contacts, idf, parties):
    candidates = score_candidates(task, items, contacts, idf)
    answers = ask_jev(jev, task, candidates, parties)
    links = []
    for i, (score, it, signals) in enumerate(candidates):
        prob = answers[f"related_{i}"]["noul"]
        if prob < RELATED_MIN:
            continue
        link = {"type": it["type"], "id": it["id"], "relation": answers[f"relation_{i}"]["choice"],
                "related_prob": round(prob, 3), "score": round(score, 3), "signals": signals}
        if it.get("page"):
            link["page"] = it["page"]
        links.append(link)
    links.sort(key=lambda link: -link["related_prob"])
    waiting_prob = answers["waiting"]["noul"]
    party = answers["waiting_on"]["choice"]
    result = {
        "task_id": str(task["id"]),
        "task_name": task["name"],
        "waiting": {"prob": round(waiting_prob, 3), "party": None if party == NOBODY else party},
        "candidates_considered": len(candidates),
        "links": links,
        "model": jev.model,
    }
    (LINKS_DIR / f"task_{task['id']}.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


CLIENT_IDS = set()
CONTACT_NAMES = {}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--force", action="store_true", help="re-link tasks that already have output")
    ap.add_argument("--task-id", action="append", default=[], help="only these tasks (repeatable)")
    ap.add_argument("--workers", type=int, default=6)
    args = ap.parse_args()

    load_env()
    key = os.environ.get("TYPESAFE_API_KEY") or os.environ.get("JEV_API_KEY")
    if not key:
        sys.exit("Need TYPESAFE_API_KEY in .env")
    export = DATA / "clio" / "matter.json"
    if not export.exists():
        sys.exit(f"No {export}. Run: python scripts/export_matter.py")
    m = json.loads(export.read_text(encoding="utf-8"))
    LINKS_DIR.mkdir(parents=True, exist_ok=True)

    client_id = str((m["matter"].get("client") or {}).get("id"))
    contacts = contact_aliases(m.get("contacts", []), client_id)
    CLIENT_IDS.add(client_id)
    CONTACT_NAMES.update({c["id"]: c["name"] for c in contacts})
    roles = {str(r["contact"]["id"]): r.get("description") or "" for r in m.get("relationships", []) if r.get("contact")}
    parties = {NOBODY: "The firm has to act next, or nothing is pending."}
    for c in contacts:
        parties[c["name"]] = "The client." if c["is_client"] else (roles.get(c["id"]) or "A contact on this matter.")

    items = build_items(m, DATA / "ocr")
    df = Counter(w for it in items for w in set(words(f"{it['title']} {it['text']}")))
    idf = {w: math.log((1 + len(items)) / (1 + n)) for w, n in df.items()}

    jev = Jev(key, os.environ.get("JEV_BASE_URL", "https://api.typesafe.ai"), os.environ.get("JEV_MODEL", "jev-latest"))
    tasks = [t for t in m.get("tasks", []) if not args.task_id or str(t["id"]) in args.task_id]
    todo = [t for t in tasks if args.force or not (LINKS_DIR / f"task_{t['id']}.json").exists()]
    print(f"{len(items)} linkable records ({sum(i['type'] == 'document' for i in items)} document pages), "
          f"{len(contacts)} contacts; {len(todo)} of {len(tasks)} tasks to link")

    started, failures = time.time(), 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(link_task, jev, t, items, contacts, idf, parties): t for t in todo}
        for f in as_completed(futures):
            t = futures[f]
            try:
                r = f.result()
                w = r["waiting"]
                who = f" | waiting on {w['party']} ({w['prob']:.2f})" if w["party"] and w["prob"] >= 0.5 else ""
                print(f"  {len(r['links']):>2}/{r['candidates_considered']:<2} links  {t['name'][:70]}{who}")
            except Exception as exc:  # keep going; report at the end
                failures += 1
                print(f"  ! {t['id']} {t['name'][:60]}: {exc}")
    elapsed = time.time() - started
    with USAGE_LOG.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps({"at": datetime.now(timezone.utc).isoformat(), "step": "link_tasks", "jev_calls": jev.calls,
                             "input_tokens": jev.input_tokens, "output_tokens": jev.output_tokens,
                             "failures": failures, "seconds": round(elapsed, 1)}) + "\n")
    print(f"{jev.calls} Jev calls, {jev.input_tokens} in / {jev.output_tokens} out tokens, "
          f"{failures} failures, {elapsed:.1f}s -> {LINKS_DIR}")


if __name__ == "__main__":
    main()
