"""Download the KFGQPC page layout, one JSON per mushaf page.

Read-only against a public API, resumable, and deliberately dumb: it writes
whatever the API returns and validates nothing. Parsing and validation live in
mushaf_layout.py so a re-parse never needs a re-fetch (CLAUDE.md §11).
"""

from collections.abc import Iterable
from pathlib import Path

import httpx

USER_AGENT = "quran-corpus-pwa/0.1 (mushaf layout import; joeclaap@gmail.com)"

LAYOUT_URL = (
    "https://api.quran.com/api/v4/verses/by_page/{page}"
    "?words=true"
    "&word_fields=code_v1,code_v2,line_number,page_number,text_uthmani,"
    "text_qpc_hafs,char_type_name,position"
    "&per_page=300"
)

PAGE_MIN, PAGE_MAX = 1, 604


def fetch_layout(dest: Path, pages: Iterable[int], client: httpx.Client) -> list[int]:
    """Write `{page:03d}.json` for each page not already on disk. Returns the
    pages actually fetched, so a resumed run reports what it did rather than
    what it was asked for."""
    dest.mkdir(parents=True, exist_ok=True)
    written: list[int] = []
    for page in pages:
        if not PAGE_MIN <= page <= PAGE_MAX:
            raise ValueError(f"page {page} outside {PAGE_MIN}..{PAGE_MAX}")
        path = dest / f"{page:03d}.json"
        if path.exists() and path.stat().st_size > 0:
            continue
        response = client.get(
            LAYOUT_URL.format(page=page),
            headers={"User-Agent": USER_AGENT},
            timeout=60,
        )
        response.raise_for_status()
        path.write_text(response.text, encoding="utf-8")
        written.append(page)
    return written
