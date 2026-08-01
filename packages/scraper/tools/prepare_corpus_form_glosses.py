"""Snapshot archive -> Lane-importer TSV of root definitions.

Reads the root snapshots phase 18 archived (**no network**), extracts each
root's per-form lexical glosses, and joins them into one definition string per
root. Output feeds the *existing* ``import-lane --source corpus-forms``; there
is deliberately no second importer (§3 DRY).

The glosses are the short lexical senses corpus.quran.com prints beside each
derived form's POS header -- see :mod:`scraper.sources.corpus_form_glosses`.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from pathlib import Path

from scraper.snapshots import iter_root_snapshot_paths, read_snapshot
from scraper.sources.corpus_form_glosses import FormGloss, parse_form_glosses
from tools.prepare_qurandev_roots import load_valid_roots


def iter_root_glosses(snapshot_dir: Path) -> Iterator[tuple[str, list[FormGloss]]]:
    """Yield ``(root_buckwalter, glosses)`` for every root snapshot, key-sorted.

    Reading goes through :mod:`scraper.snapshots`, which owns both the key
    namespace and the filename encoding (``ظلم`` is ``Zlm``, stored as
    ``root_%5Alm`` -- uppercase is escaped because ``z``/``Z`` are ز and ظ, two
    unrelated roots that a case-insensitive filesystem would otherwise merge).
    Decoding it here instead would fork that rule, and would lose
    ``iter_snapshot_paths``' de-duplication: one root can own both a legacy and
    a canonical filename, and ``%`` sorts before ``A``, so a plain name-sorted
    walk yields the stale legacy copy last and lets it win the upsert.

    A damaged snapshot raises rather than being skipped. This tool feeds an
    importer, so a silently short TSV is worse than a stopped run.
    """
    for bw, path in iter_root_snapshot_paths(snapshot_dir):
        yield bw, parse_form_glosses(read_snapshot(path))


def join_glosses(glosses: list[FormGloss]) -> str:
    """One definition string per root: distinct senses, document order.

    Form labels are dropped. ``root_definitions`` is keyed per root, and the
    derived-form breakdown is already on the page as its own chips, so
    repeating it inside the definition text duplicates what the UI shows.

    Senses are de-duplicated because separate forms often share one: نصر has
    form I and form VI both glossed "to help", which would otherwise print
    twice in a row.

    De-duplication is per comma-separated sense, not per whole gloss string:
    the corpus writes one form as "to turn away, to avert, to hinder" and a
    later one as bare "to hinder", which an exact-string test keeps and the
    reader sees as an unexplained repetition (8 such senses across the 155
    roots this produces). A gloss is dropped only when *every* one of its
    senses has already been printed, so "to announce, to declare" survives
    after "to announce, to proclaim" -- it still carries a new sense.

    Plain substring containment would be the shorter test and is wrong: it
    drops "permission" because "to ask permission" was printed, and "to see"
    because of "to be made to see". Those are distinct senses.
    """
    seen: set[str] = set()
    out: list[str] = []
    for g in glosses:
        senses = [s.strip() for s in g.gloss.split(",") if s.strip()]
        if not senses or all(s in seen for s in senses):
            continue
        seen.update(senses)
        out.append(g.gloss)
    return "; ".join(out)


def load_defless_roots(db_path: Path, refresh_source: str | None = None) -> set[str]:
    """Roots with no ``root_definitions`` row at all.

    With ``refresh_source``, also roots whose *every* definition already came
    from that source. Without it this tool is a one-shot: the rows a first run
    imports are exactly what the default filter then excludes, so a second run
    finds nothing to fill and (before the empty-output guard in
    :func:`build_rows`) wrote an empty TSV and printed success. Regenerating
    after a parser fix -- which is how the 7 pre-dedup definitions in the live
    DB were corrected -- had no path that did not involve hand-editing rows.

    Roots that also hold a definition from another source stay excluded even
    under ``refresh_source``: re-importing one would sit a corpus gloss beside
    a Lane entry, the exact promotion option (b) exists to prevent.

    Read-only, like :func:`load_valid_roots` which this complements -- a
    preparation tool must never be able to write to the live DB.
    """
    sql = (
        "SELECT r.root_buckwalter FROM roots r "
        "LEFT JOIN root_definitions rd ON rd.root_id = r.id "
        "WHERE rd.id IS NULL"
    )
    params: tuple[str, ...] = ()
    if refresh_source is not None:
        # Inner join, so the group is never empty; SUM(source <> ?) = 0 means
        # every row in it is that source and nothing else.
        sql += (
            " UNION SELECT r.root_buckwalter FROM roots r "
            "JOIN root_definitions rd ON rd.root_id = r.id "
            "GROUP BY r.id HAVING SUM(rd.source <> ?) = 0"
        )
        params = (refresh_source,)
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        return {r[0] for r in conn.execute(sql, params)}
    finally:
        conn.close()


def build_rows(
    snapshot_dir: Path,
    valid_roots: set[str],
    only_roots: set[str] | None = None,
    must_yield: set[str] | None = None,
) -> tuple[list[tuple[str, str]], dict[str, int]]:
    """Snapshots -> ``(buckwalter, definition)`` rows, plus drop statistics.

    Filters to roots already in the DB. ``import_lane_definitions`` calls
    ``get_or_create_root``, so an unrecognised Buckwalter key does not fail --
    it silently inserts a root the corpus never had. The filter is the only
    thing standing between a stray snapshot filename and a junk root, which is
    why ``unknown_root`` is a counted statistic rather than a silent skip.

    ``only_roots`` narrows to a chosen subset (the definition-less set) without
    a second code path.

    ``must_yield`` names roots that already hold a definition this run is
    regenerating, and raises unless every one of them ends up in the output.
    ``import_lane_definitions`` only upserts -- it has no delete -- so a root
    that loses its gloss keeps the stale text live on ``/dictionary/<root>``
    and the lemma pages, while the run prints a success line and counts it
    under ``no_gloss``, which cannot tell "never had one" from "had one, lost
    it". Not hypothetical: tightening the parser is exactly what the per-sense
    de-duplication did, and a further tightening that empties a root would
    otherwise pass silently. Raising leaves the operator to delete the row or
    fix the parser; the alternative is a definition on the site that no source
    still supports.

    The test is what *reached* the output, not what took the empty-gloss
    branch. A root only reaches that branch if the archive still holds its
    snapshot and it passes ``valid_roots``; ``must_yield`` is derived from the
    DB while the archive is an independent untracked directory, so the two
    diverge with no error and a root whose snapshot went missing would
    otherwise strand exactly the definition this guard exists to catch.

    Raises when the directory holds no root snapshot at all: the archive is
    nested (``.snapshots/roots``, not ``.snapshots``), so pointing one level too
    high is easy and otherwise writes an empty TSV and reports success.

    Raises on an empty ``valid_roots`` or ``only_roots`` for the same reason:
    a wrong or freshly-created ``--db`` sends every snapshot down the
    ``unknown_root`` (or ``skipped``) branch, which leaves ``total`` non-zero,
    so the empty-archive guard above never fires and the run again writes an
    empty TSV and prints success.
    """
    if not valid_roots:
        raise ValueError("no roots in the DB to filter against -- wrong --db?")
    if only_roots is not None and not only_roots:
        raise ValueError("no definition-less roots to fill -- nothing to do")
    rows: list[tuple[str, str]] = []
    fulfilled: set[str] = set()
    stats = {"total": 0, "unknown_root": 0, "no_gloss": 0, "skipped": 0, "kept": 0}
    for bw, glosses in iter_root_glosses(snapshot_dir):
        stats["total"] += 1
        if bw not in valid_roots:
            stats["unknown_root"] += 1
            continue
        if only_roots is not None and bw not in only_roots:
            stats["skipped"] += 1
            continue
        definition = join_glosses(glosses)
        if not definition:
            stats["no_gloss"] += 1
            continue
        # The output is delimiter-separated with no quoting, so a literal tab or
        # newline does not corrupt one row -- it shifts every column after it,
        # and `import-lane` splits on the first tab, so one root's text lands on
        # another root. Today `join_glosses` cannot produce either, and that is
        # exactly why this is asserted rather than assumed: the check costs
        # nothing and the joiner is free to change. Raise rather than escape --
        # a delimiter here means the parser is wrong upstream, and quietly
        # rewriting the text would hide that.
        if any(ch in definition for ch in "\t\n\r"):
            raise ValueError(f"definition for {bw!r} contains a TSV delimiter")
        rows.append((bw, definition))
        fulfilled.add(bw)
        stats["kept"] += 1
    if stats["total"] == 0:
        raise ValueError(f"no root snapshots under {snapshot_dir}")
    lost = sorted(must_yield - fulfilled) if must_yield is not None else []
    if lost:
        raise ValueError(
            f"{len(lost)} root(s) being regenerated produced no definition this "
            f"run (snapshot missing, filtered out, or now parsing empty), and "
            f"the importer cannot delete: {', '.join(lost)}"
        )
    # Every candidate was filtered or gloss-less. Reachable with a healthy
    # archive and a healthy DB -- re-running in the default mode after an
    # import leaves only the 101 roots the corpus publishes no gloss for -- and
    # it used to write an empty TSV over a good one and print a success line.
    if not rows:
        raise ValueError(
            f"no definitions to write ({stats['total']} snapshots read, "
            f"{stats['skipped']} already defined, {stats['no_gloss']} gloss-less)"
        )
    return rows, stats


def main() -> None:
    import argparse

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--snapshots", required=True, type=Path, help="snapshot dir")
    ap.add_argument("--db", required=True, type=Path, help="DB to filter roots against")
    ap.add_argument("--out", required=True, type=Path, help="output TSV path")
    # Opt *in* to the wide run, not out of it. The default restricts to roots
    # with no definition at all, which is the phase 20 decision: fill the gaps,
    # never sit a corpus gloss beside a Lane entry. Defaulting the other way
    # made the unsafe run the one you get by forgetting a flag -- and it does
    # not fail loudly, because `import-lane` upserts on (root_id, source), so
    # it just quietly adds a second definition card to ~814 already-covered
    # roots. Nothing in the TSV records which mode produced it.
    ap.add_argument(
        "--all",
        action="store_true",
        help="emit every root, including ones that already have a definition",
    )
    # Regeneration path. Named after the source rather than a bare --refresh so
    # the widening is stated: it re-emits roots this tool already filled, and
    # nothing else. `import-lane` upserts on (root_id, source), so the re-import
    # overwrites those rows in place instead of adding a card.
    ap.add_argument(
        "--refresh",
        metavar="SOURCE",
        help="also re-emit roots whose only definitions came from SOURCE",
    )
    args = ap.parse_args()

    if args.all and args.refresh:
        ap.error("--all already emits every root; --refresh narrows nothing")

    only = None if args.all else load_defless_roots(args.db, args.refresh)
    # The roots --refresh widened the filter by: the ones that already hold a
    # definition, and so are the ones a now-empty parse would strand. Set
    # difference rather than a third query shape -- the widening is defined as
    # exactly this difference, so deriving it cannot drift from it.
    regenerating = None
    if args.refresh and only is not None:
        regenerating = only - load_defless_roots(args.db)
    rows, stats = build_rows(
        args.snapshots, load_valid_roots(args.db), only, regenerating
    )
    with args.out.open("w", encoding="utf-8") as fh:
        for bw, definition in rows:
            fh.write(f"{bw}\t{definition}\n")
    print(
        f"corpus form glosses -> TSV: {stats['kept']} kept "
        f"({stats['total']} total, {stats['no_gloss']} no-gloss, "
        f"{stats['unknown_root']} not-a-DB-root, "
        f"{stats['skipped']} already defined) -> {args.out}"
    )


if __name__ == "__main__":
    main()
