"""Build the Lane-importer TSV from the vendored Perseus TEI volumes.

Reads only the local XML, never the network, so the extraction rule can be tuned
and re-run without re-downloading (CLAUDE.md §11). Output feeds
``import-lane --source perseus-lane``.

Two guards, both learned the expensive way in phase 20: an empty index raises
instead of writing an empty TSV and printing success, and every root that yields
no gloss is *reported*, never silently dropped -- a stranded root leaves the card
empty while the run claims success.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from scraper.lane_gloss import extract_gloss
from scraper.sources.lane_tei import build_index, lookup, lookup_key

_SHORT_GLOSS = 12  # chars; see review_rows
_REJECTS = Path(__file__).with_name("lane_rejects.txt")
# Every source that credits Lane. A root already carrying one is not a gap, and
# re-deriving it would re-import over text a human already accepted.
_LANE_SOURCES = ("lane", "qurandev-lane", "perseus-lane")


def build_rows(
    index: dict[str, str], targets: list[str]
) -> tuple[list[tuple[str, str]], list[tuple[str, str]], dict[str, int]]:
    """(rows, quarantined, stats). Raises on an empty index."""
    if not index:
        raise ValueError("empty Lane index -- run `fetch-lane-tei` first")

    rows: list[tuple[str, str]] = []
    quarantined: list[tuple[str, str]] = []
    stats = {"total": len(targets), "not_in_lane": 0, "no_gloss": 0, "kept": 0}
    for bw in targets:
        entry = lookup(index, bw)
        if entry is None:
            stats["not_in_lane"] += 1
            quarantined.append((bw, "not_in_lane"))
            continue
        gloss = extract_gloss(entry)
        if not gloss:
            stats["no_gloss"] += 1
            quarantined.append((bw, "no_gloss"))
            continue
        # Both output files are delimiter-separated with no quoting, so a tab or
        # newline does not corrupt one row -- it shifts every column after it,
        # and `import-lane` splits on the first tab, landing one root's text on
        # another. `extract_gloss` collapses whitespace today, which is exactly
        # why this is checked rather than assumed. Raise rather than escape: a
        # delimiter here means the extractor is wrong upstream, and quietly
        # rewriting the text would hide that.
        if any(ch in gloss for ch in "\t\n\r"):
            raise ValueError(f"gloss for {bw!r} contains a TSV delimiter")
        rows.append((bw, gloss))
    stats["kept"] = len(rows)
    return rows, quarantined, stats


def review_rows(
    index: dict[str, str],
    rows: list[tuple[str, str]],
    quarantined: list[tuple[str, str]],
) -> list[tuple[str, str, str, str]]:
    """``(root, status, via_key, gloss)`` for the human gate.

    ``via_key`` is empty when the root matched its own key and names the key
    otherwise, so the 38 rows that resolved through one of Lane's collapsed
    spellings -- the ones that can carry a neighbouring root's definition -- are
    the only non-empty cells, and Task 5 Step 3 is a scan rather than a re-read
    of 36 volumes.

    Status ``kept_short`` is the second signal. "No empty glosses" is not a
    safety property here: an extractor that picks the wrong entry block yields
    something short and plausible, not nothing (نطق once came out as "bar"), and
    when the match is direct there is no ``via_key`` to point at it. The
    threshold is set just above the shortest genuine glosses in the set
    (``setting``, ``He wrote``), so the flagged rows stay a handful to eyeball.
    """
    out: list[tuple[str, str, str, str]] = []
    for bw, gloss in rows:
        key = lookup_key(index, bw)
        status = "kept_short" if len(gloss) < _SHORT_GLOSS else "kept"
        out.append((bw, status, "" if key == bw else key or "", gloss))
    out.extend((bw, why, "", "") for bw, why in quarantined)
    return out


def load_rejects(path: Path = _REJECTS) -> set[str]:
    """Roots a human gate rejected, from ``lane_rejects.txt``. See that file."""
    lines = path.read_text(encoding="utf-8").splitlines()
    return {
        line.split("\t", 1)[0].strip()
        for line in lines
        if line.strip() and not line.startswith("#")
    }


def load_targets(
    db_path: Path, rejects: set[str] | None = None, *, refresh: bool = False
) -> list[str]:
    """Roots holding no Lane definition and not hand-rejected, most-used first.

    ``import-lane`` upserts, so a root that already has Lane text must not be a
    target: re-deriving it would overwrite an accepted definition with whatever
    the extractor says today. That is why the filter names every Lane source,
    not just the one this phase started from.

    ``refresh`` deliberately re-opens that door for this tool's own rows, so an
    extractor improvement can be carried to the roots already imported. It never
    touches ``lane``/``qurandev-lane``, which came from another importer, and
    never resurrects a rejected root. Diff the output against the live rows and
    re-run the human gate before importing a refresh.
    """
    sources = tuple(s for s in _LANE_SOURCES if not (refresh and s == "perseus-lane"))
    placeholders = ", ".join("?" * len(sources))
    # S608 is suppressed, not dodged: the only interpolated value is
    # `placeholders`, built one line above out of `?` and `,` from a module
    # constant's *length*. No caller value reaches the SQL text -- the sources
    # are bound, which is the whole reason the placeholder count is dynamic.
    query = f"""SELECT r.root_buckwalter FROM roots r
                WHERE NOT EXISTS (
                    SELECT 1 FROM root_definitions d
                    WHERE d.root_id = r.id AND d.source IN ({placeholders}))
                ORDER BY r.occurrence_count DESC"""  # noqa: S608
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        rows = conn.execute(query, sources).fetchall()
    finally:
        conn.close()
    skip = load_rejects() if rejects is None else rejects
    return [row[0] for row in rows if row[0] not in skip]


def load_imported_roots(db_path: Path, source: str = "perseus-lane") -> set[str]:
    """Roots this tool already imported -- exactly what ``--refresh`` re-opens."""
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        return {
            row[0]
            for row in conn.execute(
                """SELECT r.root_buckwalter FROM roots r
                   JOIN root_definitions d ON d.root_id = r.id
                   WHERE d.source = ?""",
                (source,),
            )
        }
    finally:
        conn.close()


def stale_rows(db_path: Path, rows: list[tuple[str, str]]) -> list[str]:
    """Live rows a ``--refresh`` no longer re-derives, so importing leaves them.

    ``import-lane`` only upserts. A root that stops yielding a gloss is counted
    under ``no_gloss`` and omitted from the TSV, which reads as "dropped" -- but
    its old, no-longer-reproducible definition stays live and the run still
    reports success. Naming them is what makes the drift visible; removing them
    is a DELETE the operator runs deliberately, not a side effect of a rebuild.
    """
    return sorted(load_imported_roots(db_path) - {bw for bw, _gloss in rows})


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("xml_dir", type=Path, help="Vendored TEI volumes")
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--review", type=Path, required=True, help="human review TSV")
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="also re-derive roots this tool already imported (see load_targets)",
    )
    args = parser.parse_args()

    index = build_index(args.xml_dir)
    rows, quarantined, stats = build_rows(
        index, load_targets(args.db, refresh=args.refresh)
    )
    with args.out.open("w", encoding="utf-8") as handle:
        for bw, gloss in rows:
            handle.write(f"{bw}\t{gloss}\n")
    review = review_rows(index, rows, quarantined)
    with args.review.open("w", encoding="utf-8") as handle:
        handle.write("root\tstatus\tvia_key\tgloss\n")
        for bw, status, via_key, gloss in review:
            handle.write(f"{bw}\t{status}\t{via_key}\t{gloss}\n")
    if args.refresh and (stale := stale_rows(args.db, rows)):
        print(
            f"WARNING: {len(stale)} live perseus-lane row(s) no longer "
            f"re-derive; import-lane cannot remove them, so the old text stays "
            f"live until you DELETE it: {', '.join(stale)}"
        )
    short = sum(1 for _bw, status, _k, _g in review if status == "kept_short")
    print(
        f"Lane TEI -> TSV: {stats['kept']} kept of {stats['total']} targets "
        f"({stats['not_in_lane']} not in Lane, {stats['no_gloss']} no gloss, "
        f"{short} kept_short to eyeball) -> {args.out}; review {args.review}"
    )


if __name__ == "__main__":
    main()
