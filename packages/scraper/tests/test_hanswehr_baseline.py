import sys
from pathlib import Path

import pytest

from tools import hanswehr_baseline as baseline_mod
from tools import prepare_hanswehr_glosses as prepare_mod
from tools.audit_hanswehr_glosses import classify
from tools.hanswehr_baseline import (
    _describe,
    buckets_for,
    compare,
    generate,
    main,
    read,
    write,
)


def _sources(monkeypatch, entries, shares=None):
    """Point `generate` at an in-memory corpus instead of the two databases.

    Two namespaces, deliberately: `generate` delegates its selection loop to
    `prepare_hanswehr_glosses.build_rows`, which resolved `lookup` and
    `select_gloss` at its own import, while the database readers are resolved
    here. Patching only this module's names would leave the real `lookup`
    running inside `build_rows` and the fixture would be a lie -- so the split
    is patched where each name actually lives, and that split is what proves
    the delegation.

    `lookup` returns None for an absent root, matching the real one: `build_rows`
    distinguishes "not in HW" from "no gloss" on exactly that.
    """
    monkeypatch.setattr(baseline_mod, "build_index", lambda path: entries)
    monkeypatch.setattr(prepare_mod, "lookup", lambda index, bw: index.get(bw))
    monkeypatch.setattr(baseline_mod, "load_nominal_shares", lambda db: shares or {})
    monkeypatch.setattr(
        baseline_mod, "load_hanswehr_targets", lambda db: sorted(entries)
    )
    # `generate` also calls `load_overrides()`, which reads the shipped
    # `hanswehr_overrides.tsv`. It is empty today; task 7 fills it, and an
    # override naming a fixture root would replace that fixture's gloss and turn
    # unrelated assertions red on a pure data change. Default to none and let a
    # test that wants overrides patch this again after `_sources` has run.
    monkeypatch.setattr(baseline_mod, "load_overrides", dict)


def _generates(monkeypatch, gloss):
    """Fix what `select_gloss` returns, so these test `generate`'s wiring only."""
    monkeypatch.setattr(prepare_mod, "select_gloss", lambda entries, **kw: gloss)


def _run(monkeypatch, entries, gloss, shares=None):
    _sources(monkeypatch, entries, shares)
    _generates(monkeypatch, gloss)
    return generate(Path("db"), Path("hw"))


# ---- the buckets column.


def test_buckets_for_joins_sorted_and_marks_a_clean_gloss():
    assert buckets_for("earth; land, country", "ArD") == "-"
    assert buckets_for("u and كلال", "kll") == "arabic,frag"


def test_buckets_for_adds_the_two_content_loss_buckets_classify_cannot_see():
    """`stub` and `head` are not shape tests, so `classify` misses both. The
    column has to carry them or the baseline records a defective gloss as clean.
    """
    assert classify("ufq, ufuq") == set()
    # `head` too: a whole-gloss stub is also a first-word leftover, and since
    # round 8 read the root rather than the entry it sees that. The two are not
    # redundant -- `stub` fires on a gloss whose words share a skeleton that is
    # not the root's, which `head` cannot see.
    assert buckets_for("ufq, ufuq", "Afq") == "head,stub"
    assert classify("anfus soul; psyche") == set()
    assert buckets_for("anfus soul; psyche", "nfs") == "head"


# ---- generate: one row per target root, whatever happened to it.


def test_generate_records_a_defective_gloss_under_its_root(monkeypatch):
    rows = _run(monkeypatch, {"kll": [(1, "كلل ...")]}, "kalal, كلال kalāl weariness")
    assert rows == [("kll", "kept", "arabic,head", "kalal, كلال kalāl weariness")]


def test_generate_records_a_stub_every_shape_bucket_passes(monkeypatch):
    rows = _run(monkeypatch, {"Afq": [(1, "أفق ufq, ufuq")]}, "ufq, ufuq")
    assert rows == [("Afq", "kept", "head,stub", "ufq, ufuq")]


def test_generate_keeps_a_quarantined_root_as_a_row(monkeypatch):
    """A dropped root is the content loss the whole gate exists for: it has no
    gloss to classify, so only its presence as a row records that it exists."""
    rows = _run(monkeypatch, {"tjr": [(1, "تجر tajara u and")]}, None)
    assert rows == [("tjr", "no_gloss", "-", "")]


def test_generate_keeps_a_root_the_dictionary_does_not_carry(monkeypatch):
    """The old `audit()` silently `continue`d past these while the importer
    quarantined them as `not_in_hanswehr` -- a gate measuring a different
    population than the thing it gated. 94 roots live."""
    rows = _run(monkeypatch, {"zzz": None}, "unused")
    assert rows == [("zzz", "not_in_hanswehr", "-", "")]


def test_generate_sorts_by_root_not_by_target_order(monkeypatch):
    """Targets arrive in `occurrence_count DESC`, which a re-scrape can reorder.
    Sorting by root keeps a one-gloss change to a one-line diff."""
    _sources(monkeypatch, {"qlb": [(1, "x")], "Alh": [(1, "y")], "nfs": [(1, "z")]})
    _generates(monkeypatch, "gloss")
    monkeypatch.setattr(
        baseline_mod, "load_hanswehr_targets", lambda db: ["qlb", "nfs", "Alh"]
    )
    assert [row[0] for row in generate(Path("db"), Path("hw"))] == ["Alh", "nfs", "qlb"]


def test_generate_asks_for_the_nominal_entry_only_above_the_threshold(monkeypatch):
    """The share drives sense selection, so the baseline must record the gloss
    the importer will ship -- otherwise it pins one nobody stores."""
    seen: dict[str, bool] = {}

    def record(entries, prefer_nominal=False, **kw):
        seen[entries[0][1]] = prefer_nominal
        return "gloss"

    _sources(
        monkeypatch,
        {"xmr": [(1, "nominal")], "qtl": [(1, "verbal")]},
        shares={"xmr": 1.0, "qtl": 0.0},
    )
    monkeypatch.setattr(prepare_mod, "select_gloss", record)
    generate(Path("db"), Path("hw"))
    assert seen == {"nominal": True, "verbal": False}


def test_generate_buckets_a_gloss_without_re_reading_its_entry(monkeypatch):
    """`head` reads the root, so `generate` needs no second look at the source.

    Until round 8 it re-derived the picked entry here to hand `_head_leftover` a
    raw definition -- a `lookup` plus a `pick_entry` that had to stay in step
    with the choice `select_gloss` had already made, or the bucket would gate
    one entry's headword against another entry's gloss. The root makes the
    whole re-derivation unnecessary: `lookup` is not even imported now, and this
    fixture never patches it in this module's namespace. `pick_entry` existed
    only to keep those two in step and has since been inlined into `select_gloss`.
    """
    assert not hasattr(baseline_mod, "lookup")
    rows = _run(
        monkeypatch,
        {"nfs": [(1, "نفس tanaffasa to breathe"), (0, "نفس nafs pl. انفس anfus soul")]},
        "anfus soul",
        shares={"nfs": 1.0},
    )
    assert rows == [("nfs", "kept", "head", "anfus soul")]


def test_generate_reads_the_overrides_file(monkeypatch):
    """A human override changes the gloss the importer ships, so it has to move a
    baseline row too. Left out, the gate would go green on a corpus it never
    generated -- the same "measures a different population" drift the old
    `audit()` had.
    """
    # Not `_run`: `_sources` patches `load_overrides` to none, so this has to
    # land after it rather than before.
    _sources(monkeypatch, {"ArD": [(1, "ارض arḍ termite")]})
    _generates(monkeypatch, "termite")
    monkeypatch.setattr(baseline_mod, "load_overrides", lambda: {"ArD": "earth; land"})
    rows = generate(Path("db"), Path("hw"))
    assert rows == [("ArD", "kept", "-", "earth; land")]


def test_generate_reads_three_columns_from_a_ragged_review_row(monkeypatch):
    """`review_rows` returns `tuple[str, ...]`: the human gate appends one extra
    column per candidate gloss.

    `generate` passes no `options` today, so its rows happen to be 3 wide and a
    tuple unpack works. mypy cannot see the day that changes -- a variadic tuple
    unpacks to any arity -- so it would fail at runtime, mid-run, after the full
    HW index build. Widened here so the read stays positional.
    """
    monkeypatch.setattr(
        baseline_mod,
        "review_rows",
        lambda rows, quarantined: [("ArD", "kept", "earth", "land", "country")],
    )
    assert _run(monkeypatch, {"ArD": [(1, "ارض arḍ earth")]}, "earth") == [
        ("ArD", "kept", "-", "earth")
    ]


# ---- the baseline file itself.


def test_write_then_read_round_trips(tmp_path):
    rows = [("Alh", "kept", "-", "god, deity"), ("$Am", "no_gloss", "-", "")]
    path = tmp_path / "b.tsv"
    write(path, rows)
    assert read(path) == {
        "Alh": ("kept", "-", "god, deity"),
        "$Am": ("no_gloss", "-", ""),
    }


def test_read_survives_an_editor_trimming_a_quarantine_rows_trailing_tab(tmp_path):
    """192 of the committed rows are quarantines -- an empty gloss, so the line
    ends in a tab. Any whitespace-trimming editor or web edit turns all 192 into
    3-column rows at once, and failing there leaves the gate unrunnable until
    someone repairs them by hand."""
    path = tmp_path / "b.tsv"
    path.write_text(
        "root\tstatus\tbuckets\tgloss\nAlh\tkept\t-\tgod\n$Am\tno_gloss\t-\n",
        encoding="utf-8",
    )
    assert read(path) == {
        "Alh": ("kept", "-", "god"),
        "$Am": ("no_gloss", "-", ""),
    }


def test_read_keeps_a_gloss_whole_across_a_break_the_writer_allows(tmp_path):
    """`build_rows` rejects \\t, \\n and \\r; `splitlines()` breaks on six more.

    A gloss carrying one of those is written as a single row and would read back
    as two, the second failing the column check -- the gate unrunnable over a
    character the writer said was fine. Hans Wehr is OCR text, so a stray
    separator is the exact input this guards.
    """
    path = tmp_path / "b.tsv"
    path.write_text(
        "root\tstatus\tbuckets\tgloss\nAlh\tkept\t-\tgod\x0bthe one\n",
        encoding="utf-8",
    )
    assert read(path) == {"Alh": ("kept", "-", "god\x0bthe one")}


@pytest.mark.parametrize(
    "body,message",
    [
        ("root\tstatus\tgloss\nAlh\tkept\tgod\n", "expected header"),
        ("", "expected header"),
        # A dropped column shifts the gloss into the buckets slot, and every
        # later field with it -- silently, and it reads as "no change".
        ("root\tstatus\tbuckets\tgloss\nAlh\tkept\tgod\n", "got 3"),
        ("root\tstatus\tbuckets\tgloss\nAlh\tkept\t-\ta\tb\n", "got 5"),
        # A botched merge conflict resolution; the second line wins in silence.
        (
            "root\tstatus\tbuckets\tgloss\nAlh\tkept\t-\ta\nAlh\tkept\t-\tb\n",
            "duplicate",
        ),
    ],
)
def test_read_rejects_a_malformed_baseline(tmp_path, body, message):
    path = tmp_path / "b.tsv"
    path.write_text(body, encoding="utf-8")
    with pytest.raises(ValueError, match=message):
        read(path)


# ---- comparison.


def test_compare_separates_added_removed_and_changed():
    base = {"a": ("kept", "-", "one"), "b": ("kept", "-", "two")}
    current = {"a": ("kept", "-", "ONE"), "c": ("kept", "-", "three")}
    added, removed, changed = compare(base, current)
    assert added == ["c"]
    assert removed == ["b"]
    assert changed == [("a", ("kept", "-", "one"), ("kept", "-", "ONE"))]


def test_compare_is_empty_when_nothing_moved():
    same = {"a": ("kept", "-", "one")}
    assert compare(same, dict(same)) == ([], [], [])


def test_compare_sees_a_bucket_change_with_the_gloss_unmoved():
    """The reason buckets are a column: a regex edit that reclassifies a root
    changes no gloss, so a gloss-only baseline would call it a clean run."""
    _, _, changed = compare(
        {"drhm": ("kept", "-", "dirhem")}, {"drhm": ("kept", "head", "dirhem")}
    )
    assert changed == [("drhm", ("kept", "-", "dirhem"), ("kept", "head", "dirhem"))]


def test_describe_names_the_field_that_moved():
    lines = _describe("qlb", ("kept", "-", "one"), ("kept", "head", "two"))
    assert [line.split() for line in lines] == [
        ["qlb", "buckets", "-", "-"],
        ["+", "head"],
        ["qlb", "gloss", "-", "one"],
        ["+", "two"],
    ]


# ---- the CLI.


def _cli(monkeypatch, rows, *args):
    monkeypatch.setattr(baseline_mod, "generate", lambda db, hw: rows)
    monkeypatch.setattr(
        sys, "argv", ["baseline", "--db", "q.db", "--hw", "hw.sqlite", *args]
    )


def test_main_refuses_a_duplicate_root_on_the_generated_side(monkeypatch, tmp_path):
    """`read` rejects a duplicated root; the generated side collapsed one into a
    dict, so the losing row read as "no change" -- and under --update the pair
    was written out, leaving the next non-update run to fail on a file this run
    produced. Both paths refuse it here, before either can report a clean gate."""
    path = tmp_path / "b.tsv"
    write(path, [("qlb", "kept", "-", "before")])
    rows = [("qlb", "kept", "-", "one"), ("qlb", "kept", "-", "two")]
    for extra in ([], ["--update"]):
        _cli(monkeypatch, rows, "--baseline", str(path), *extra)
        with pytest.raises(SystemExit) as exc:
            main()
        assert "duplicate" in str(exc.value.code) and "qlb" in str(exc.value.code)
    # --update refused before writing, so the old baseline is still the old one.
    assert read(path) == {"qlb": ("kept", "-", "before")}


def test_main_exits_nonzero_on_a_changed_gloss(monkeypatch, capsys, tmp_path):
    path = tmp_path / "b.tsv"
    write(path, [("qlb", "kept", "-", "before")])
    _cli(monkeypatch, [("qlb", "kept", "-", "after")], "--baseline", str(path))
    with pytest.raises(SystemExit) as exc:
        main()
    assert exc.value.code == 1
    out = capsys.readouterr().out
    assert "changed" in out and "qlb" in out and "before" in out and "after" in out


def test_main_says_how_many_changed_roots_show_cut(monkeypatch, capsys, tmp_path):
    """`--show` truncates the per-root diff, and a truncation that does not say
    so reads as the whole story: a 400-root regression would print 20 roots and
    look like 20. The count and the exit status both have to survive the cut."""
    path = tmp_path / "b.tsv"
    write(path, [("nfs", "kept", "-", "before"), ("qlb", "kept", "-", "before")])
    _cli(
        monkeypatch,
        [("nfs", "kept", "-", "after"), ("qlb", "kept", "-", "after")],
        "--baseline",
        str(path),
        "--show",
        "1",
    )
    with pytest.raises(SystemExit) as exc:
        main()
    assert exc.value.code == 1
    out = capsys.readouterr().out
    assert "... 1 more" in out
    # The one shown is shown in full; the one cut is named only by the count.
    assert "nfs" in out and "qlb" not in out


def test_main_rejects_a_negative_show(monkeypatch, capsys, tmp_path):
    """A negative reaches a slice bound *and* a subtraction, so `--show -1` over
    two changed roots prints one and reports "... 3 more" -- four roots claimed
    where two moved. Wrong in the direction of alarm, from a tool whose only job
    is to say exactly which roots moved."""
    path = tmp_path / "b.tsv"
    write(path, [("nfs", "kept", "-", "before"), ("qlb", "kept", "-", "before")])
    _cli(
        monkeypatch,
        [("nfs", "kept", "-", "after"), ("qlb", "kept", "-", "after")],
        "--baseline",
        str(path),
        "--show",
        "-1",
    )
    with pytest.raises(SystemExit) as exc:
        main()
    # 2, not 1: argparse's usage error, not the gate's "something moved".
    assert exc.value.code == 2
    assert "more" not in capsys.readouterr().out


def test_main_exits_zero_and_still_prints_every_line(monkeypatch, capsys, tmp_path):
    """A gate that goes quiet on a pass is indistinguishable from one that never
    ran -- the CLAUDE.md §5 lapse signature, and the bug the ceilings shipped
    with. Every label prints at zero."""
    path = tmp_path / "b.tsv"
    rows = [("qlb", "kept", "-", "same")]
    write(path, rows)
    _cli(monkeypatch, rows, "--baseline", str(path))
    main()
    out = capsys.readouterr().out
    for label in ("roots", "buckets", "added", "removed", "changed"):
        assert label in out


def test_main_update_writes_the_baseline(monkeypatch, capsys, tmp_path):
    path = tmp_path / "b.tsv"
    _cli(
        monkeypatch, [("qlb", "kept", "-", "new")], "--baseline", str(path), "--update"
    )
    main()
    assert read(path) == {"qlb": ("kept", "-", "new")}
    assert "updated" in capsys.readouterr().out


def test_main_refuses_a_missing_baseline_instead_of_passing(monkeypatch, tmp_path):
    """The dangerous default: no file, nothing to differ from, exit 0. That is a
    green gate on an unmeasured corpus.

    And it refuses *before* generating: `generate` builds the HW index and scans
    both databases, so a mistyped `--baseline` used to cost the whole run before
    saying the path was wrong.
    """
    called = []
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "baseline",
            "--db",
            "q.db",
            "--hw",
            "hw.sqlite",
            "--baseline",
            str(tmp_path / "no.tsv"),
        ],
    )
    monkeypatch.setattr(baseline_mod, "generate", lambda db, hw: called.append(1) or [])
    with pytest.raises(SystemExit) as exc:
        main()
    assert exc.value.code != 0
    assert called == []


def test_main_requires_both_database_paths(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["baseline", "--db", "q.db"])
    with pytest.raises(SystemExit) as exc:
        main()
    assert exc.value.code == 2
