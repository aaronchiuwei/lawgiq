"""Per-page text extraction: PyMuPDF text layer first, Tesseract fallback for scanned pages."""
import io
import os
import shutil

import pymupdf
import pytesseract
from PIL import Image

MIN_TEXT_CHARS = 50
OCR_DPI = 300
_WINDOWS_DEFAULT = r"C:\Program Files\Tesseract-OCR\tesseract.exe"


def configure_tesseract():
    """Point pytesseract at the binary: TESSERACT_CMD env var, then PATH, then the Windows default."""
    cmd = os.getenv("TESSERACT_CMD") or shutil.which("tesseract")
    if not cmd and os.path.exists(_WINDOWS_DEFAULT):
        cmd = _WINDOWS_DEFAULT
    if not cmd:
        raise RuntimeError("Tesseract not found; install it or set TESSERACT_CMD in .env")
    pytesseract.pytesseract.tesseract_cmd = cmd
    return cmd


def ocr_page(page):
    pix = page.get_pixmap(dpi=OCR_DPI)
    img = Image.open(io.BytesIO(pix.tobytes("png")))
    return pytesseract.image_to_string(img)


def extract_pages(pdf_path):
    """Return [{"page", "text", "method", "char_count"}] with 1-based page numbers."""
    pages = []
    with pymupdf.open(pdf_path) as doc:
        for i, page in enumerate(doc, start=1):
            try:
                text = page.get_text().strip()
                method = "text_layer"
                if len(text) < MIN_TEXT_CHARS:
                    text = ocr_page(page).strip()
                    method = "tesseract"
            except Exception as exc:  # keep going; one bad page shouldn't sink the document
                print(f"  page {i} failed: {exc}")
                text, method = "", "failed"
            pages.append({"page": i, "text": text, "method": method, "char_count": len(text)})
    return pages
