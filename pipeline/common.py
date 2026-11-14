"""Shared helpers for Fides pipeline scripts.

Every script follows the same pattern:

1. fetch() a public source, politely (identifying User-Agent, a pause between
   requests) and cache-first: the raw response is saved under
   data/raw/<source>/<YYYY-MM-DD>/ and reused if it is already there.
2. Normalize the raw file with a pure function (unit-tested offline).
3. write_json() the normalized result under data/normalized/, including the
   source URL and the retrieval date.

Only the standard library is used for HTTP.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
NORMALIZED_DIR = ROOT / "data" / "normalized"

# Set FIDES_USER_AGENT to something that identifies you (with a contact
# address) when you run the pipeline regularly; data providers appreciate it.
USER_AGENT = os.environ.get("FIDES_USER_AGENT", "public-data-pipeline/0.1 (python-urllib)")

# Seconds to wait between network requests. Never set this to zero.
REQUEST_DELAY = float(os.environ.get("FIDES_REQUEST_DELAY", "2"))

WEST_STATES = ["AZ", "CA", "CO", "NM", "NV", "UT", "WY"]

_last_request = 0.0


def today() -> str:
    """Retrieval date (UTC) used for cache folders and provenance."""
    return dt.datetime.now(dt.timezone.utc).date().isoformat()


def raw_path(source: str, name: str, date: str | None = None) -> Path:
    return RAW_DIR / source / (date or today()) / name


def fetch(url: str, source: str, name: str, *, params: dict | None = None,
          headers: dict | None = None, date: str | None = None,
          timeout: int = 120) -> Path:
    """Download url to the dated raw cache and return the cached path.

    If today's copy already exists it is returned without touching the
    network, so re-running a script on the same day costs the source nothing.
    """
    path = raw_path(source, name, date)
    if path.exists() and path.stat().st_size > 0:
        return path
    if params:
        url = url + ("&" if "?" in url else "?") + urllib.parse.urlencode(params)

    global _last_request
    wait = REQUEST_DELAY - (time.monotonic() - _last_request)
    if wait > 0:
        time.sleep(wait)
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, **(headers or {})})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read()
    finally:
        _last_request = time.monotonic()

    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".part")
    tmp.write_bytes(body)
    tmp.replace(path)
    return path


def write_json(path: Path, obj) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path
