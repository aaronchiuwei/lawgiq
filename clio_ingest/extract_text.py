"""Step 2: turn every downloaded document into JSON text, using OCR where needed.

Parsing:
  - PDFs are read with PyMuPDF. Pages with a real text layer use it directly.
  - Pages with almost no text (scans) are rendered and read with Tesseract OCR.
  - Pages with text that are largely covered by images also get OCR, so text
    inside the images is kept.
  - Image files (JPG, PNG, TIFF) are read with Tesseract OCR directly.
Photos with no writing in them (injury photos, X-rays) have nothing to OCR.

Writes data/<MATTER_ID>/documents_text/<folder>/<file>.json per document,
plus _all_documents.json with everything combined.

Usage:
    .venv/bin/python extract_text.py
"""
import io
import json

import pymupdf
import pytesseract
from PIL import Image

import clio

MIN_TEXT_CHARS = 50        # fewer characters than this on a page = treat it as a scan
MIN_IMAGE_COVERAGE = 0.3   # pages with text whose images cover this much also get OCR
OCR_DPI = 300
IMAGE_TYPES = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".gif"}


def image_coverage(page):
    """Fraction of the page area covered by embedded images (scans, photos, stamps)."""
    page_area = abs(page.rect) or 1
    covered = 0
    for img in page.get_images(full=True):
        for rect in page.get_image_rects(img[0]):
            covered += abs(rect & page.rect)
    return min(covered / page_area, 1.0)


def ocr_page(page):
    pix = page.get_pixmap(dpi=OCR_DPI)
    return pytesseract.image_to_string(Image.open(io.BytesIO(pix.tobytes("png")))).strip()


def extract_pdf(path):
    pages = []
    with pymupdf.open(path) as pdf:
        for number, page in enumerate(pdf, start=1):
            embedded = page.get_text().strip()
            coverage = image_coverage(page)
            entry = {"page": number, "image_count": len(page.get_images()),
                     "image_coverage": round(coverage, 2)}
            if len(embedded) < MIN_TEXT_CHARS:
                # Scanned page: the whole page is an image, OCR is the only source of text
                ocr_text = ocr_page(page)
                use_ocr = len(ocr_text) > len(embedded)
                entry.update(method="ocr" if use_ocr else "embedded_text",
                             text=ocr_text if use_ocr else embedded)
            elif coverage >= MIN_IMAGE_COVERAGE:
                # Real text plus a sizeable image: keep the text and OCR the image content too
                entry.update(method="embedded_text+ocr", text=embedded, ocr_text=ocr_page(page))
            else:
                entry.update(method="embedded_text", text=embedded)
            pages.append(entry)
    return pages


def extract_image(path):
    with Image.open(path) as img:
        text = pytesseract.image_to_string(img).strip()
    return [{"page": 1, "image_count": 1, "image_coverage": 1.0, "method": "ocr", "text": text}]


(matter_id,) = clio.require("MATTER_ID")
out_dir = clio.matter_dir(matter_id)
manifest_file = out_dir / "documents.json"
if not manifest_file.exists():
    raise SystemExit(f"No {manifest_file}; run fetch_documents.py first")
manifest = [m for m in json.loads(manifest_file.read_text()) if not m["status"].startswith("ERROR")]

text_dir = out_dir / "documents_text"
combined = []
for i, doc in enumerate(manifest, start=1):
    path = out_dir / doc["file"]
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        pages = extract_pdf(path)
    elif suffix in IMAGE_TYPES:
        pages = extract_image(path)
    else:
        print(f"[{i}/{len(manifest)}] {doc['file']}: skipped (unsupported type {suffix})")
        continue
    ocr_pages = sum(1 for p in pages if "ocr" in p["method"])
    record = {
        "clio_document_id": doc["id"],
        "name": doc.get("name"),
        "file": doc["file"],
        "folder": path.parent.name,
        "page_count": len(pages),
        "ocr_pages": ocr_pages,
        "pages_with_images": sum(1 for p in pages if p["image_count"]),
        "full_text": "\n\n".join(
            "\n".join(t for t in (p["text"], p.get("ocr_text")) if t) for p in pages
        ),
        "pages": pages,
    }
    out = text_dir / path.parent.name / f"{path.stem}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(record, indent=2, ensure_ascii=False))
    combined.append(record)
    print(f"[{i}/{len(manifest)}] {doc['file']}: {len(pages)} page(s), {ocr_pages} OCR", flush=True)

text_dir.mkdir(parents=True, exist_ok=True)
(text_dir / "_all_documents.json").write_text(json.dumps(combined, indent=2, ensure_ascii=False))
print(f"\nSaved {len(combined)} JSON files to {text_dir} (combined: _all_documents.json)")
