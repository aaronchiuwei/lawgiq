"""Local preview dashboard: Jev triage results + OCR pages + live Clio detail.

Clio access is READ ONLY (GET requests via clio_client). Nothing is hardcoded:
entries come from Jev's data/triage output, document text from data/ocr, and
note/communication/task/calendar text from the live Clio matter.

  python ui/dashboard.py [--triage-dir PATH] [--port 8765]
"""
import argparse
import json
import os
import pathlib
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from dotenv import load_dotenv  # noqa: E402

from clio_client import Clio  # noqa: E402

UI_DIR = ROOT / "ui"
OCR_DIR = ROOT / "data" / "ocr"
RAW_DIR = ROOT / "data" / "raw"

DETAIL_SOURCES = [  # (source_type, endpoint, fields, text builder)
    ("note", "notes.json", "id,subject,detail,date", lambda r: r.get("detail") or ""),
    ("communication", "communications.json", "id,subject,body,date,type",
     lambda r: r.get("body") or ""),
    ("task", "tasks.json", "id,name,description,due_at,status",
     lambda r: "\n".join(x for x in [r.get("description") or "",
                                     f"Due: {r.get('due_at') or 'none'} | Status: {r.get('status')}"] if x)),
    ("calendar_entry", "calendar_entries.json", "id,summary,description,start_at,end_at,location",
     lambda r: "\n".join(x for x in [r.get("description") or "",
                                     f"When: {r.get('start_at')} to {r.get('end_at')}",
                                     f"Where: {r.get('location')}" if r.get("location") else ""] if x)),
]


def load_clio_detail():
    """Fetch the matter and entry text from Clio once at startup. Returns (matter, {(type, id): text})."""
    load_dotenv(ROOT / ".env")
    matter_id = os.getenv("MATTER_ID")
    if not os.getenv("CLIO_TOKEN") or not matter_id:
        print("No CLIO_TOKEN/MATTER_ID in .env; entries will show titles only")
        return {}, {}
    clio, detail = Clio(), {}
    matter = clio.get(f"matters/{matter_id}.json", {"fields": "id,display_number,description,status,open_date"})["data"]
    for kind, path, fields, text in DETAIL_SOURCES:
        params = {"matter_id": matter_id, "fields": fields}
        if kind == "note":
            params["type"] = "Matter"  # Clio requires Matter or Contact
        try:
            for r in clio.get_all(path, params):
                detail[(kind, str(r["id"]))] = text(r)
        except Exception as exc:  # one failing endpoint shouldn't stop the preview
            print(f"  ! {kind}: {exc}")
    print(f"Clio: detail for {len(detail)} entries ({clio.requests} GET requests)")
    return matter, detail


def load_entries(triage_dir, detail):
    entries = []
    for p in sorted(triage_dir.glob("*.json")):
        r = json.loads(p.read_text(encoding="utf-8"))
        key = (r["source_type"], str(r["source_id"]))
        if r["source_type"] == "document":
            ocr = OCR_DIR / f"{r['source_id']}.json"
            if ocr.exists():
                pages = json.loads(ocr.read_text(encoding="utf-8"))["pages"]
                r["page_count"] = len(pages)
                r["ocr_pages"] = sum(p["method"] == "tesseract" for p in pages)
                r["text"] = pages[0]["text"][:600] if pages else ""
        else:
            r["text"] = detail.get(key, "")
        entries.append(r)
    entries.sort(key=lambda r: r.get("importance_score", 0), reverse=True)
    return entries


def make_handler(matter, entries):
    payload = json.dumps({"matter": matter, "entries": entries}).encode()

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=str(UI_DIR), **kw)

        def log_message(self, *a):
            pass

        def send_json(self, body, status=200):
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            path = self.path.split("?")[0]
            if path == "/api/entries":
                return self.send_json(payload)
            if path.startswith("/api/doc/"):
                f = OCR_DIR / f"{pathlib.Path(path).name}.json"
                return self.send_json(f.read_bytes()) if f.exists() else self.send_error(404)
            if path.startswith("/raw/"):
                f = RAW_DIR / pathlib.Path(path).name
                if not f.exists():
                    return self.send_error(404)
                data = f.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "application/pdf")
                self.send_header("Content-Disposition", f'inline; filename="{f.name}"')  # show in the iframe, don't download
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                return self.wfile.write(data)
            return super().do_GET()

    return Handler


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--triage-dir", default=str(ROOT / "data" / "triage"))
    ap.add_argument("--port", type=int, default=8765)
    args = ap.parse_args()
    triage_dir = pathlib.Path(args.triage_dir)
    if not triage_dir.exists():
        sys.exit(f"No triage output at {triage_dir}; run python scripts/triage.py first or pass --triage-dir")
    matter, detail = load_clio_detail()
    entries = load_entries(triage_dir, detail)
    print(f"{len(entries)} triaged entries from {triage_dir}")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(matter, entries))
    print(f"Dashboard: http://127.0.0.1:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
