"""Persist raw scraped HTML so re-parsing never requires a re-fetch.

CLAUDE.md §11 asks for this. It was not happening for root pages, which is
why diagnosing the single-form parser gap in Phase 17 needed live requests.
"""

from __future__ import annotations

import gzip
import string
from pathlib import Path

# Everything outside this set is percent-encoded. Uppercase is deliberately
# excluded: Buckwalter separates roots by letter case alone (t/T, d/D, s/S,
# z/Z, h/H, y/Y), which is 137 collision groups across the 1642 real roots --
# on a case-insensitive filesystem (APFS, NTFS) each group would collapse to
# one file and silently lose the rest of the archive.
_SAFE = frozenset(string.ascii_lowercase + string.digits + "-_.")


def _encode_key(key: str) -> str:
    """Percent-encode ``key`` into a case-insensitively unique filename.

    Reversible via ``urllib.parse.unquote``. Encoding beats character
    stripping because Buckwalter roots use ``$ ' > < & } *`` -- stripping
    would collide ``$El`` with ``'El``.
    """
    return "".join(
        c if c in _SAFE else "".join(f"%{b:02X}" for b in c.encode("utf-8"))
        for c in key
    )


def save_snapshot(root_dir: str | Path, key: str, html: str) -> Path:
    """Write ``html`` to ``<root_dir>/<encoded key>.html.gz``. Overwrites."""
    d = Path(root_dir)
    d.mkdir(parents=True, exist_ok=True)
    path = d / f"{_encode_key(key)}.html.gz"
    with gzip.open(path, "wt", encoding="utf-8") as fh:
        fh.write(html)
    return path
