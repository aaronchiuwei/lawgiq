# Clio case documents → JSON

Downloads every document attached to a Clio matter and converts it to JSON text.

1. **`fetch_documents.py`** lists the matter's documents through the Clio API v4 and downloads each file.
2. **`extract_text.py`** parses each file:
   - [PyMuPDF](https://pymupdf.readthedocs.io) reads the text layer of PDFs.
   - [Tesseract](https://github.com/tesseract-ocr/tesseract) OCR reads scanned pages, pages that are mostly images, and image files (JPG/PNG/TIFF).

Everything runs locally. Only the Clio API is contacted.

## Setup (one time)

Run these from the `clio_ingest/` folder:

```bash
brew install tesseract
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env   # then fill in CLIO_TOKEN and MATTER_ID
```

### Getting a Clio access token

1. In Clio, go to **Settings → Developer Applications → Add**. Give it read-only permissions and the redirect URI `http://127.0.0.1:8080/callback`. Copy the **App Key** and **App Secret**.
2. Open this URL in a browser, click **Allow**, and copy the `code=` value from the address bar:
   `https://app.clio.com/oauth/authorize?response_type=code&client_id=APP_KEY&redirect_uri=http://127.0.0.1:8080/callback`
3. Exchange the code right away, because it expires within minutes:
   ```bash
   curl -X POST https://app.clio.com/oauth/token -d client_id="APP_KEY" -d client_secret="APP_SECRET" -d grant_type=authorization_code -d code="CODE" -d redirect_uri=http://127.0.0.1:8080/callback
   ```
4. Put the `access_token` (valid for 30 days) and `refresh_token` into `.env`.

The matter ID is the number in the matter's URL in the Clio dashboard.

## Run

```bash
.venv/bin/python fetch_documents.py
.venv/bin/python extract_text.py
```

Re-running `fetch_documents.py` skips files that are already downloaded.

## Output

Files are written to the repo's `data/` folder:

```
data/<MATTER_ID>/
  documents.json                  manifest: Clio document id, name, folder, size, local file (created by fetch)
  documents/<Clio folder>/*.pdf   original files
  documents_text/<Clio folder>/*.json
  documents_text/_all_documents.json
```

Each text JSON has `full_text`, plus a `pages` list. Each page records its `method` (`embedded_text`, `ocr`, or `embedded_text+ocr`), its `text`, any `ocr_text` read from images on the page, and `image_count`/`image_coverage`. OCR can misread characters, so check exact figures against the PDF.

`.env` is gitignored because it holds your Clio credentials. Never commit it.

