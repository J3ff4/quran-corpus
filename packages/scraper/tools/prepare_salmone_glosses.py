"""Build the Salmoné-importer TSV from the vendored Perseus TEI dictionary.

Reads only the local XML, never the network (CLAUDE.md §11). Output feeds
``import-lane --source salmone``, the value recorded in
``root_definitions.source`` -- see `_SALMONE_SOURCE`.

Same two guards as `prepare_lane_glosses`, learned the expensive way in phase
20: an empty index raises instead of writing an empty TSV and printing
success, and every root that yields no sense is *reported* in `quarantined`,
never silently dropped -- a stranded root leaves the card empty while the run
claims success.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from scraper.salmone_gloss import select_sense
from scraper.sources.salmone import build_index, lookup
from tools.prepare_lane_glosses import load_rejects

_SALMONE_SOURCE = "salmone"  # value import-lane writes to root_definitions.source
_REJECTS = Path(__file__).with_name("salmone_rejects.txt")

_NOMINAL_TAGS = ("N", "ADJ", "PN")
NOMINAL_THRESHOLD = 0.8


def build_rows(
    index: dict[str, str],
    targets: list[str],
    form_counts: dict[str, dict[str, int]],
    nominal_shares: dict[str, float],
) -> tuple[list[tuple[str, str]], list[tuple[str, str, str]], dict[str, int]]:
    """(rows, quarantined, stats). Raises on an empty index.

    `quarantined` is `(root, status, key)` for every root the human gate needs
    to look at, whichever reason. `not_in_salmone` and `no_sense` are roots
    `select_sense` could gloss not at all, so they are absent from `rows`;
    `unmatched` (no corpus form corroborated the pick) and `tie` (the pick came
    down to document order between equally-matched senses) are roots that *did*
    get a gloss and appear in `rows` as well. `key` is Salmoné's entryFree key
    for the sense taken, empty for the two that have no sense. `review_rows`
    turns this into the review TSV the Task 7 gate reads.
    """
    if not index:
        raise ValueError("empty Salmoné index -- run `fetch-salmone` first")

    rows: list[tuple[str, str]] = []
    quarantined: list[tuple[str, str, str]] = []
    # "glossed", not "kept": `kept` is a review *status* meaning "glossed and
    # flagged by nothing", and naming the total that too made `91 glossed
    # (48 unmatched and 4 tied)` read as though 91 rows were unflagged when 39
    # are. One word, one meaning.
    stats = {"total": len(targets), "not_in_salmone": 0, "no_sense": 0, "glossed": 0}
    for bw in targets:
        # Before the lookup, not beside the gloss check below: a root that
        # quarantines still reaches review.tsv through `quarantined`, so the
        # two early exits would carry an unvalidated delimiter straight past a
        # guard that only runs when a gloss was produced.
        if any(ch in bw for ch in "\t\n\r"):
            raise ValueError(f"root {bw!r} contains a TSV delimiter")
        entry = lookup(index, bw)
        if entry is None:
            stats["not_in_salmone"] += 1
            quarantined.append((bw, "not_in_salmone", ""))
            continue
        picked = select_sense(
            entry,
            form_counts.get(bw, {}),
            prefer_nominal=nominal_shares.get(bw, 0.0) > NOMINAL_THRESHOLD,
        )
        if picked is None:
            stats["no_sense"] += 1
            quarantined.append((bw, "no_sense", ""))
            continue
        key, gloss, matched, tied = picked
        # Both output files are delimiter-separated with no quoting, so a tab or
        # newline does not corrupt one row -- it shifts every column after it,
        # and `import-lane` splits on the first tab, landing one root's text on
        # another. `key` is checked too: it comes from a regex capture
        # (`_ENTRY_FREE` in salmone_gloss.py), not a real XML parser, so a
        # literal tab inside the vendored XML's `key="..."` gets no attribute-
        # value normalisation and would otherwise reach review.tsv raw. Raise
        # rather than escape: a delimiter here means the source text is wrong
        # upstream, and quietly rewriting it would hide that. `bw` is column
        # one of both files and is checked at the top of the loop.
        if any(ch in key + gloss for ch in "\t\n\r"):
            raise ValueError(f"gloss for {bw!r} contains a TSV delimiter")
        rows.append((bw, gloss))
        # `unmatched` first: a pick no corpus form matched at all is the weaker
        # signal of the two, and `select_sense` reports `tied` False there
        # anyway, so the two conditions are already disjoint.
        if matched == 0:
            quarantined.append((bw, "unmatched", key))
        elif tied:
            quarantined.append((bw, "tie", key))
    stats["glossed"] = len(rows)
    return rows, quarantined, stats


def review_rows(
    rows: list[tuple[str, str]],
    quarantined: list[tuple[str, str, str]],
) -> list[tuple[str, str, str, str]]:
    """``(root, status, key, gloss)`` for the human gate.

    A root `build_rows` flagged carries that flag's status; every other glossed
    root is ``kept``. ``unmatched`` (Salmoné's leading sense, nothing behind it)
    and ``tie`` (document order broke an equal match) are the review's priority
    queue: measured at 48 and 4 of 91.
    """
    # dict() collapses duplicate keys; safe because `targets` (build_rows's
    # input) holds no duplicate roots, so each root appears in `quarantined`
    # at most once.
    flagged = {bw: (status, key) for bw, status, key in quarantined}
    kept = {bw for bw, _gloss in rows}
    out: list[tuple[str, str, str, str]] = []
    for bw, gloss in rows:
        status, key = flagged.get(bw, ("kept", ""))
        out.append((bw, status, key, gloss))
    out.extend((bw, status, "", "") for bw, status, _k in quarantined if bw not in kept)
    return out


def load_salmone_targets(db_path: Path, rejects: set[str] | None = None) -> list[str]:
    """Roots Salmoné is meant to cover, most-used first.

    Two disjoint groups: roots whose only definition is a `perseus-lane` row --
    the wrong-sense import this phase exists to outrank -- and roots with no
    definition at all. A root already carrying curated Lane or a corpus-forms
    gloss is not a target; see the plan's "Target set" note for why this is not
    every root Salmoné covers.
    """
    query = """SELECT r.root_buckwalter FROM roots r
               WHERE NOT EXISTS (
                   SELECT 1 FROM root_definitions d
                   WHERE d.root_id = r.id AND d.source <> 'perseus-lane')
               ORDER BY r.occurrence_count DESC"""
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        rows = conn.execute(query).fetchall()
    finally:
        conn.close()
    skip = load_rejects(_REJECTS) if rejects is None else rejects
    return [row[0] for row in rows if row[0] not in skip]


def load_form_counts(db_path: Path, bw: str) -> dict[str, int]:
    """Corpus spelling -> occurrences, for `select_sense`'s ranking."""
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        return {
            form: count
            for form, count in conn.execute(
                """SELECT form_buckwalter, COUNT(*) FROM word_segments
                   WHERE root = ? AND form_buckwalter IS NOT NULL
                   GROUP BY form_buckwalter""",
                (bw,),
            )
        }
    finally:
        conn.close()


def load_nominal_share(db_path: Path, bw: str) -> float:
    """Fraction of this root's corpus segments tagged noun, adjective or proper noun.

    Drives `select_sense(prefer_nominal=...)`. A root the Quran uses nominally
    must not be glossed with Salmoné's leading Form I verb; see the plan's
    measurement, 56/96 verb-lead down to 7/96.

    Returns 0.0 for a root with no segments -- absent evidence is not evidence
    of a nominal root, and the filter stays off.
    """
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        placeholders = ",".join("?" * len(_NOMINAL_TAGS))
        # S608 is suppressed, not dodged: the only interpolated value is
        # `placeholders`, built two lines above out of `?` and `,` from a
        # module constant's *length*. No caller value reaches the SQL text --
        # the tags are bound, which is the whole reason the placeholder count
        # is dynamic.
        total, nominal = conn.execute(
            f"""SELECT COUNT(*),
                       COUNT(*) FILTER (WHERE pos_tag IN ({placeholders}))
                  FROM word_segments WHERE root = ?""",  # noqa: S608
            (*_NOMINAL_TAGS, bw),
        ).fetchone()
    finally:
        conn.close()
    return nominal / total if total else 0.0


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("xml_path", type=Path, help="Vendored Salmoné XML")
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--review", type=Path, required=True, help="human review TSV")
    args = parser.parse_args()

    index = build_index(args.xml_path)
    targets = load_salmone_targets(args.db)
    # One pass over the targets, together, so build_rows stays pure and never
    # reaches into the DB itself.
    form_counts = {root: load_form_counts(args.db, root) for root in targets}
    nominal_shares = {root: load_nominal_share(args.db, root) for root in targets}
    rows, quarantined, stats = build_rows(index, targets, form_counts, nominal_shares)
    with args.out.open("w", encoding="utf-8") as handle:
        for bw, gloss in rows:
            handle.write(f"{bw}\t{gloss}\n")
    review = review_rows(rows, quarantined)
    with args.review.open("w", encoding="utf-8") as handle:
        handle.write("root\tstatus\tkey\tgloss\n")
        for bw, status, key, gloss in review:
            handle.write(f"{bw}\t{status}\t{key}\t{gloss}\n")
    unmatched = sum(1 for _bw, status, _k, _g in review if status == "unmatched")
    tied = sum(1 for _bw, status, _k, _g in review if status == "tie")
    print(
        f"Salmoné -> TSV: {stats['glossed']} glossed of {stats['total']} targets "
        f"({stats['not_in_salmone']} not in Salmoné, {stats['no_sense']} no sense, "
        f"{unmatched} unmatched and {tied} tied to eyeball) -> {args.out}; "
        f"review {args.review}"
    )


if __name__ == "__main__":
    main()
