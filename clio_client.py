"""Minimal Clio Manage API v4 client. READ ONLY: this module only ever issues GET requests."""
import os
import time

import requests

API_PATH = "/api/v4"


class Clio:
    def __init__(self, token=None, base_url=None):
        self.token = token or os.environ["CLIO_TOKEN"]
        self.base = (base_url or os.getenv("CLIO_BASE_URL") or "https://app.clio.com").rstrip("/") + API_PATH
        self.session = requests.Session()
        self.session.headers["Authorization"] = f"Bearer {self.token}"
        self.requests = 0

    def _get(self, url, params=None, stream=False, attempts=5):
        for attempt in range(attempts):
            self.requests += 1
            resp = self.session.get(url, params=params, stream=stream, timeout=120)
            if resp.status_code == 429:  # rate limited: honour Retry-After
                time.sleep(int(resp.headers.get("Retry-After", 2 ** attempt)))
                continue
            resp.raise_for_status()
            return resp
        resp.raise_for_status()

    def get(self, path, params=None):
        return self._get(f"{self.base}/{path}", params).json()

    def get_all(self, path, params=None):
        """Follow meta.paging.next links until every record is fetched."""
        rows, url, params = [], f"{self.base}/{path}", dict(params or {}, limit=200)
        while url:
            body = self._get(url, params).json()
            rows += body.get("data", [])
            url = (body.get("meta") or {}).get("paging", {}).get("next")
            params = None  # the next link already carries the query
        return rows

    def download(self, document_id, dest):
        """GET /documents/{id}/download follows Clio's redirect to the file bytes."""
        resp = self._get(f"{self.base}/documents/{document_id}/download", stream=True)
        tmp = f"{dest}.part"
        with open(tmp, "wb") as fh:
            for chunk in resp.iter_content(1 << 16):
                fh.write(chunk)
        os.replace(tmp, dest)
        return os.path.getsize(dest)
