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

import os
import sqlite3
import tempfile
import uuid
from datetime import UTC, datetime
from pathlib import Path

from scraper import source_header
from scraper.hanswehr_gloss import _SECOND_HEAD, _dash_cut, select_gloss
from scraper.sources.hanswehr import build_index, lookup

# ponytail: reuse salmone's reject loader and its "what counts as nominal"
# constant; extract to a shared module only if salmone tooling is deleted.
from tools.prepare_lane_glosses import load_rejects
from tools.prepare_salmone_glosses import _NOMINAL_TAGS

_REJECTS = Path(__file__).with_name("hanswehr_rejects.txt")
_OVERRIDES = Path(__file__).with_name("hanswehr_overrides.tsv")
_NOMINAL_THRESHOLD = 0.8


def load_overrides(path: Path = _OVERRIDES) -> dict[str, str]:
    """Human gloss decisions: root -> gloss. An empty gloss means drop the root.

    Unlike `load_rejects` (a set of roots to skip entirely), this carries
    replacement text, because the measured failures need a *different* gloss
    rather than none: `ArD` should read "earth; land, country", not vanish.
    Dropping still needs `scraper prune-definitions` -- `import-lane` upserts
    and never deletes.

    Hand-edited and merge-conflict-prone, so both silent-loss shapes raise: a
    line with no tab at all would read as "drop this root", turning one missing
    keystroke into a deleted gloss, and a duplicated root would let one decision
    quietly overwrite another. Same reasoning as `hanswehr_baseline.read`.
    """
    out: dict[str, str] = {}
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.startswith("#"):
            continue
        root, tab, gloss = line.partition("\t")
        if not tab:
            raise ValueError(
                f"{path}:{number}: expected root<TAB>gloss; "
                f"to drop {root.strip()!r} leave the gloss empty after the tab"
            )
        root = root.strip()
        # A blank root cell survives the guard above -- "   \tearth" is neither
        # an empty line nor a missing tab -- and would key the decision on "",
        # which matches no target. `build_rows` then quarantines it, so a
        # mistyped root reads as "Hans Wehr has no entry" rather than as the
        # typo it is, and the gloss the human wrote is silently never applied.
        if not root:
            raise ValueError(
                f"{path}:{number}: blank root; the gloss {gloss.strip()!r} would "
                f"match nothing and be reported as an unused override"
            )
        if root in out:
            raise ValueError(f"{path}:{number}: duplicate root {root!r}")
        out[root] = gloss.strip()
    return out


def candidates(entries: list[tuple[int, str]], root: str = "") -> list[str]:
    """Distinct gloss options for one root, for a human to choose between.

    `select_gloss` cuts at the first `<b>` (derived-form block) and at a second
    Form-I headword's `" -- "`; for some roots that is exactly where the Quranic
    sense lives -- `kfr`'s "be an infidel" sits past the dash, `rsl`'s "send out"
    inside `<b>IV</b>`. Emitting the cut-away blocks puts those in front of the
    reviewer instead of leaving them invisible.

    The dash is located with `_dash_cut`, not `find(" -- ")`, so this offers the
    block the extractor actually removed: a bare find would also hit the em-dash
    placeholder inside a grammar parenthesis, which is not a headword boundary.

    `_SECOND_HEAD` is consulted alongside it because `select_gloss` cuts on that
    too, and it covers three spellings `_dash_cut` does not ("–", "—", "―", and
    "--" behind a page number). Leaving it out hid a sense from the reviewer on
    7 of the 1642 targets, several of them the Quranic one -- `zkw` "grow,
    increase", `syH` "travel, journey", `wjf` "throb, beat (heart)".

    `_XREF`'s block is deliberately not offered: it is a redirect to another
    headword ("see 2 شف"), not a sense, and emitting it adds a candidate to
    exactly 0 of the 1642 -- `select_gloss` reads the residue as head material
    and `_quarantine` drops it.
    """
    out: list[str] = []
    if not entries:
        return out
    for gloss in (
        select_gloss(entries, prefer_nominal=False, root=root),
        select_gloss(entries, prefer_nominal=True, root=root),
    ):
        if gloss and gloss not in out:
            out.append(gloss)
    # Both entries `select_gloss` can ship, not just `entries[0]`: with
    # `prefer_nominal` it ships the first `is_root == 0` entry instead, and for
    # a root above `_NOMINAL_THRESHOLD` that is the one being imported. Reading
    # the cut-away blocks off `entries[0]` alone hid the shipped entry's own
    # derived-form and second-headword senses -- the exact case this function
    # exists for -- on 63 of the 1642 targets, several of them Quranic:
    # `Ebd` "servant (of God), human being", `wly` "helper, supporter,
    # benefactor", `xyr` "good, benefit, interest".
    heads = [entries[0]]
    nominal = next((e for e in entries if e[0] == 0), None)
    if nominal is not None and nominal is not entries[0]:
        heads.append(nominal)
    for is_root, head in heads:
        dash = _dash_cut(head)
        starts = [dash + len(" -- ") if dash != -1 else -1]
        # `end(1)`, not `start(1)`: group 1 is the dash itself, and the block the
        # reviewer wants begins after it.
        if second := _SECOND_HEAD.search(head):
            starts.append(second.end(1))
        # Past the *closing* tag: the block opens "<b>IV</b> to send out", and
        # the roman numeral is the form's name, not part of the gloss.
        if (tag := head.find("<b>")) != -1:
            close = head.find("</b>", tag)
            starts.append(close + len("</b>") if close != -1 else tag + len("<b>"))
        for start in starts:
            if start == -1:
                continue
            gloss = select_gloss([(is_root, head[start:])], root=root)
            if gloss and gloss not in out:
                out.append(gloss)
    return out


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
    overrides: dict[str, str] | None = None,
) -> tuple[list[tuple[str, str]], list[tuple[str, str, str]], dict[str, int]]:
    """(rows, quarantined, stats).

    `quarantined` entries are `(root, status, "")` -- already shaped like a
    review row with an empty gloss, so `review_rows` can append them as-is.
    `form_counts` is accepted for interface parity with the Salmoné/Lane
    tools (a future sense-ranking refinement could use it) but `select_gloss`
    does not consult it today; only `nominal_shares` drives the pick.

    `overrides` is applied *after* the lookup, so it can only correct which Hans
    Wehr sense ships -- never invent a gloss for a root HW has no entry for,
    which would land under `source = 'hanswehr'` while coming from nowhere in
    Hans Wehr.
    """
    rows: list[tuple[str, str]] = []
    quarantined: list[tuple[str, str, str]] = []
    stats = {"total": len(targets), "not_in_hanswehr": 0, "no_gloss": 0, "glossed": 0}
    used: set[str] = set()
    for bw in targets:
        # Before the lookup, not beside the gloss check below: a quarantined
        # root still reaches review.tsv, so this has to run before either
        # early exit -- same ordering as prepare_salmone_glosses.
        if any(ch in bw for ch in "\t\n\r"):
            raise ValueError(f"root {bw!r} contains a TSV delimiter")
        entries = lookup(index, bw)
        if entries is None:
            stats["not_in_hanswehr"] += 1
            # Not quarantined here when a human overrode it: `used` stays unset,
            # so the tail loop below reports it as `unused_override` -- the more
            # actionable of the two, since it says the decision did not ship.
            # Emitting both would put two rows under one root in the review TSV
            # and the baseline, which `hanswehr_baseline.read` refuses to load
            # (`duplicate root`), leaving the gate unrunnable until someone
            # hand-edits it.
            if overrides is None or bw not in overrides:
                quarantined.append((bw, "not_in_hanswehr", ""))
            continue
        if overrides is not None and bw in overrides:
            used.add(bw)
            override = overrides[bw]
            if not override:
                stats["dropped_by_override"] = stats.get("dropped_by_override", 0) + 1
                quarantined.append((bw, "dropped_by_override", ""))
                continue
            if any(ch in override for ch in "\t\n\r"):
                raise ValueError(f"override for {bw!r} contains a TSV delimiter")
            rows.append((bw, override))
            stats["overridden"] = stats.get("overridden", 0) + 1
            continue
        gloss = select_gloss(
            entries,
            prefer_nominal=nominal_shares.get(bw, 0.0) > _NOMINAL_THRESHOLD,
            root=bw,
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
    # An override nobody reached. Two causes, both worth a row: the root is
    # mistyped, or it is one Hans Wehr has no entry for -- the lookup above
    # quarantines those before the override is consulted, on purpose. Either
    # way the human's decision did not ship, which is the same silent-loss
    # shape `load_overrides` raises for and `delete_root_definitions` reports.
    # Carried as a quarantine row so it lands in the review TSV and the
    # baseline, not just a counter on stdout.
    for bw in sorted(set(overrides or {}) - used):
        stats["unused_overrides"] = stats.get("unused_overrides", 0) + 1
        quarantined.append((bw, "unused_override", ""))
    stats["glossed"] = len(rows)
    return rows, quarantined, stats


def review_rows(
    rows: list[tuple[str, str]],
    quarantined: list[tuple[str, str, str]],
    options: dict[str, list[str]] | None = None,
) -> list[tuple[str, ...]]:
    """``(root, status, gloss, *options)`` for the human gate: glossed rows are
    `kept`, quarantined rows are already `(root, status, "")` and pass through
    as-is.

    `options` are the *other* glosses Hans Wehr offers for that root (see
    `candidates`), appended as extra columns for the roots that have any. Rows
    are deliberately ragged: padding every one of ~1500 clean rows to a fixed
    width buries the handful worth a human's attention.
    """
    options = options or {}
    return [(bw, "kept", gloss, *options.get(bw, ())) for bw, gloss in rows] + list(
        quarantined
    )


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


def load_live_roots(db_path: Path, source: str) -> set[str]:
    """Roots that already hold a `root_definitions` row at `source`.

    Only half of the delete path; the other half is `main`, which subtracts this
    run's output from it. `import-lane` upserts and never removes, so a root
    this run quarantines keeps whatever an earlier run installed -- and
    quarantining the defective ones is the entire point of this phase. Measured
    against the live DB after Task 5: 26 of the 192 quarantined roots still held
    a phase-23 `hanswehr` row, among them `$fh -> "see 2 شف"` and thirteen roots
    glossed `"and"`. Importing without pruning first ships every one of them.

    The sibling `prepare_corpus_form_glosses.build_rows` guards the same hole by
    raising (`must_yield`), which is right there and wrong here: there a lost
    gloss means the parser broke, here it means the parser worked.

    No ceiling on how much this may prune, deliberately. A half-loaded HW index
    would quarantine everything and hand the delete command all 1476 live roots
    -- but `hanswehr_baseline` already fails on that run, with one changed line
    per root, and it is the documented step before the import. A share limit
    here would be a second guard on the same failure, set to a number nobody
    measured; this file's own gate was rewritten to remove exactly that.
    """
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        rows = conn.execute(
            """SELECT r.root_buckwalter FROM root_definitions d
                 JOIN roots r ON r.id = d.root_id
                WHERE d.source = ?""",
            (source,),
        ).fetchall()
    finally:
        conn.close()
    return {row[0] for row in rows}


def _umask() -> int:
    """The process umask -- readable only by setting it and putting it back.

    Single-threaded CLI, so the window where it reads 0o022 is not observable.
    """
    mask = os.umask(0o022)
    os.umask(mask)
    return mask


def _install(review: tuple[Path, str], *pair: tuple[Path, str]) -> None:
    """Put a run's artifacts on disk, all of them or none.

    Computing the three payloads before writing any of them is not enough:
    `--out` and `--prune-out` were still installed one statement before the
    review TSV, so a failure in between -- ENOSPC, a `--review` path naming a
    directory -- left a stamp-matched pair on disk with no review artifact.
    `check_pair` accepts that pair happily, and the import reinstalls every
    gloss with no human having read one, its only trace a file that is absent.

    So each payload goes to a sibling temp file first, and the moves happen only
    once all three have landed. That puts every realistic failure -- a full disk,
    a bad path, an unwritable directory -- before anything is installed;
    `os.replace` onto a same-directory sibling has essentially nothing left to
    fail on. Should it fail anyway, both halves of the pair are removed rather
    than left behind: an earlier run's pair carries its own matching stamps, so
    surviving intact it would pass `--pair` and quietly import the *previous*
    run's corpus under the operator's belief that they are importing this one.
    Two missing files stop both commands with a plain ENOENT.

    `review` is separate from `pair` only to be installed first -- it is the
    human artifact, and the only one whose absence is not itself a guard.

    Each payload is fsynced before its move and the directories after: a rename
    is atomic against a *crash mid-write*, not against the write never reaching
    the disk. `check_pair` reads two header lines, so a truncated `--out` beside
    an intact `--prune-out` passes it and imports a partial corpus over the live
    dictionary -- the same silent-partial shape the staging above exists to stop,
    one layer down.
    """
    targets = (review, *pair)
    staged: list[tuple[Path, Path]] = []
    try:
        for path, text in targets:
            handle, name = tempfile.mkstemp(
                dir=path.parent, prefix=f".{path.name}.", suffix=".tmp"
            )
            # Registered before the first thing that can fail, not after the
            # last: a temp file that exists is the cleanup's business whether or
            # not it was ever filled. Registering post-write leaks the one that
            # failed -- ENOSPC mid-`write`, an `fsync` on a full disk -- as a
            # dotfile beside the artifact it failed to become.
            tmp = Path(name)
            staged.append((path, tmp))
            with os.fdopen(handle, "w", encoding="utf-8") as stream:
                stream.write(text)
                stream.flush()
                os.fsync(stream.fileno())
            # `mkstemp` opens 0600 by design; these are ordinary derived
            # artifacts and were 0644 under the default umask before staging
            # existed. Restoring the mode keeps that from being a silent side
            # effect of how they are now written.
            os.chmod(tmp, 0o666 & ~_umask())
        for path, tmp in staged:
            os.replace(tmp, path)
        for directory in {path.parent for path, _text in targets}:
            fd = os.open(directory, os.O_RDONLY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
    except BaseException:
        for _path, tmp in staged:
            tmp.unlink(missing_ok=True)
        for path, _text in pair:
            path.unlink(missing_ok=True)
        raise


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, required=True)
    parser.add_argument(
        "--hw", type=Path, required=True, help="vendored Hans Wehr sqlite"
    )
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--review", type=Path, required=True, help="human review TSV")
    # Required, not optional: an operator who forgets it strands exactly the
    # glosses this phase exists to remove, and the import prints success either
    # way. Generated rather than hand-derived so it cannot drift from --out.
    parser.add_argument(
        "--prune-out",
        type=Path,
        required=True,
        help="roots to delete before importing --out; feed to prune-definitions",
    )
    parser.add_argument(
        "--source",
        default="hanswehr",
        help="root_definitions.source tag (default: %(default)s)",
    )
    args = parser.parse_args()

    index = build_index(args.hw)
    targets = load_hanswehr_targets(args.db)
    nominal_shares = load_nominal_shares(args.db)
    # form_counts stays empty: build_rows accepts it for interface parity with
    # the Salmoné/Lane tools but select_gloss never consults it. Computing it
    # here was ~20k dead per-root DB round-trips (build_rows docstring).
    overrides = load_overrides()
    rows, quarantined, stats = build_rows(
        index, targets, {}, nominal_shares, overrides=overrides
    )
    # Both files open with the source they were computed for, and both consumers
    # refuse a tag that disagrees. The flags being required stops one being
    # forgotten; only this stops the prune and the import naming *different*
    # sources, which deletes one dictionary and installs another in its place.
    #
    # The run stamp is what the tag cannot do: every run writes `hanswehr`, so
    # only this catches run B's prune list against run A's glosses. Timestamp
    # for the operator, uuid tail because two runs can share a second.
    run = f"{datetime.now(UTC):%Y%m%dT%H%M%SZ}-{uuid.uuid4().hex[:6]}"
    # Everything holding a row at this source that this run did not re-produce:
    # override drops, `no_gloss` and `not_in_hanswehr` quarantines alike. Pruned
    # first, imported second, the pair leaves the source holding exactly --out
    # and nothing else -- an invariant neither command can state alone. Order
    # between the two is not a data-loss question: `stale` is `live - emitted`,
    # so the prune list and the import set are disjoint by construction and a
    # failure between the commands never leaves a kept root needing restoring.
    stale = sorted(load_live_roots(args.db, args.source) - {bw for bw, _ in rows})
    # A root whose override never shipped *and* which holds a live row is the
    # one case where this file executes a human decision as its opposite: they
    # wrote a replacement, the prune deletes instead. The deletion is still
    # right -- HW has no entry, so the live row is `source = 'hanswehr'` text
    # that came from nowhere in Hans Wehr, exactly the stale junk Task 7 removes
    # -- but "0 overrides unused" hid it and a review-TSV line is not read
    # during the import. Named on stdout, next to the prune count it explains.
    #
    # `overrides.get(bw)`, not `bw in overrides`: an empty gloss is a deliberate
    # *drop*, which quarantines the root as `dropped_by_override` and so also
    # lands it in `stale`. Membership alone would warn that the operator's
    # override "will be DELETED, not applied -- Hans Wehr has no entry" for a
    # root HW does carry and whose decision was executed exactly as written.
    inverted = [bw for bw in stale if overrides.get(bw)]
    # The alternatives HW carries but `select_gloss` did not pick. Computed here
    # rather than inside `build_rows` because they are review furniture, not part
    # of what gets imported -- `hanswehr_baseline` calls `build_rows` too and has
    # no use for them.
    options = {}
    for bw, gloss in rows:
        others = [c for c in candidates(lookup(index, bw) or [], root=bw) if c != gloss]
        if others:
            options[bw] = others
    review = review_rows(rows, quarantined, options)
    # Nothing is on disk until all three are computed *and* staged. The
    # `candidates` sweep above re-slices every kept entry and is the most
    # failure-prone step here; `_install` covers the rest of the window.
    header = source_header.header(args.source, run)
    _install(
        (
            args.review,
            "root\tstatus\tgloss\toptions\n"
            + "".join("\t".join(row) + "\n" for row in review),
        ),
        (args.out, header + "".join(f"{bw}\t{gloss}\n" for bw, gloss in rows)),
        (args.prune_out, header + "".join(f"{bw}\n" for bw in stale)),
    )
    print(
        f"Hans Wehr -> TSV: {stats['glossed']} glossed of {stats['total']} targets "
        f"({stats['not_in_hanswehr']} not in HW, {stats['no_gloss']} no gloss, "
        f"{stats.get('overridden', 0)} overridden, "
        f"{stats.get('dropped_by_override', 0)} dropped, "
        f"{stats.get('unused_overrides', 0)} overrides unused) -> "
        f"{args.out}; review {args.review} ({len(options)} with options); "
        f"prune {len(stale)} stale {args.source} rows -> {args.prune_out}; "
        f"run {run} (pass both files as --pair to the prune/import pair)"
    )
    if inverted:
        print(
            f"WARNING: {len(inverted)} override(s) will be DELETED, not applied "
            f"-- Hans Wehr has no entry for the root: {' '.join(inverted)}"
        )


if __name__ == "__main__":
    main()
