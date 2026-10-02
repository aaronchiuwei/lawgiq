"""Step 1: download every document attached to a Clio matter.

Saves files to data/<MATTER_ID>/documents/<Clio folder>/ and a manifest
(documents.json) mapping each file back to its Clio document. Files already
downloaded are skipped, so re-running only fetches new documents.

Usage:
    .venv/bin/python fetch_documents.py
"""
import json

import clio

DOC_FIELDS = "id,name,filename,content_type,size,created_at,updated_at,received_at,parent{id,name}"


def safe(name):
    return "".join(c if c.isalnum() or c in " ._-()" else "_" for c in name).strip()


token, matter_id = clio.require("CLIO_TOKEN", "MATTER_ID")
out_dir = clio.matter_dir(matter_id)
docs_dir = out_dir / "documents"
docs_dir.mkdir(parents=True, exist_ok=True)

documents = clio.get_all("/documents.json", matter_id=matter_id, fields=DOC_FIELDS)
print(f"Matter {matter_id}: {len(documents)} document(s)")

manifest = []
for i, doc in enumerate(documents, start=1):
    folder = safe((doc.get("parent") or {}).get("name") or "unfiled")
    filename = safe(doc.get("filename") or doc.get("name") or str(doc["id"]))
    dest = docs_dir / folder / filename
    if any(m["file"] == str(dest.relative_to(out_dir)) for m in manifest):
        dest = dest.with_name(f"{doc['id']}_{filename}")
    dest.parent.mkdir(parents=True, exist_ok=True)

    if dest.exists() and dest.stat().st_size == doc.get("size"):
        status = "skipped (already downloaded)"
    else:
        try:
            clio.download_document(doc["id"], dest)
            status = "downloaded"
        except Exception as e:
            status = f"ERROR: {e}"
    manifest.append({**doc, "file": str(dest.relative_to(out_dir)), "status": status})
    print(f"[{i}/{len(documents)}] {folder}/{filename}: {status}", flush=True)

(out_dir / "documents.json").write_text(json.dumps(manifest, indent=2))
failed = sum(1 for m in manifest if m["status"].startswith("ERROR"))
print(f"\nDone: {len(manifest) - failed} ok, {failed} failed. Manifest: {out_dir / 'documents.json'}")
