"""Convert qurandev/roots ``meanings.json`` → Lane-importer TSV.

Source: https://github.com/qurandev/roots  (branch ``master``)
  data/meanings.json — array of {"RootCode": <buckwalter>, "Meanings": <english>}.
  Content is Lane's Lexicon (public domain, d. 1876) hand-compiled per root; the
  repo itself ships no LICENSE, so credit both Lane and qurandev/roots in-app.

Fetch the raw file (not committed — third-party data artifact); the raw URL is
``raw.githubusercontent.com/qurandev/roots/master/data/meanings.json``.

The file is Windows-1252 encoded (curly quotes as 0x92). ``RootCode`` is
Buckwalter and maps 1:1 onto ``roots.root_buckwalter``. We filter to roots that
already exist in the target DB so vocalized proper-noun codes (e.g.
``<iboraAhiym``) never get created as junk triliteral roots, drop empty
meanings, and strip trailing Lane apparatus (see :func:`clean_meaning`).
Output feeds ``import-lane --source qurandev-lane``.
"""

from __future__ import annotations

import html
import json
import re
import sqlite3
from pathlib import Path

# Source meanings carry inline Lane's-Lexicon apparatus after the English gloss:
# grammar-form labels ("taraka vb. (I) perf. act."), verse-reference lists
# ("2:17, 2:180"), Lane citations ("Lane's Lexicon, Volume 1, pages: 341"),
# short-cites ("LL, V7, p:194"), and next-root bleed ("= Ta-Siin-Ayn (tasa'a)").
# We cut at the earliest apparatus marker, keeping only the leading gloss.
# Proven safe by spike: real 1-word glosses (orphan/milk/city) survive; entries
# that are pure apparatus (no English gloss) cut to empty and are dropped.
_POS = (
    r"(?:n\.f\.|n\.m\.|n\.vb\.|vb\.|adj\.|pcple\.|perf\.|impf\.|impv\.|pass\.|act\.)"
)
_APPARATUS_MARKERS = [
    # lemma immediately followed by a POS/form label (anchored so a bare gloss
    # word is never mistaken for a lemma): "taraka vb.", "juz n.m."
    re.compile(r"(?:^|\s)\S+\s+" + _POS),
    re.compile(r"\b\d{1,3}:\d{1,3}\b"),  # verse ref "2:17"
    re.compile(r"\s*[-—]?\s*Lane'?s\s+Lexicon"),  # full Lane citation
    re.compile(r"\s*=\s*[A-Z][a-z]+-[A-Z][a-z]+-[A-Z][a-z]+"),  # next-root bleed
    re.compile(r"\bLL,\s*V\d"),  # short-cite "LL, V7"
]


def clean_meaning(meaning: str) -> str:
    """Strip trailing Lane apparatus, keeping only the leading English gloss.

    Source meanings carry raw HTML entities (``&quot;``, ``&nbsp;``, ``&#1584;``)
    that would otherwise reach the DB and render literally in the UI, so they are
    decoded first and the resulting whitespace (incl. NBSP) re-collapsed, matching
    ``scraper.lane_gloss._plain``.

    Returns the gloss up to the earliest apparatus marker (or the whole string
    if none), trimmed of dangling punctuation. Apparatus-only meanings return
    "" and are dropped by :func:`build_rows`.
    """
    meaning = " ".join(html.unescape(meaning).split())
    starts = [m.start() for r in _APPARATUS_MARKERS if (m := r.search(meaning))]
    cut = meaning[: min(starts)] if starts else meaning
    return cut.strip(" ,.;:-—")


def build_rows(
    raw: bytes, valid_roots: set[str]
) -> tuple[list[tuple[str, str]], dict[str, int]]:
    """Decode + filter + clean meanings.json bytes to (buckwalter, def) rows.

    Keeps rows whose RootCode is in ``valid_roots`` and whose meaning is
    non-empty after apparatus-cleaning. Returns (rows, stats) where stats
    explains what was dropped.
    """
    entries = json.loads(raw.decode("cp1252"))
    rows: list[tuple[str, str]] = []
    stats = {
        "total": len(entries),
        "empty": 0,
        "unknown_root": 0,
        "apparatus_only": 0,
        "duplicate": 0,
        "kept": 0,
    }
    seen: set[str] = set()
    for e in entries:
        bw = (e.get("RootCode") or "").strip()
        definition = (e.get("Meanings") or "").strip()
        # collapse internal whitespace/newlines so the TSV stays one line per root
        definition = " ".join(definition.split())
        if not definition:
            stats["empty"] += 1
            continue
        if bw not in valid_roots:
            stats["unknown_root"] += 1
            continue
        definition = clean_meaning(definition)
        if not definition:  # was pure apparatus, no real gloss
            stats["apparatus_only"] += 1
            continue
        if bw in seen:  # meanings.json has no dups today; count if it ever does
            stats["duplicate"] += 1
            continue
        seen.add(bw)
        rows.append((bw, definition))
    stats["kept"] = len(rows)
    return rows, stats


def load_valid_roots(db_path: Path) -> set[str]:
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        return {r[0] for r in conn.execute("SELECT root_buckwalter FROM roots")}
    finally:
        conn.close()


def main() -> None:
    import argparse

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("input", type=Path, help="path to meanings.json")
    ap.add_argument("--db", type=Path, required=True, help="DB to filter roots against")
    ap.add_argument("--out", type=Path, required=True, help="output TSV path")
    args = ap.parse_args()

    rows, stats = build_rows(args.input.read_bytes(), load_valid_roots(args.db))
    with args.out.open("w", encoding="utf-8") as fh:
        for bw, definition in rows:
            fh.write(f"{bw}\t{definition}\n")
    print(
        f"qurandev/roots → TSV: {stats['kept']} kept "
        f"({stats['total']} total, {stats['empty']} empty, "
        f"{stats['unknown_root']} not-a-DB-root, "
        f"{stats['apparatus_only']} apparatus-only, "
        f"{stats['duplicate']} duplicate) → {args.out}"
    )


if __name__ == "__main__":
    main()
