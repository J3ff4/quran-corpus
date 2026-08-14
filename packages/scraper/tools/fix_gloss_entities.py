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
that only made sense against the raw source (it alters one live row). Decoding,
whitespace collapse, the trailing-punctuation trim and
:func:`~scraper.sources.lane.normalize_slash_spacing` run here, which is the rest
of what a re-import applies (``clean_meaning`` then ``import_lane_definitions``).
The trim can drop a terminal ``.`` (7 rows did), which is deliberate: it matches
what a re-import now produces.

Rows the importer would refuse are reported, never repaired, because
``import-lane`` only upserts — nothing would take a bad row back out afterwards.
Delete those instead (``scraper prune-definitions``). Two cases:

* **Markup** (:data:`~tools.prepare_qurandev_roots._MARKUP`), checked both raw
  and decoded. Raw, because this tool rewrites a row in place and never re-cuts
  apparatus, so markup already stored is corruption nothing downstream removes —
  unlike the importer, which judges only the cleaned string because its cut may
  discard the offending tail. Decoded, because decoded is what gets *written* —
  an entity-escaped ``&lt;b&gt;`` passes the raw check and would put real markup
  into the DB. Decoding is also what disguises the damage: ``*kw``'s ``&#1584;``
  becomes real Arabic and the junk starts reading as a gloss.
* **Decodes to empty** (e.g. a definition that is only ``&nbsp;``). ``build_rows``
  drops those as ``apparatus_only`` and ``import_lane_definitions`` skips them, so
  writing ``''`` would produce a state no import can reach — and a blank gloss in
  the UI hides the problem that visible entity noise at least advertised.

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

from scraper.sources.lane import normalize_slash_spacing
from tools.prepare_qurandev_roots import _MARKUP, _TRIM, decode_collapse

SOURCE = "qurandev-lane"


def clean(definition: str) -> str:
    """Reproduce what a re-import writes: decode, collapse, trim, space slashes.

    Borrows ``decode_collapse`` and the trim set from the importer rather than
    restating them — the contract here is "what a re-import would write", so a
    change there must not leave this behind.
    """
    return normalize_slash_spacing(decode_collapse(definition).strip(_TRIM))


def find_rows(
    conn: sqlite3.Connection,
) -> tuple[list[tuple[int, str, str, str]], list[tuple[str, str, str]]]:
    """Split repairable rows from unrepairable ones.

    Returns ``(repairs, unrepairable)`` — ``repairs`` is (id, buckwalter, old,
    new) for every row whose entities decode to something different,
    ``unrepairable`` is (buckwalter, definition, reason) for rows the importer
    would drop outright rather than write.
    """
    rows = conn.execute(
        "SELECT rd.id, r.root_buckwalter, rd.definition "
        "FROM root_definitions rd JOIN roots r ON r.id = rd.root_id "
        "WHERE rd.source = ? ORDER BY rd.id",
        (SOURCE,),
    ).fetchall()
    out = []
    unrepairable = []
    for rid, bw, old in rows:
        # Judged raw: nothing here cuts apparatus, so stored markup stays stored.
        if _MARKUP.search(old):
            unrepairable.append((bw, old, "markup"))
            continue
        # Gate on decoding, not on a regex: html.unescape is the authority on
        # what is an entity (it also decodes semicolon-less "&nbsp", which a
        # strict pattern misses), and rows with nothing to decode are left
        # alone — so the punctuation trim can never touch an already-clean row.
        if html.unescape(old) == old:
            continue
        new = clean(old)
        # Re-checked on the decoded text: that is what would be written.
        if _MARKUP.search(new):
            unrepairable.append((bw, old, "markup after decoding"))
            continue
        if not new:
            unrepairable.append((bw, old, "decodes to empty"))
            continue
        if new != old:
            out.append((rid, bw, old, new))
    return out, unrepairable


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
        rows, unrepairable = find_rows(conn)
        for _rid, bw, old, new in rows:
            print(f"{bw}\n  - {old}\n  + {new}")
        for bw, old, reason in unrepairable:
            print(f"{bw}\n  ! {reason} — not repairable, prune this row: {old}")
        if args.apply and rows:
            conn.executemany(
                "UPDATE root_definitions SET definition = ? WHERE id = ?",
                [(new, rid) for rid, _bw, _old, new in rows],
            )
            conn.commit()
        print(
            f"\n{len(rows)} rows {'updated' if args.apply else 'would change'}, "
            f"{len(unrepairable)} skipped as unrepairable"
        )
    finally:
        conn.close()


if __name__ == "__main__":
    main()
