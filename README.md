# Lawgiq

Swans x Law Di Gras 2026 Applied AI Hackathon, Clio Manage track.

An AI case dashboard for a personal-injury firm. It digests one Clio Manage matter (Sapini) for three audiences: the firm (what matters most, what is due), the client's treating medical providers (only what is safe to share) and the client.

Clio is read only: every script issues GET requests only. Nothing about the case is in this repo. All data comes from the live Clio account through the Python pipeline and is stored locally under `data/` (gitignored).

## Pipeline

```
Clio (GET) ──► scripts/export_matter.py ──► data/clio/matter.json    matter, contacts, notes, emails, tasks, calendar, expenses, documents
          ├──► ocr_pipeline.py          ──► data/ocr/{document_id}.json  per-page text, page numbers kept
          └──► scripts/triage.py        ──► data/triage/*.json        Jev scores for every entry
                                                └──► Next.js app (lib/clio/pipeline.ts)
```

1. **`scripts/export_matter.py`**: writes the matter's raw Clio records to `data/clio/matter.json`. The dashboard's Sync button re-runs it.
2. **`ocr_pipeline.py`**: downloads every document on the matter to `data/raw/`, reads each page's text layer with PyMuPDF, and OCRs pages with under 50 characters at 300 DPI with Tesseract. Writes one JSON per document: `source_type, source_id, name, matter_id, created_at, pages[{page, text, method, char_count}]`. Skips finished documents unless `--force`; `--limit N` / `--doc-id` run a subset.
3. **`scripts/triage.py`**: sends every note, communication, task, calendar entry and document (with its OCR text) to Jev and asks four constrained questions: category (8 choices), impact (5-level ladder), urgency (4-level ladder), and whether it is shareable with a treating provider. For documents Jev also picks the document's own date from date spans found in the text. Importance = 0.75 × impact + 0.25 × urgency; share at ≥ 0.90, review at ≥ 0.50. Results are cached; `--force` re-scores.

The app normalises `data/clio/matter.json`, attaches Jev scores to each timeline event (they add to the rules-based significance score in `lib/derive/rank.ts`), and shows each document's OCR text in the source drawer.

## Run

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # plus Tesseract: brew install tesseract
cp .env.example .env                     # fill in CLIO_TOKEN, MATTER_ID, TYPESAFE_API_KEY
.venv/bin/python scripts/export_matter.py   # Clio records -> data/clio
.venv/bin/python ocr_pipeline.py            # Clio documents -> data/ocr
.venv/bin/python scripts/triage.py          # Jev triage -> data/triage
npm install
npm run dev                                 # open http://localhost:3000
npm test                                    # derive + access tests, run against data/
```

`python scripts/jev_test.py` is an optional one-call Jev smoke test.

## The app

A visual digest of the matter at `/` (the Front Page), with a Firm, Medical provider and Client view cut by a role-scoped access layer on the server.

- `/` is the firm view; `/?role=provider&provider=<id>` and `/?role=client` are the other roles. "Brief me" walkthrough and a light/dark toggle are in the masthead.
- `/p/<token>` is the open-tracked link a provider receives when the attorney shares.
- `/api/view?role=provider&provider=<id>` returns the exact payload a provider's browser gets. Use it to check the access boundary.

See [DECISIONS.md](DECISIONS.md) for the design record. Screenshots are in [docs/screens](docs/screens) (`node scripts/capture.mjs` regenerates them; `node scripts/smoke.mjs` drives real input on every role view).

Optional settings in `.env` (Next.js reads it too):

| Variable | Purpose |
| --- | --- |
| `CLIO_APP_BASE` | Base for deep links into the Clio web app (default `https://app.clio.com`). |
| `ANTHROPIC_API_KEY` | Enables the cached AI digest (Claude Opus 5.5). Without it the rules engine writes the summary. |
| `DATASET_TODAY` | Pin "today" for demos and tests (e.g. `2026-10-02`). |
| `PIPELINE_DATA_DIR` | Read pipeline output from somewhere other than `data/`. |
| `PIPELINE_PYTHON` | Python used by the Sync button (default `.venv/bin/python`, else `python3`). |

## Layout

```
clio_client.py, ocr_*.py, scripts/*.py   the data pipeline (GET-only Clio, OCR, Jev triage)
lib/clio/      reads data/ (pipeline.ts) and normalises raw Clio records (normalise.ts)
lib/derive/    KPIs, task buckets, SOL, deadlines, timeline merge + ranking, treatment gaps,
               specials, liability, scorecard, conflicts, rules digest
lib/access/    role-scoped selectors: firm, provider (allowlisted + attorney toggles), client
lib/ai/        optional Claude digest, cached per data hash
lib/db/        SQLite: snapshots, digests, last-opened, provider visibility, sharing log, photos
lib/server/    the one entry point pages call: load, derive, select by role
components/case/        trust layer (source chips + drawer), sync, role switcher, shared viz
components/front-page/  the UI; it only consumes selector output
tests/                 derive and access tests
ui/                    legacy Python preview dashboard (python ui/dashboard.py, http://127.0.0.1:8765)
```
