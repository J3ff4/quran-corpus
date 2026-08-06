"""Build the Hans Wehr-importer TSV from the vendored HW sqlite.

Reads only the local sqlite, never the network (CLAUDE.md §11). Unlike Lane
and Salmoné, HW is the top gloss for every root it matches, not just a gap
filler -- so the target set is ALL roots (see `load_hanswehr_targets`), and
there is no "unmatched"/"tie" status: `select_gloss` is Form-I-first with no
per-sense corroboration to flag, that was Salmoné's problem.

Same two guards learned in phase 20/21: every root that yields no gloss is
*quarantined*, never silently dropped, and both output files raise on a TSV
delimiter rather than writing corrupt rows.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from scraper.hanswehr_gloss import select_gloss
from scraper.sources.hanswehr import build_index, lookup

# ponytail: reuse salmone's reject loader and its "what counts as nominal"
# constant; extract to a shared module only if salmone tooling is deleted.
from tools.prepare_lane_glosses import load_rejects
from tools.prepare_salmone_glosses import _NOMINAL_TAGS

_REJECTS = Path(__file__).with_name("hanswehr_rejects.txt")
_NOMINAL_THRESHOLD = 0.8


def load_nominal_shares(db_path: Path) -> dict[str, float]:
    """Nominal segment share for every root, in one pass.

    Same measure as ``prepare_salmone_glosses.load_nominal_share`` (fraction of
    a root's word_segments tagged N/ADJ/PN) but a single GROUP BY instead of
    one connection per root. HW targets ALL roots, so the per-root loader would
    open ~1600 connections -- the same waste commit 5c29233 removed for the
    dead form_counts. A root absent from word_segments is absent from the dict;
    callers default it to 0.0 (no evidence -> nominal filter stays off).
    """
    placeholders = ",".join("?" * len(_NOMINAL_TAGS))
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        # S608: the only interpolated text is `placeholders`, built from a
        # constant's length; the tags themselves are bound, not interpolated.
        rows = conn.execute(
            f"""SELECT root, COUNT(*),
                       COUNT(*) FILTER (WHERE pos_tag IN ({placeholders}))
                  FROM word_segments WHERE root IS NOT NULL
                 GROUP BY root""",  # noqa: S608
            _NOMINAL_TAGS,
        ).fetchall()
    finally:
        conn.close()
    return {root: nominal / total for root, total, nominal in rows if total}


def build_rows(
    index: dict[str, list[tuple[int, str]]],
    targets: list[str],
    form_counts: dict[str, dict[str, int]],
    nominal_shares: dict[str, float],
) -> tuple[list[tuple[str, str]], list[tuple[str, str, str]], dict[str, int]]:
    """(rows, quarantined, stats).

    `quarantined` entries are `(root, status, "")` -- already shaped like a
    review row with an empty gloss, so `review_rows` can append them as-is.
    `form_counts` is accepted for interface parity with the Salmoné/Lane
    tools (a future sense-ranking refinement could use it) but `select_gloss`
    does not consult it today; only `nominal_shares` drives the pick.
    """
    rows: list[tuple[str, str]] = []
    quarantined: list[tuple[str, str, str]] = []
    stats = {"total": len(targets), "not_in_hanswehr": 0, "no_gloss": 0, "glossed": 0}
    for bw in targets:
        # Before the lookup, not beside the gloss check below: a quarantined
        # root still reaches review.tsv, so this has to run before either
        # early exit -- same ordering as prepare_salmone_glosses.
        if any(ch in bw for ch in "\t\n\r"):
            raise ValueError(f"root {bw!r} contains a TSV delimiter")
        entries = lookup(index, bw)
        if entries is None:
            stats["not_in_hanswehr"] += 1
            quarantined.append((bw, "not_in_hanswehr", ""))
            continue
        gloss = select_gloss(
            entries, prefer_nominal=nominal_shares.get(bw, 0.0) > _NOMINAL_THRESHOLD
        )
        if gloss is None:
            stats["no_gloss"] += 1
            quarantined.append((bw, "no_gloss", ""))
            continue
        # Both output files are delimiter-separated with no quoting; a tab or
        # newline in the gloss would shift every column after it, and
        # import-lane splits on the first tab, landing one root's text on
        # another. Raise rather than escape -- a delimiter here means
        # `select_gloss` is wrong upstream.
        if any(ch in gloss for ch in "\t\n\r"):
            raise ValueError(f"gloss for {bw!r} contains a TSV delimiter")
        rows.append((bw, gloss))
    stats["glossed"] = len(rows)
    return rows, quarantined, stats


def review_rows(
    rows: list[tuple[str, str]],
    quarantined: list[tuple[str, str, str]],
) -> list[tuple[str, str, str]]:
    """``(root, status, gloss)`` for the human gate: glossed rows are `kept`,
    quarantined rows are already `(root, status, "")` and pass through as-is.
    """
    return [(bw, "kept", gloss) for bw, gloss in rows] + list(quarantined)


def load_hanswehr_targets(db_path: Path, rejects: set[str] | None = None) -> list[str]:
    """Every root with a resolvable Arabic spelling, most-used first, minus rejects.

    Unlike Lane/Salmoné, this is not "roots missing a definition" -- HW
    outranks whatever else a root holds, so the target set is all of them.
    """
    query = """SELECT root_buckwalter FROM roots
               WHERE root_arabic IS NOT NULL
               ORDER BY occurrence_count DESC"""
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        rows = conn.execute(query).fetchall()
    finally:
        conn.close()
    skip = load_rejects(_REJECTS) if rejects is None else rejects
    return [row[0] for row in rows if row[0] not in skip]


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument(
        "--hw", type=Path, required=True, help="vendored Hans Wehr sqlite"
    )
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--review", type=Path, required=True, help="human review TSV")
    args = parser.parse_args()

    index = build_index(args.hw)
    targets = load_hanswehr_targets(args.db)
    nominal_shares = load_nominal_shares(args.db)
    # form_counts stays empty: build_rows accepts it for interface parity with
    # the Salmoné/Lane tools but select_gloss never consults it. Computing it
    # here was ~20k dead per-root DB round-trips (build_rows docstring).
    rows, quarantined, stats = build_rows(index, targets, {}, nominal_shares)
    with args.out.open("w", encoding="utf-8") as handle:
        for bw, gloss in rows:
            handle.write(f"{bw}\t{gloss}\n")
    review = review_rows(rows, quarantined)
    with args.review.open("w", encoding="utf-8") as handle:
        handle.write("root\tstatus\tgloss\n")
        for bw, status, gloss in review:
            handle.write(f"{bw}\t{status}\t{gloss}\n")
    print(
        f"Hans Wehr -> TSV: {stats['glossed']} glossed of {stats['total']} targets "
        f"({stats['not_in_hanswehr']} not in HW, {stats['no_gloss']} no gloss) -> "
        f"{args.out}; review {args.review}"
    )


if __name__ == "__main__":
    main()
