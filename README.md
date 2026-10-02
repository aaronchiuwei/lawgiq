# lawgiq
Swans x Law Di Gras 2026 Applied AI Hackathon

An AI case dashboard for a personal-injury firm. It digests one Clio Manage matter for two audiences:
attorneys (what matters most, what is due) and the client's treating medical providers (only what is safe to share).

Clio is read only: every script issues GET requests only. Nothing about the case is hardcoded; all data comes
from the live Clio account and is stored locally under `data/` (gitignored).

## Pipeline

```
Clio (GET) ──► ocr_pipeline.py ──► data/ocr/{document_id}.json   per-page text, page numbers kept
          └──► scripts/triage.py ──► data/triage/*.json            Jev scores for every entry
                                         └──► ui/dashboard.py      attorney + provider views
```

1. **`ocr_pipeline.py`**: downloads every document on the matter to `data/raw/`, reads each page's text layer
   with PyMuPDF, and OCRs pages with under 50 characters at 300 DPI with Tesseract. Writes one JSON per document:
   `source_type, source_id, name, matter_id, created_at, pages[{page, text, method, char_count}]`.
   Skips finished documents unless `--force`; `--limit N` / `--doc-id` run a subset.
2. **`scripts/triage.py`**: sends every note, communication, task, calendar entry and document (with its OCR text)
   to Jev and asks four constrained questions: category (8 choices), impact (5-level ladder), urgency (4-level ladder),
   and whether it is shareable with a treating provider. For documents Jev also picks the document's own date from
   date spans found in the text. Importance = 0.75 × impact + 0.25 × urgency; share at ≥ 0.90, review at ≥ 0.50.
   Results are cached; `--force` re-scores.
3. **`ui/dashboard.py`**: local web page at http://127.0.0.1:8765 with a ranked attorney view (score breakdown,
   category probabilities, every document page linked to the source PDF) and a provider view (shareable items only).

## Run

```bash
pip install -r requirements.txt          # plus Tesseract: winget install UB-Mannheim.TesseractOCR
cp .env.example .env                     # fill in Clio token, MATTER_ID, TYPESAFE_API_KEY
python ocr_pipeline.py                   # Clio documents -> data/ocr
python scripts/triage.py                 # Jev triage -> data/triage
python ui/dashboard.py                   # open http://127.0.0.1:8765
python scripts/jev_test.py               # optional: one-call Jev smoke test
```

On the Sapini matter: 31 documents, 360 pages (350 text layer, 10 OCR), 173 entries triaged by Jev in about 18 s.
