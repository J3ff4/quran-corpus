"""Regenerate every Hans Wehr gloss and diff it against a committed baseline.

This is the gate for `hanswehr_gloss.select_gloss`. It replaces the ceiling-based
one in `audit_hanswehr_glosses`, which now only supplies the defect classifiers.

Why the differential and not the buckets: six rounds of review on this extractor
found that the shape buckets caught almost nothing the differential missed, while
the buckets' own ceilings produced two of the bugs. `MAX_HEAD_LEFTOVER = 1`
certified a population nobody had measured -- the real one was ~133 -- and a
tolerance that printed nothing until it tripped made a 98-root quarantine look
identical to a clean run. A per-root baseline cannot have either bug: it is the
list itself, not a count of it, and `git diff` shows every root that moved.

So the buckets survive as a *column*, not a gate. A regex change that reclassifies
a root shows up as a changed line, reviewed like any other diff, instead of a
number on stdout that someone has to notice moved.

The baseline is the artefact reviewers read. `--update` is the only way to move
it, and the resulting 1642-line diff is what a `/code-review` and the CLAUDE.md §5
gate see -- which is the point: it makes the gloss corpus itself reviewable.

**Nothing runs this for you.** It needs `--db` and `--hw` pointing at two local
sqlite files that are deliberately outside the repo, so no pytest case can invoke
it and this repo has no CI. `pytest`, `ruff` and `mypy` all go green on a change
that rewrites a hundred glosses; only this run tells you which ones. A wrapper
that skipped itself when the files were missing would be worse than none -- it
would go green everywhere too, and read like coverage.

Rows are sorted by root, never by occurrence count: the target order comes from
`roots.occurrence_count`, and a re-scrape nudging one count would otherwise
reshuffle the whole file and bury the real change.
"""

from __future__ import annotations

import sys
from collections import Counter
from collections.abc import Sequence
from pathlib import Path

from scraper.sources.hanswehr import build_index
from tools.audit_hanswehr_glosses import _head_leftover, _is_stub, classify
from tools.prepare_hanswehr_glosses import (
    build_rows,
    load_hanswehr_targets,
    load_nominal_shares,
    load_overrides,
    review_rows,
)

BASELINE = Path(__file__).with_name("hanswehr_baseline.tsv")

_HEADER = ("root", "status", "buckets", "gloss")
# An empty bucket set needs a visible token: a bare empty column is invisible in
# a terminal diff and indistinguishable from a truncated row.
_NO_BUCKETS = "-"

# (root, status, buckets, gloss), and the same row keyed by root.
Row = tuple[str, str, str, str]
Fields = tuple[str, str, str]


def buckets_for(gloss: str, root: str) -> str:
    """The defect buckets one gloss lands in, as a sorted comma-joined string.

    `stub` and `head` are added here rather than inside `classify` because they
    are not shape tests -- `head` needs the entry's root, which `classify`
    never sees.
    """
    found = classify(gloss)
    if _is_stub(gloss):
        found.add("stub")
    if _head_leftover(gloss, root):
        found.add("head")
    return ",".join(sorted(found)) or _NO_BUCKETS


def generate(db_path: Path, hw_path: Path) -> list[Row]:
    """Every target root's status, buckets and gloss, sorted by root.

    Delegates the selection loop to `prepare_hanswehr_glosses.build_rows` rather
    than repeating it, so the gate measures exactly what the importer will ship
    -- including its TSV-delimiter guard. The old `audit()` had its own copy of
    that loop and drifted: a root absent from HW was silently skipped there,
    while the importer quarantined it as `not_in_hanswehr`. Here it is a row.

    `load_overrides()` is read for the same reason: a human decision that
    changes a shipped gloss has to move a baseline row, or the gate goes green
    on a corpus it never saw.
    """
    index = build_index(hw_path)
    shares = load_nominal_shares(db_path)
    targets = load_hanswehr_targets(db_path)
    rows, quarantined, _ = build_rows(
        index, targets, {}, shares, overrides=load_overrides()
    )

    out: list[Row] = []
    for row in review_rows(rows, quarantined):
        # Indexed, not unpacked: `review_rows` returns a ragged
        # `tuple[str, ...]` whose extra columns are the human gate's candidate
        # glosses. Rows are 3 wide only because `options` is not passed here,
        # and mypy cannot catch the day that changes -- a variadic tuple
        # unpacks to any arity, so it would fail at runtime, mid-run, after the
        # full HW index build.
        bw, status, gloss = row[0], row[1], row[2]
        buckets = buckets_for(gloss, bw) if gloss else _NO_BUCKETS
        out.append((bw, status, buckets, gloss))
    return sorted(out)


def write(path: Path, rows: list[Row]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        handle.write("\t".join(_HEADER) + "\n")
        for row in rows:
            handle.write("\t".join(row) + "\n")


def read(path: Path) -> dict[str, Fields]:
    """root -> (status, buckets, gloss), validated.

    The baseline is hand-editable and merge-conflict-prone, so every row is
    checked: a dropped column would silently shift a gloss into the buckets
    slot, and a duplicated root would let one line quietly overwrite another --
    both of which read as "no change" against a fresh generation.
    """
    # `split("\n")`, not `splitlines()`: `write` joins on "\n" and `build_rows`
    # rejects only \t, \n and \r, while `splitlines()` also breaks on \v, \f,
    # \x1c-\x1e, \x85 and U+2028/9. A gloss carrying one of those passes the
    # writer's guard, is written as one row and read back as two -- the second
    # failing the column check below and leaving the gate unrunnable until
    # someone hand-edits the file. The source is OCR text, so a stray separator
    # is exactly the input this reader is validated against.
    lines = path.read_text(encoding="utf-8").split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    if not lines or tuple(lines[0].split("\t")) != _HEADER:
        raise ValueError(f"{path}: expected header {'|'.join(_HEADER)}")
    out: dict[str, Fields] = {}
    for number, line in enumerate(lines[1:], start=2):
        fields = line.split("\t")
        # A quarantine row ends "root\tstatus\t-\t" -- an empty gloss, so a
        # trailing tab, on 192 of the committed rows. Any editor, GitHub web
        # edit or whitespace hook that trims line ends turns all 192 into
        # 3-column rows at once and the gate stops running until someone repairs
        # them by hand. Restore the column instead.
        #
        # Gated on the buckets cell rather than on the arity alone, so the check
        # below keeps catching the shape it was written for: a *dropped* column
        # shifts the gloss left into the buckets slot, where it cannot read as
        # `_NO_BUCKETS` -- only a genuinely empty gloss leaves a "-" there.
        if len(fields) == len(_HEADER) - 1 and fields[-1] == _NO_BUCKETS:
            fields.append("")
        if len(fields) != len(_HEADER):
            raise ValueError(
                f"{path}:{number}: expected {len(_HEADER)} columns, got {len(fields)}"
            )
        root, rest = fields[0], (fields[1], fields[2], fields[3])
        if root in out:
            raise ValueError(f"{path}:{number}: duplicate root {root!r}")
        out[root] = rest
    return out


def compare(
    baseline: dict[str, Fields], current: dict[str, Fields]
) -> tuple[list[str], list[str], list[tuple[str, Fields, Fields]]]:
    """(added, removed, changed) roots.

    Added/removed are kept apart from changed because they have a benign cause
    the others do not: the target list comes from the live `roots` table, so a
    re-scrape can legitimately add one. A changed gloss never has that excuse.
    """
    base_roots, current_roots = set(baseline), set(current)
    added = sorted(current_roots - base_roots)
    removed = sorted(base_roots - current_roots)
    changed = [
        (root, baseline[root], current[root])
        for root in sorted(base_roots & current_roots)
        if baseline[root] != current[root]
    ]
    return added, removed, changed


def _describe(root: str, before: Fields, after: Fields) -> list[str]:
    """One `- old` / `+ new` pair per field that moved, field named."""
    lines = []
    for name, was, now in zip(_HEADER[1:], before, after, strict=True):
        if was != now:
            lines.append(f"  {root:10} {name:8} - {was}")
            lines.append(f"  {'':10} {'':8} + {now}")
    return lines


def _report(label: str, total: int, detail: Counter[str] | Sequence[str]) -> None:
    """`label  N  detail`, printed whether or not N is zero."""
    if isinstance(detail, Counter):
        tail = "  ".join(f"{name} {n}" for name, n in sorted(detail.items()))
    else:
        tail = " ".join(detail)
    print(f"{label:9} {total:>5}   {tail}".rstrip())


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument("--hw", type=Path, required=True)
    parser.add_argument("--baseline", type=Path, default=BASELINE)
    parser.add_argument(
        "--update", action="store_true", help="rewrite the baseline from this run"
    )
    parser.add_argument("--show", type=int, default=20, help="changed roots to print")
    args = parser.parse_args()

    # Rejected, not clamped: a negative reaches both a slice bound and a
    # subtraction, so `--show -1` over two changed roots prints one and reports
    # "... 3 more" -- a gate whose diagnostic is wrong in the direction of
    # alarm. Clamping to 0 would silently accept the typo; this is an operator
    # flag, and the only useful answer is to say it is one.
    if args.show < 0:
        parser.error("--show must be >= 0")

    # Checked before `generate`, which builds the HW index and scans both
    # databases: a mistyped --baseline otherwise costs the full run before it
    # says the path is wrong. `--update` is exempt -- it is what creates the file.
    if not args.update and not args.baseline.exists():
        sys.exit(f"no baseline at {args.baseline}; run --update to create it")

    rows = generate(args.db, args.hw)

    # `read` refuses a duplicate root; nothing refused one on the generated side,
    # so a second row for a root collapsed into the dict below and `compare` read
    # "no change" for the row that vanished. Under --update the pair was written
    # to the file and the failure surfaced only on the *next* non-update run.
    duplicates = sorted(r for r, n in Counter(row[0] for row in rows).items() if n > 1)
    if duplicates:
        sys.exit(f"{args.db}: generated duplicate rows for {', '.join(duplicates)}")

    if args.update:
        write(args.baseline, rows)
        print(f"baseline updated: {len(rows)} roots -> {args.baseline}")
        return

    added, removed, changed = compare(
        read(args.baseline), {row[0]: (row[1], row[2], row[3]) for row in rows}
    )

    # Printed on every run, pass or fail. A gate that stays quiet when it finds
    # nothing is indistinguishable from one that never ran -- the lapse
    # signature CLAUDE.md §5 exists to prevent, and the exact bug the ceilings
    # this tool replaces shipped with.
    statuses = Counter(row[1] for row in rows)
    buckets = Counter(
        bucket for row in rows for bucket in row[2].split(",") if bucket != _NO_BUCKETS
    )
    _report("roots", len(rows), statuses)
    _report("buckets", sum(buckets.values()), buckets)
    _report("added", len(added), added[: args.show])
    _report("removed", len(removed), removed[: args.show])
    _report("changed", len(changed), ())
    for root, before, after in changed[: args.show]:
        for line in _describe(root, before, after):
            print(line)
    if len(changed) > args.show:
        print(f"  ... {len(changed) - args.show} more (read the baseline's git diff)")

    if added or removed or changed:
        sys.exit(1)


if __name__ == "__main__":
    main()
