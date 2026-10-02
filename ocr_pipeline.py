"""Pull every document on a Clio matter and extract per-page text into data/ocr/{document_id}.json.

Clio access is READ ONLY: only GET requests are made (see clio_client.py).

Usage:
  python ocr_pipeline.py                 # matter from MATTER_ID in .env, else search "Sapini"
  python ocr_pipeline.py --limit 1       # smallest working run: one document
  python ocr_pipeline.py --doc-id 123    # just these documents (repeatable)
  python ocr_pipeline.py --force         # reprocess documents that already have output
"""
import argparse
import json
import os
import pathlib
import sys
import time

from dotenv import load_dotenv

import ocr_extract
from clio_client import Clio

ROOT = pathlib.Path(__file__).resolve().parent
RAW_DIR = ROOT / "data" / "raw"
OCR_DIR = ROOT / "data" / "ocr"
DOC_FIELDS = "id,name,created_at,size,content_type"


def find_matter_id(clio, query):
    rows = clio.get_all("matters.json", {"query": query, "fields": "id,display_number,description"})
    if not rows:
        sys.exit(f"No Clio matter matches {query!r}")
    if len(rows) > 1:
        print(f"  {len(rows)} matters match {query!r}; using {rows[0]['display_number']}")
    return rows[0]["id"]


def process(clio, doc, matter_id, force):
    """Download one document and write its OCR JSON. Returns the per-page list, or None if skipped."""
    out = OCR_DIR / f"{doc['id']}.json"
    if out.exists() and not force:
        return None
    raw = RAW_DIR / f"{doc['id']}.pdf"
    if force or not raw.exists() or raw.stat().st_size != doc.get("size"):
        clio.download(doc["id"], raw)
    try:
        pages = ocr_extract.extract_pages(raw)
    except Exception as exc:  # not a readable PDF: record one failed page so triage still sees it
        print(f"  could not open {doc['name']}: {exc}")
        pages = [{"page": 1, "text": "", "method": "failed", "char_count": 0}]
    record = {
        "source_type": "document",
        "source_id": str(doc["id"]),
        "name": doc["name"],
        "matter_id": str(matter_id),
        "created_at": doc["created_at"],
        "pages": pages,
    }
    out.write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")
    return pages


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--matter-id", help="Clio matter id (default: MATTER_ID from .env)")
    ap.add_argument("--query", default="Sapini", help="matter search when no id is given")
    ap.add_argument("--doc-id", action="append", default=[], help="only process these document ids")
    ap.add_argument("--limit", type=int, help="process at most N documents (smallest first)")
    ap.add_argument("--force", action="store_true", help="reprocess documents that already have output")
    args = ap.parse_args()

    load_dotenv(ROOT / ".env")
    if not os.getenv("CLIO_TOKEN"):
        sys.exit("Set CLIO_TOKEN in .env (see .env.example)")
    print("tesseract:", ocr_extract.configure_tesseract())
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    OCR_DIR.mkdir(parents=True, exist_ok=True)

    clio = Clio()
    matter_id = args.matter_id or os.getenv("MATTER_ID") or find_matter_id(clio, args.query)
    docs = clio.get_all("documents.json", {"matter_id": matter_id, "fields": DOC_FIELDS})
    if args.doc_id:
        docs = [d for d in docs if str(d["id"]) in set(args.doc_id)]
    docs.sort(key=lambda d: d.get("size") or 0)
    if args.limit:
        docs = docs[: args.limit]
    print(f"matter {matter_id}: {len(docs)} documents to consider\n")

    stats = {"processed": 0, "skipped": 0, "pages": 0, "text_layer": 0, "tesseract": 0, "failed": 0}
    failures = []
    start = time.time()
    for n, doc in enumerate(docs, 1):
        t = time.time()
        try:
            pages = process(clio, doc, matter_id, args.force)
        except Exception as exc:  # download or write error: note it and move on
            failures.append(f"{doc['id']} {doc['name']}: {exc}")
            print(f"[{n}/{len(docs)}] FAILED {doc['name']}: {exc}")
            continue
        if pages is None:
            stats["skipped"] += 1
            print(f"[{n}/{len(docs)}] skip   {doc['name']} (already processed; --force to redo)")
            continue
        stats["processed"] += 1
        stats["pages"] += len(pages)
        for p in pages:
            stats[p["method"]] = stats.get(p["method"], 0) + 1
            if p["method"] == "failed":
                failures.append(f"{doc['id']} {doc['name']} page {p['page']}")
        ocr = sum(p["method"] == "tesseract" for p in pages)
        print(f"[{n}/{len(docs)}] {len(pages):>3} pages ({ocr} OCR) {time.time() - t:5.1f}s  {doc['name']}")

    print("\nSummary")
    print(f"  documents: {len(docs)} ({stats['processed']} processed, {stats['skipped']} skipped)")
    print(f"  pages processed: {stats['pages']}")
    print(f"    text layer: {stats['text_layer']}")
    print(f"    needed OCR (tesseract): {stats['tesseract']}")
    print(f"    failed: {stats['failed']}")
    print(f"  failures: {len(failures)}")
    for f in failures:
        print(f"    - {f}")
    print(f"  Clio GET requests: {clio.requests}; {time.time() - start:.1f}s")
    print(f"  output: {OCR_DIR}")


if __name__ == "__main__":
    main()
