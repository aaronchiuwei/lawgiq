"""Export one Clio matter's records to data/clio/matter.json for the Next.js dashboard.

Clio access is READ ONLY: only GET requests are made (see clio_client.py).

Usage:
  python scripts/export_matter.py                 # matter from MATTER_ID in .env, else search "Sapini"
  python scripts/export_matter.py --matter-id 123

The dashboard (npm run dev) reads this file together with data/triage (scripts/triage.py)
and data/ocr (ocr_pipeline.py). Raw Clio JSON is written as-is; lib/pipeline normalises it.
"""
import argparse
import json
import os
import pathlib
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from dotenv import load_dotenv

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from clio_client import Clio  # noqa: E402

OUT = ROOT / "data" / "clio" / "matter.json"

MATTER_FIELDS = (
    "id,display_number,description,status,open_date,statute_of_limitations{id,due_at,status},"
    "matter_stage{id,name},practice_area{id,name},client{id},"
    "custom_field_values{id,field_name,field_type,value,custom_field}"
)
CONTACT_FIELDS = (
    "id,name,first_name,last_name,type,title,company{name},date_of_birth,"
    "email_addresses{name,address},phone_numbers{name,number},"
    "addresses{name,street,city,province,postal_code}"
)
SECTIONS = {
    "relationships": ("relationships.json", {"fields": "id,description,contact{id}"}),
    "notes": ("notes.json", {"type": "Matter", "fields": "id,subject,detail,date,created_at"}),
    "communications": ("communications.json", {
        "fields": "id,type,subject,body,date,received_at,created_at,senders{id,type},receivers{id,type}"}),
    "tasks": ("tasks.json", {"fields": "id,name,description,due_at,status,statute_of_limitations,created_at"}),
    "calendar_entries": ("calendar_entries.json", {"fields": "id,summary,description,start_at,end_at,created_at"}),
    "expenses": ("activities.json", {"type": "ExpenseEntry", "fields": "id,date,quantity,price,total,note"}),
    "documents": ("documents.json", {"fields": "id,name,received_at,created_at,size,parent{id,name}"}),
}


def find_matter_id(clio, query):
    rows = clio.get_all("matters.json", {"query": query, "fields": "id,display_number,description"})
    if not rows:
        sys.exit(f"No Clio matter matches {query!r}")
    if len(rows) > 1:
        print(f"  {len(rows)} matters match {query!r}; using {rows[0]['display_number']}")
    return rows[0]["id"]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--matter-id", help="Clio matter id (default: MATTER_ID from .env)")
    ap.add_argument("--query", default="Sapini", help="matter search when no id is given")
    args = ap.parse_args()

    load_dotenv(ROOT / ".env")
    if not os.getenv("CLIO_TOKEN"):
        sys.exit("Set CLIO_TOKEN in .env (see .env.example)")
    clio = Clio()
    matter_id = str(args.matter_id or os.getenv("MATTER_ID") or find_matter_id(clio, args.query))

    matter = clio.get(f"matters/{matter_id}.json", {"fields": MATTER_FIELDS})["data"]
    out = {"matter_id": matter_id, "fetched_at": datetime.now(timezone.utc).isoformat(), "matter": matter}

    def section(item):
        name, (path, params) = item
        try:
            return name, clio.get_all(path, {"matter_id": matter_id, **params})
        except Exception as exc:  # one section failing shouldn't sink the export
            print(f"  ! {name}: {exc}")
            return name, []

    with ThreadPoolExecutor(max_workers=4) as pool:
        out.update(dict(pool.map(section, SECTIONS.items())))

    area = matter.get("practice_area")
    out["matter_stages"] = (
        clio.get_all("matter_stages.json", {"practice_area_id": area["id"], "fields": "id,name,order"}) if area else []
    )

    contact_ids = {str(matter["client"]["id"])}
    contact_ids |= {str(r["contact"]["id"]) for r in out["relationships"] if r.get("contact")}
    for c in out["communications"]:
        for p in (c.get("senders") or []) + (c.get("receivers") or []):
            if p.get("type") == "Contact":
                contact_ids.add(str(p["id"]))
    with ThreadPoolExecutor(max_workers=4) as pool:
        out["contacts"] = list(pool.map(
            lambda cid: clio.get(f"contacts/{cid}.json", {"fields": CONTACT_FIELDS})["data"], sorted(contact_ids)))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    counts = ", ".join(f"{k}: {len(v)}" for k, v in out.items() if isinstance(v, list))
    print(f"matter {matter_id} ({matter.get('display_number')}): {counts}")
    print(f"  Clio GET requests: {clio.requests}")
    print(f"  output: {OUT}")


if __name__ == "__main__":
    main()
