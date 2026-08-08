"""The `# source:` line binding a generated artifact to the tag it was built for.

A `prepare_*` tool derives two files under one `--source`: the gloss TSV and the
prune list, the latter being *everything live at that source this run did not
re-produce*. Two separate commands then consume them under their own `--source`.
Making both flags required stops one being forgotten; nothing stops the two
disagreeing. Pruning at `corpus-forms` and importing at `hanswehr` deletes one
dictionary and installs another in its place, with both commands reporting
success -- the prune list is bare roots, so it matches any source's rows.

So the artifact carries the tag it was computed for and the consumer refuses a
mismatch. Checked before any DB work: the point is to fail before the delete,
not to report it afterwards.

The tag alone only pairs the two *sources*, not the two *runs* -- every run of
one tool writes the same tag. `header(source, run=...)` adds the run stamp both
halves share and `check_pair` compares them, which is what `--pair` on the two
consumers spends.

The line is a comment. `import-lane` and `prune-definitions` both already skip
`#`, so a file written before this existed still loads -- **absent means
unchecked, never a failure**. A hard requirement would break every TSV the other
three prepare tools have produced, none of which is regenerated on this path.
"""

from __future__ import annotations

from pathlib import Path

PREFIX = "# source: "
RUN_PREFIX = " run: "


def header(source: str, run: str | None = None) -> str:
    """The line a generated artifact opens with.

    `run` stamps both halves of one `prepare_*` invocation with the same id.
    Matching tags are not enough: two runs of the same tool both write
    `# source: hanswehr`, so pruning with run B's list and importing run A's
    glosses passes every check here and leaves the source holding neither run --
    a root B dropped and A kept survives the prune it was never listed in.

    Both values are rejected if they can break the line, because `--source` is
    operator input and this is the one place every artifact's header is built.
    """
    for label, value in (("source", source), ("run", run)):
        found = next((c for c in "\n\r\t" if value and c in value), None)
        if found is not None:
            raise ValueError(
                f"{label} {value!r} contains {found!r}. The header is a single "
                f"comment line and `_parse` reads only the first: a newline "
                f"turns everything after it into a data row that `check` never "
                f"sees, and a tab splits the comment into TSV fields."
            )
    # `source` only: `_parse` partitions at the *first* RUN_PREFIX, so a run
    # carrying one round-trips whole, while a source carrying one hands its tail
    # to the run field. `--source "hanswehr run: x"` then writes a stamp the
    # operator never asked for, and `check_pair` compares that instead of the
    # one the prepare run put there -- two unrelated files agreeing because both
    # sources were mistyped the same way.
    if RUN_PREFIX in source:
        raise ValueError(
            f"source {source!r} contains {RUN_PREFIX!r}, which `_parse` reads as "
            f"the run separator: everything after it would be taken as the run "
            f"stamp, and `check_pair` would compare that in place of the real one."
        )
    return f"{PREFIX}{source}{RUN_PREFIX}{run}\n" if run else f"{PREFIX}{source}\n"


def _parse(path: Path) -> tuple[str | None, str | None]:
    """`(source, run)` from the first line; either is None when absent.

    Only the first line is read: the writers put it there, and scanning further
    would let a stray `# source:` deep in a hand-written file override the one
    at the top.
    """
    with path.open(encoding="utf-8") as handle:
        first = handle.readline()
    if not first.startswith(PREFIX):
        return None, None
    rest = first[len(PREFIX) :]
    source, sep, run = rest.partition(RUN_PREFIX)
    # A blank run reads as absent, so `# source: hanswehr run:` cannot pair with
    # another blank one -- equality alone would call two unstamped files a match.
    # The *source* is left unnormalised on purpose: blank there is a mangled tag,
    # and `check` must keep raising a mismatch for it rather than wave it through
    # as the untagged file it is not.
    return source.strip(), (run.strip() or None) if sep else None


def check_pair(path: Path, pair: Path) -> str:
    """Raise unless both artifacts carry the *same* run stamp. Returns it.

    Unlike `check`, a missing stamp is a failure rather than "unchecked": the
    operator asking for this comparison is asking for the guarantee, and an
    unstamped file cannot give it. The three older prepare tools write no stamp,
    so their output simply is not passed here -- silently passing it would make
    the flag report a guarantee it never made.

    The tags are compared too, not just the stamps. Each command runs `check` on
    the artifact it consumes and never on the one named by `--pair`, so without
    this a Hans Wehr TSV and a Lane prune list carrying one stamp would satisfy
    both commands -- the cross-source deletion `check` exists to stop, walking in
    through the flag that was meant to tighten it.
    """
    my_source, mine = _parse(path)
    pair_source, theirs = _parse(pair)
    for candidate, run in ((path, mine), (pair, theirs)):
        if run is None:
            raise ValueError(
                f"{candidate} carries no run stamp, so it cannot be paired. "
                f"Regenerate both files from one prepare run."
            )
    if my_source != pair_source:
        raise ValueError(
            f"{path} was generated for source {my_source!r} but {pair} for "
            f"{pair_source!r}. Pruning one source and importing another deletes "
            f"a dictionary and installs a different one in its place."
        )
    if mine != theirs:
        raise ValueError(
            f"{path} is from run {mine!r} but {pair} is from run {theirs!r}. "
            f"Pruning with one run's list and importing another's glosses "
            f"leaves the source holding neither run: a root the newer run "
            f"dropped survives the prune that never listed it."
        )
    return mine  # type: ignore[return-value]  # None already raised above


def check(path: Path, source: str) -> str | None:
    """The tag `path` names, or None if it names none. Raises on a mismatch."""
    named, _ = _parse(path)
    if named is None:
        return None
    if named != source:
        raise ValueError(
            f"{path} was generated for source {named!r}, but --source is "
            f"{source!r}. Pruning one source and importing another deletes a "
            f"dictionary and installs a different one in its place."
        )
    return named
