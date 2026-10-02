"""Small Clio API v4 client: .env loading, authenticated GETs with paging, file downloads."""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).parent
DATA_DIR = ROOT.parent / "data"
BASE = "https://app.clio.com/api/v4"
TIMEOUT = 120  # seconds per request, so a stuck download can't hang the run


def load_env():
    """Load KEY=value lines from .env; values already exported in the shell take priority."""
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def require(*names):
    load_env()
    missing = [n for n in names if not os.environ.get(n)]
    if missing:
        sys.exit(f"Missing {', '.join(missing)}: add to .env (see .env.example) or export them")
    return [os.environ[n] for n in names]


def matter_dir(matter_id):
    return DATA_DIR / str(matter_id)


def _auth():
    return {"Authorization": f"Bearer {os.environ['CLIO_TOKEN']}"}


def get(path, **params):
    """GET a path (or full URL) and return (status, parsed JSON body)."""
    url = path if path.startswith("http") else f"{BASE}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=_auth())
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            status, raw = resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        status, raw = e.code, e.read().decode()
    if not raw.strip():
        return status, {}
    try:
        return status, json.loads(raw)
    except json.JSONDecodeError:
        return status, {"raw": raw}


def get_all(path, **params):
    """GET a list endpoint and follow meta.paging.next until every record is collected."""
    status, body = get(path, **params)
    if status != 200:
        raise RuntimeError(f"GET {path} failed ({status}): {body}")
    data = list(body.get("data", []))
    next_url = body.get("meta", {}).get("paging", {}).get("next")
    while next_url:
        status, body = get(next_url)
        if status != 200:
            raise RuntimeError(f"GET {next_url} failed ({status}): {body}")
        data.extend(body.get("data", []))
        next_url = body.get("meta", {}).get("paging", {}).get("next")
    return data


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def download_document(doc_id, dest):
    """Clio answers /download with a 303 to a signed file URL; fetch that URL without our token."""
    req = urllib.request.Request(f"{BASE}/documents/{doc_id}/download.json", headers=_auth())
    try:
        urllib.request.build_opener(_NoRedirect).open(req, timeout=TIMEOUT)
        raise RuntimeError("expected a redirect to the file")
    except urllib.error.HTTPError as e:
        location = e.headers.get("Location")
        if e.code not in (301, 302, 303, 307) or not location:
            raise RuntimeError(f"download failed ({e.code})") from None
    with urllib.request.urlopen(location, timeout=TIMEOUT) as resp:
        dest.write_bytes(resp.read())
