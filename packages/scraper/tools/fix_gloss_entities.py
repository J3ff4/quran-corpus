"""Decode raw HTML entities left in ``root_definitions.definition``.

The qurandev/roots importer used to write source text through unmodified, so
entities (``&quot;``, ``&nbsp;``, ``&#1584;``) reached the DB and rendered
literally in the UI ("denote the meaning &quot;a little&quot;"). The importer
now decodes them (see :func:`tools.prepare_qurandev_roots.clean_meaning`); this
repairs rows already imported.

Scoped to ``source = 'qurandev-lane'``: the trailing-punctuation trim below is
that importer's convention (no qurandev gloss ends in punctuation), and is wrong
for other sources — ``hanswehr`` glosses legitimately end in ``s.th.``/``e.g.``
and its own extractor never strips ``.`` for that reason.

Apparatus-cleaning is *not* re-applied — that would re-cut glosses on markers
that only made sense against the raw source (it alters one live row). Only
decoding, whitespace collapse, and the trailing-punctuation trim run here. The
trim can drop a terminal ``.`` (7 rows did), which is deliberate: it matches
what a re-import through ``clean_meaning`` now produces.

Idempotent in practice: ``html.unescape`` decodes one level, so text that was
double-encoded (``&amp;quot;``) would still hold an entity and change again on a
second run. No such row exists; ordinary rows converge after one pass.

Dry-run by default; ``--apply`` writes.
"""

from __future__ import annotations

import argparse
import html
import sqlite3
from pathlib import Path

SOURCE = "qurandev-lane"


def clean(definition: str) -> str:
    """Decode entities, re-collapse whitespace, trim dangling punctuation."""
    return " ".join(html.unescape(definition).split()).strip(" ,.;:-—")


def find_rows(conn: sqlite3.Connection) -> list[tuple[int, str, str, str]]:
    """Return (id, root_buckwalter, old, new) for every row needing repair."""
    rows = conn.execute(
        "SELECT rd.id, r.root_buckwalter, rd.definition "
        "FROM root_definitions rd JOIN roots r ON r.id = rd.root_id "
        "WHERE rd.source = ? ORDER BY rd.id",
        (SOURCE,),
    ).fetchall()
    out = []
    for rid, bw, old in rows:
        # Gate on decoding, not on a regex: html.unescape is the authority on
        # what is an entity (it also decodes semicolon-less "&nbsp", which a
        # strict pattern misses), and rows with nothing to decode are left
        # alone — so the punctuation trim can never touch an already-clean row.
        if html.unescape(old) == old:
            continue
        new = clean(old)
        if new != old:
            out.append((rid, bw, old, new))
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--db", type=Path, required=True)
    ap.add_argument("--apply", action="store_true", help="write (default: dry-run)")
    args = ap.parse_args()

    # rw (not the default create-if-missing) so a wrong --db fails loudly
    # instead of silently creating an empty DB — apps/web/quran.db is a symlink
    # and packages/scraper/quran.db is a stale stub, so mistyping it is easy.
    mode = "?mode=rw" if args.apply else "?mode=ro"
    conn = sqlite3.connect(f"file:{args.db}{mode}", uri=True)
    try:
        rows = find_rows(conn)
        for _rid, bw, old, new in rows:
            print(f"{bw}\n  - {old}\n  + {new}")
        if args.apply and rows:
            conn.executemany(
                "UPDATE root_definitions SET definition = ? WHERE id = ?",
                [(new, rid) for rid, _bw, _old, new in rows],
            )
            conn.commit()
        print(f"\n{len(rows)} rows {'updated' if args.apply else 'would change'}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
