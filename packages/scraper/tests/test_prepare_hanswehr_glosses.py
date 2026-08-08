import os
import sqlite3
import sys
from pathlib import Path

import pytest

from scraper.sources import hanswehr
from tools import prepare_hanswehr_glosses
from tools.prepare_hanswehr_glosses import (
    _NOMINAL_THRESHOLD,
    build_rows,
    candidates,
    load_hanswehr_targets,
    load_nominal_shares,
    load_overrides,
    review_rows,
)


def _header_and_body(path):
    """`(first line, rest)`. The header carries a per-run stamp, so the body is
    the only part a byte-exact assertion can hold."""
    first, _, body = path.read_text("utf-8").partition("\n")
    return first, body


def _quran_db(tmp_path, roots, segments=(), definitions=()):
    """`roots` is `[(root_buckwalter, root_arabic, occurrence_count), ...]`.

    `segments` is `[(root, pos_tag), ...]` for word_segments (empty by default).
    `definitions` is `[(root_buckwalter, source, definition), ...]`, joined to
    `roots` by id the way the live schema does.
    """
    db = tmp_path / "q.db"
    conn = sqlite3.connect(db)
    conn.execute(
        """CREATE TABLE roots (id INTEGER PRIMARY KEY, root_buckwalter TEXT,
               root_arabic TEXT, occurrence_count INTEGER)"""
    )
    conn.execute(
        """CREATE TABLE word_segments (root TEXT, form_buckwalter TEXT,
               pos_tag TEXT)"""
    )
    conn.execute(
        """CREATE TABLE root_definitions (id INTEGER PRIMARY KEY,
               root_id INTEGER NOT NULL, source TEXT, definition TEXT)"""
    )
    conn.executemany(
        "INSERT INTO roots (root_buckwalter, root_arabic, occurrence_count) "
        "VALUES (?, ?, ?)",
        roots,
    )
    conn.executemany(
        """INSERT INTO root_definitions (root_id, source, definition)
           VALUES ((SELECT id FROM roots WHERE root_buckwalter = ?), ?, ?)""",
        definitions,
    )
    conn.executemany(
        "INSERT INTO word_segments (root, form_buckwalter, pos_tag) "
        "VALUES (?, NULL, ?)",
        segments,
    )
    conn.commit()
    conn.close()
    return db


def _hw_db(tmp_path, entries=(("طرف", "طرف ṭarafa to blink, wink", 1),)):
    """A Hans Wehr SQLite carrying `[(word, definition, is_root), ...]`.

    The default row is the one nearly every `main` test needs: `Trf` present in
    HW, so the run produces a gloss for it. `entries=()` builds the schema with
    no rows, for the tests about a root HW does not carry.
    """
    db = tmp_path / "hw.sqlite"
    conn = sqlite3.connect(db)
    conn.execute(
        """CREATE TABLE DICTIONARY (id INTEGER PRIMARY KEY, word TEXT,
               definition TEXT, is_root INTEGER, parent_id INTEGER,
               quran_occurrence INTEGER, favorite_flag INTEGER)"""
    )
    conn.executemany(
        "INSERT INTO DICTIONARY (word, definition, is_root) VALUES (?, ?, ?)",
        entries,
    )
    conn.commit()
    conn.close()
    return db


def test_targets_all_roots_minus_rejects(tmp_path):
    db = _quran_db(tmp_path, [("Trf", "طرف", 11), ("lwH", "لوح", 6)])
    assert load_hanswehr_targets(db, rejects={"lwH"}) == ["Trf"]


def test_targets_excludes_roots_with_no_root_arabic(tmp_path):
    # root_arabic IS NULL means the root itself was never resolved to Arabic --
    # nothing for `lookup` to convert back and search HW with.
    db = _quran_db(tmp_path, [("Trf", "طرف", 11), ("zzz", None, 99)])
    assert load_hanswehr_targets(db, rejects=set()) == ["Trf"]


def test_load_nominal_shares_computes_share_and_threshold(tmp_path):
    # lwH: 4/4 nominal (N/N/ADJ/PN) -> 1.0 > threshold -> nominal.
    # Trf: 2/3 nominal (N/ADJ, one V) -> ~0.667 < threshold -> not nominal.
    # PN counts as nominal; a root with no segments is absent, not 0-keyed.
    db = _quran_db(
        tmp_path,
        [("lwH", "لوح", 6), ("Trf", "طرف", 11), ("qtl", "قتل", 3)],
        segments=[
            ("lwH", "N"),
            ("lwH", "N"),
            ("lwH", "ADJ"),
            ("lwH", "PN"),
            ("Trf", "N"),
            ("Trf", "ADJ"),
            ("Trf", "V"),
        ],
    )
    shares = load_nominal_shares(db)
    assert shares["lwH"] == 1.0
    assert shares["Trf"] == pytest.approx(2 / 3)
    assert "qtl" not in shares  # no segments -> absent, caller defaults to 0.0
    assert shares["lwH"] > _NOMINAL_THRESHOLD
    assert shares["Trf"] < _NOMINAL_THRESHOLD


def test_build_rows_glosses_and_quarantines():
    idx = {hanswehr.normalize_key("طرف"): [(1, "طرف ṭarafa to blink, wink")]}
    nominal = {"Trf": 0.0, "qtl": 0.0}
    rows, quar, stats = build_rows(idx, ["Trf", "qtl"], {"Trf": {}}, nominal)
    assert ("Trf", "blink, wink") in rows
    assert ("qtl", "not_in_hanswehr", "") in quar
    assert stats["total"] == 2 and stats["glossed"] == 1


def test_build_rows_raises_on_delimiter():
    with pytest.raises(ValueError, match="delimiter"):
        build_rows({}, ["Tr\tf"], {}, {})


def test_build_rows_raises_on_gloss_delimiter(monkeypatch):
    monkeypatch.setattr(
        prepare_hanswehr_glosses,
        "select_gloss",
        lambda _e, **kw: "a\tb",
    )
    idx = {hanswehr.normalize_key("طرف"): [(1, "x")]}
    with pytest.raises(ValueError, match="delimiter"):
        build_rows(idx, ["Trf"], {}, {})


def test_build_rows_quarantines_when_select_gloss_yields_nothing(monkeypatch):
    monkeypatch.setattr(prepare_hanswehr_glosses, "select_gloss", lambda *a, **k: None)
    idx = {hanswehr.normalize_key("طرف"): [(1, "x")]}
    rows, quar, stats = build_rows(idx, ["Trf"], {}, {})
    assert rows == [] and quar == [("Trf", "no_gloss", "")]
    assert stats["no_gloss"] == 1


def test_build_rows_applies_the_nominal_filter_above_the_threshold():
    entries = [(1, "one thing"), (0, "part, portion")]
    idx = {hanswehr.normalize_key("بعض"): entries}
    nominal, _, _ = build_rows(idx, ["bED"], {}, {"bED": 0.95})
    verbal, _, _ = build_rows(idx, ["bED"], {}, {"bED": 0.10})
    assert nominal == [("bED", "part, portion")]
    assert verbal == [("bED", "one thing")]


def test_review_rows_kept_and_quarantined():
    out = review_rows([("Trf", "blink")], [("qtl", "not_in_hanswehr", "")])
    assert ("Trf", "kept", "blink") in out
    assert ("qtl", "not_in_hanswehr", "") in out


def test_main_writes_both_tsvs_and_reports_the_buckets(tmp_path, monkeypatch, capsys):
    hw_db = _hw_db(tmp_path)

    # `qtl` holds a stale row from an earlier import and this run quarantines it
    # (HW has no entry above), so it is what the prune list is for. `Trf` is
    # re-produced and must NOT be pruned -- pruning it would delete the gloss
    # the import is about to reinstall.
    db = _quran_db(
        tmp_path,
        [("Trf", "طرف", 5), ("qtl", "قتل", 3)],
        definitions=[
            ("qtl", "hanswehr", "and"),
            ("Trf", "hanswehr", "stale blink"),
            ("qtl", "qurandev-lane", "to kill"),
        ],
    )
    out, review = tmp_path / "out.tsv", tmp_path / "review.tsv"
    prune = tmp_path / "prune.tsv"

    monkeypatch.setattr(
        prepare_hanswehr_glosses,
        "build_index",
        lambda path: hanswehr.build_index(path, expected=None, anchors={}),
    )
    # `hanswehr_rejects.txt` is Task 6's to fill; nothing here may depend on
    # whether it is still empty.
    monkeypatch.setattr(prepare_hanswehr_glosses, "load_rejects", lambda _p: set())
    # Same for `hanswehr_overrides.tsv`, which task 7 fills: an override for
    # `Trf` would replace `blink, wink` in both out.tsv and the review row, and
    # one for `qtl` would move it off the prune list -- assertions below going
    # red on a pure data change with no code defect.
    monkeypatch.setattr(prepare_hanswehr_glosses, "load_overrides", dict)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "prepare_hanswehr_glosses",
            "--db",
            str(db),
            "--hw",
            str(hw_db),
            "--out",
            str(out),
            "--review",
            str(review),
            "--prune-out",
            str(prune),
        ],
    )

    prepare_hanswehr_glosses.main()

    # Both artifacts open with the source they were computed for; `import-lane`
    # and `prune-definitions` refuse a --source that disagrees with it.
    out_head, out_body = _header_and_body(out)
    prune_head, prune_body = _header_and_body(prune)
    assert out_body == "Trf\tblink, wink\n"
    # Scoped to --source: `qtl`'s Lane row is another dictionary's work and the
    # prune list is fed to a delete command.
    assert prune_body == "qtl\n"
    # And with the same run stamp, which is the half the tag cannot do: every
    # run writes `hanswehr`, so only an equal stamp tells the delete command it
    # is holding the list that belongs to the glosses about to be imported.
    assert out_head.startswith("# source: hanswehr run: ")
    assert out_head == prune_head
    lines = review.read_text("utf-8").splitlines()
    assert lines[0] == "root\tstatus\tgloss\toptions"
    # `Trf` has one entry and no cut-away block, so it offers no alternative and
    # its row stays three columns wide -- the ragged shape is the point.
    assert lines[1:] == ["Trf\tkept\tblink, wink", "qtl\tnot_in_hanswehr\t"]
    summary = capsys.readouterr().out
    assert "1 glossed of 2 targets" in summary and "1 not in HW" in summary
    assert "prune 1 stale hanswehr rows" in summary
    assert "WARNING" not in summary


def test_main_leaves_no_artifact_behind_when_the_review_payload_raises(
    tmp_path, monkeypatch
):
    """The three files are one unit. `candidates` re-slices every kept entry and
    is the likeliest of the three steps to raise; writing --out and --prune-out
    ahead of it left both halves on disk carrying one run stamp and no review
    TSV, which `--pair` accepts -- so the prune and the import would run over a
    corpus no human ever saw, its only trace a file that is not there."""
    hw_db = _hw_db(tmp_path)
    # `qtl` holds a stale row, so the prune list this run would have written is
    # non-empty -- an assertion that it is absent means something.
    db = _quran_db(
        tmp_path,
        [("Trf", "طرف", 5), ("qtl", "قتل", 3)],
        definitions=[("qtl", "hanswehr", "and")],
    )
    out, review = tmp_path / "out.tsv", tmp_path / "review.tsv"
    prune = tmp_path / "prune.tsv"

    monkeypatch.setattr(
        prepare_hanswehr_glosses,
        "build_index",
        lambda path: hanswehr.build_index(path, expected=None, anchors={}),
    )
    monkeypatch.setattr(prepare_hanswehr_glosses, "load_rejects", lambda _p: set())
    monkeypatch.setattr(prepare_hanswehr_glosses, "load_overrides", dict)

    def _boom(*_args, **_kwargs):
        raise RuntimeError("entry text is not sliceable")

    monkeypatch.setattr(prepare_hanswehr_glosses, "candidates", _boom)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "prepare_hanswehr_glosses",
            "--db",
            str(db),
            "--hw",
            str(hw_db),
            "--out",
            str(out),
            "--review",
            str(review),
            "--prune-out",
            str(prune),
        ],
    )

    with pytest.raises(RuntimeError):
        prepare_hanswehr_glosses.main()

    assert not out.exists() and not prune.exists() and not review.exists()


def test_main_removes_an_earlier_pair_when_a_write_fails_after_staging(
    tmp_path, monkeypatch
):
    """Computing all three payloads first shrank the window; it did not close
    it. A failure between installing the pair and installing the review TSV
    still left `--out` and `--prune-out` on disk sharing one stamp, which
    `--pair` accepts.

    Staging moves every realistic failure ahead of the first install. The one
    left is a move that fails, and the danger there is not the half-written run
    -- it is the *previous* run surviving whole: its own two files carry their
    own matching stamps, so `--pair` passes and the operator imports a corpus
    they did not just generate. Both halves go."""
    hw_db = _hw_db(tmp_path)
    db = _quran_db(
        tmp_path,
        [("Trf", "طرف", 5), ("qtl", "قتل", 3)],
        definitions=[("qtl", "hanswehr", "and")],
    )
    out, review = tmp_path / "out.tsv", tmp_path / "review.tsv"
    prune = tmp_path / "prune.tsv"
    # An earlier run's artifacts, internally consistent: same stamp on both
    # halves, so `check_pair` has no complaint about them.
    out.write_text("# source: hanswehr run: older\nTrf\tto blink\n", encoding="utf-8")
    prune.write_text("# source: hanswehr run: older\n", encoding="utf-8")

    monkeypatch.setattr(
        prepare_hanswehr_glosses,
        "build_index",
        lambda path: hanswehr.build_index(path, expected=None, anchors={}),
    )
    monkeypatch.setattr(prepare_hanswehr_glosses, "load_rejects", lambda _p: set())
    monkeypatch.setattr(prepare_hanswehr_glosses, "load_overrides", dict)

    real_replace = os.replace
    calls = []

    def _replace(src, dst):
        calls.append(Path(dst))
        # Keyed on the destination, not on call order: `prepare_hanswehr_glosses
        # .os` is the `os` module itself, so this patch is process-wide for the
        # duration, and a count would fail whatever ran second -- including
        # pytest's own writes -- and report the wrong failure. Keying on the path
        # also stops the test passing vacuously if `_install` ever moves the pair
        # ahead of the review artifact, which is the order it is asserting.
        if Path(dst) in {out, prune}:
            raise OSError("cross-device link")
        real_replace(src, dst)

    monkeypatch.setattr(prepare_hanswehr_glosses.os, "replace", _replace)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "prepare_hanswehr_glosses",
            "--db",
            str(db),
            "--hw",
            str(hw_db),
            "--out",
            str(out),
            "--review",
            str(review),
            "--prune-out",
            str(prune),
        ],
    )

    with pytest.raises(OSError):
        prepare_hanswehr_glosses.main()

    assert not out.exists() and not prune.exists()
    # The review artifact goes first and survives -- its absence is not itself a
    # guard, so nothing else here would notice `_install` dropping it entirely.
    assert calls[0] == review
    assert review.read_text(encoding="utf-8").startswith("root\tstatus\t")
    # No temp files left in the directory either.
    assert not [p.name for p in tmp_path.iterdir() if p.name.endswith(".tmp")]


def test_main_leaves_no_temp_file_when_staging_itself_fails(tmp_path, monkeypatch):
    """The move is not the only fallible step -- `write`, `fsync` and `chmod` all
    run against a temp file that exists. Registering it for cleanup only after
    those succeed leaks whichever one failed: a dotfile beside the artifact it
    never became, invisible to `ls` and to every later run.

    Nothing else notices. The install is all-or-nothing either way, so the run
    still fails with no artifact on disk -- the leak is the one thing left to
    assert."""
    hw_db = _hw_db(tmp_path)
    db = _quran_db(tmp_path, [("Trf", "طرف", 5)])
    out, review = tmp_path / "out.tsv", tmp_path / "review.tsv"
    prune = tmp_path / "prune.tsv"

    monkeypatch.setattr(
        prepare_hanswehr_glosses,
        "build_index",
        lambda path: hanswehr.build_index(path, expected=None, anchors={}),
    )
    monkeypatch.setattr(prepare_hanswehr_glosses, "load_rejects", lambda _p: set())
    monkeypatch.setattr(prepare_hanswehr_glosses, "load_overrides", dict)

    real_chmod = os.chmod

    # Keyed on the suffix for the same reason the move test keys on the
    # destination: the patch lands on the `os` module itself.
    def _chmod(path, mode, **kwargs):
        if str(path).endswith(".tmp"):
            raise OSError("no space left on device")
        real_chmod(path, mode, **kwargs)

    monkeypatch.setattr(prepare_hanswehr_glosses.os, "chmod", _chmod)
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "prepare_hanswehr_glosses",
            "--db",
            str(db),
            "--hw",
            str(hw_db),
            "--out",
            str(out),
            "--review",
            str(review),
            "--prune-out",
            str(prune),
        ],
    )

    with pytest.raises(OSError):
        prepare_hanswehr_glosses.main()

    assert not [p.name for p in tmp_path.iterdir() if p.name.endswith(".tmp")]
    assert not out.exists() and not prune.exists() and not review.exists()


def test_main_warns_when_an_override_is_pruned_instead_of_applied(
    tmp_path, monkeypatch, capsys
):
    """An override for a root Hans Wehr has no entry for cannot ship -- a gloss
    under `source = 'hanswehr'` must come from Hans Wehr -- so the root falls to
    the prune list and the human's *replacement* executes as a *deletion*.

    The deletion is right (the live row is the stale junk Task 7 exists to
    remove), keeping it off the prune list would strand exactly what round 12
    fixed, and the review TSV is not read during the import. So say it on
    stdout, where "0 overrides unused" used to be the only trace."""
    hw_db = _hw_db(tmp_path, entries=())
    db = _quran_db(
        tmp_path,
        [("qtl", "قتل", 3)],
        definitions=[("qtl", "hanswehr", "and")],
    )
    out, review = tmp_path / "out.tsv", tmp_path / "review.tsv"
    prune = tmp_path / "prune.tsv"

    monkeypatch.setattr(
        prepare_hanswehr_glosses,
        "build_index",
        lambda path: hanswehr.build_index(path, expected=None, anchors={}),
    )
    monkeypatch.setattr(prepare_hanswehr_glosses, "load_rejects", lambda _p: set())
    monkeypatch.setattr(
        prepare_hanswehr_glosses, "load_overrides", lambda: {"qtl": "kill, slay"}
    )
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "prepare_hanswehr_glosses",
            "--db",
            str(db),
            "--hw",
            str(hw_db),
            "--out",
            str(out),
            "--review",
            str(review),
            "--prune-out",
            str(prune),
        ],
    )

    prepare_hanswehr_glosses.main()

    assert _header_and_body(prune)[1] == "qtl\n"
    summary = capsys.readouterr().out
    assert "WARNING: 1 override(s) will be DELETED, not applied" in summary
    assert "qtl" in summary.splitlines()[-1]


def test_main_does_not_warn_when_an_override_deliberately_drops_a_root(
    tmp_path, monkeypatch, capsys
):
    """An empty gloss *is* the instruction to delete, and Hans Wehr carries the
    root -- so the prune executes the decision as written. Warning "will be
    DELETED, not applied -- Hans Wehr has no entry" here tells the operator
    their override failed, for a reason that is false."""
    hw_db = _hw_db(tmp_path)
    db = _quran_db(
        tmp_path,
        [("Trf", "طرف", 5)],
        definitions=[("Trf", "hanswehr", "stale blink")],
    )
    out, review = tmp_path / "out.tsv", tmp_path / "review.tsv"
    prune = tmp_path / "prune.tsv"

    monkeypatch.setattr(
        prepare_hanswehr_glosses,
        "build_index",
        lambda path: hanswehr.build_index(path, expected=None, anchors={}),
    )
    monkeypatch.setattr(prepare_hanswehr_glosses, "load_rejects", lambda _p: set())
    monkeypatch.setattr(prepare_hanswehr_glosses, "load_overrides", lambda: {"Trf": ""})
    monkeypatch.setattr(
        sys,
        "argv",
        [
            "prepare_hanswehr_glosses",
            "--db",
            str(db),
            "--hw",
            str(hw_db),
            "--out",
            str(out),
            "--review",
            str(review),
            "--prune-out",
            str(prune),
        ],
    )

    prepare_hanswehr_glosses.main()

    # The drop still reaches the prune list -- that is what deletes the row.
    assert _header_and_body(prune)[1] == "Trf\n"
    assert "WARNING" not in capsys.readouterr().out


# ---- phase 24, task 5: human overrides and the candidate columns.


def test_load_overrides_reads_root_and_gloss(tmp_path):
    p = tmp_path / "ov.tsv"
    p.write_text("# comment\n\nArD\tearth; land, country\nEZm\t\n", encoding="utf-8")
    assert load_overrides(p) == {"ArD": "earth; land, country", "EZm": ""}


@pytest.mark.parametrize(
    "body,message",
    [
        # No tab: `partition` would hand back an empty gloss, and an empty gloss
        # means "drop this root" -- one missing keystroke deletes a definition.
        ("ArD earth; land, country\n", "expected root"),
        ("ArD\tearth\nArD\tland\n", "duplicate"),
        # Blank root cell: not an empty line and not a missing tab, so both
        # guards above pass it. The "" key matches no target, and the decision
        # is reported as an unused override rather than as the typo it is.
        ("   \tearth\n", "blank root"),
    ],
)
def test_load_overrides_rejects_a_line_that_would_silently_lose_a_decision(
    tmp_path, body, message
):
    p = tmp_path / "ov.tsv"
    p.write_text(body, encoding="utf-8")
    with pytest.raises(ValueError, match=message):
        load_overrides(p)


def test_the_shipped_overrides_file_parses():
    """A typo in it would surface as a wrong gloss in the live import rather
    than an error -- parse it here.

    Asserts it *parses*, not that it is empty. Task 7 populates this same file,
    and an `== {}` assertion would turn a pure data change red, whose obvious
    fix is deleting the only check the file has.
    """
    overrides = load_overrides()
    assert isinstance(overrides, dict)
    assert not [root for root, gloss in overrides.items() if "\t" in root + gloss]


def test_candidates_offer_the_verbal_the_nominal_and_the_cut_away_blocks():
    """`select_gloss` cuts at `<b>` (derived form) and `" -- "` (a second Form-I
    headword); for some roots the Quranic sense lives in exactly what it cut.
    `kfr` is the measured case -- "be an infidel" sits past the dash."""
    entries = [
        (
            1,
            "كفر kafara i (kafr) to cover, hide; -- (kufr) to be irreligious, "
            "be an infidel, not to believe",
        ),
        (0, "كفر kafr small village, hamlet"),
    ]
    got = candidates(entries, root="kfr")
    assert "cover, hide" in got
    assert any("infidel" in c for c in got)
    assert any("village" in c for c in got)


def test_candidates_reads_the_derived_form_block_past_its_closing_tag():
    """The block after `<b>IV</b>` is a gloss; the roman numeral is not part of
    it, so slicing at `<b>` alone would prefix every candidate with "IV"."""
    entries = [(1, "رسل رسل rasila to be long <b>IV</b> to send out, dispatch")]
    assert "send out, dispatch" in candidates(entries, root="rsl")


def test_candidates_ignores_an_em_dash_placeholder_inside_a_parenthesis():
    """`_dash_cut` and not `find(" -- ")`: HW also writes `--` inside a grammar
    parenthesis as a stand-in for the headword, which opens no second entry.
    A bare find would offer the parenthesis's tail as if it were a gloss."""
    entries = [(1, "مسخ masaḫa to transform (من – الى ه s.o. from -- into) to distort")]
    assert candidates(entries, root="msx") == ["transform to distort"]


def test_candidates_offer_a_second_head_the_dash_cut_does_not_reach():
    """`_dash_cut` only knows the bare `" -- "` spelling. `select_gloss` also
    cuts on `_SECOND_HEAD`'s en/em dashes and on a page number between the two,
    and offering only `_dash_cut`'s block hid the removed sense from the human
    gate on 7 of the 1642 targets -- `zkw` "grow, increase", `syH` "travel,
    journey", `wjf` "throb, beat", several of them the Quranic sense."""
    entries = [(1, "زكو zakā u to thrive; 571 – zakiya a to grow, increase")]
    got = candidates(entries, root="zkw")
    assert got[0] == "thrive"
    assert "grow, increase" in got


def test_candidates_cut_blocks_come_from_the_nominal_entry_too():
    """A nominal-share root ships `entries`' first `is_root == 0` entry, so its
    cut-away blocks are the ones the reviewer needs. Reading them off
    `entries[0]` -- the verb -- hid a sense on 63 of the 1642 targets."""
    entries = [
        (1, "عبد ‘abada to serve, worship"),
        (0, "عبد ‘abd slave, serf; -- servant (of God), human being, man"),
    ]
    got = candidates(entries, root="Ebd")
    assert "slave, serf" in got
    assert any("servant (of God)" in c for c in got)


def test_candidates_are_distinct_and_drop_nothing_to_a_duplicate():
    entries = [(1, "طود ṭaud mountain")]
    assert candidates(entries, root="Twd") == ["mountain"]


def test_candidates_of_no_entries_is_empty():
    assert candidates([], root="zzz") == []


def test_build_rows_applies_an_override():
    idx = {hanswehr.normalize_key("ارض"): [(1, "ارض arḍ termite")]}
    rows, quar, stats = build_rows(
        idx, ["ArD"], {}, {}, overrides={"ArD": "earth; land, country"}
    )
    assert rows == [("ArD", "earth; land, country")]
    assert stats["overridden"] == 1


def test_build_rows_drops_a_root_whose_override_is_empty():
    idx = {hanswehr.normalize_key("ارض"): [(1, "ارض arḍ termite")]}
    rows, quar, stats = build_rows(idx, ["ArD"], {}, {}, overrides={"ArD": ""})
    assert rows == []
    assert quar == [("ArD", "dropped_by_override", "")]
    assert stats["dropped_by_override"] == 1


def test_an_override_for_a_root_hans_wehr_does_not_carry_is_not_applied():
    """Overrides correct which HW sense ships, they do not invent one: a gloss
    written here for a root HW has no entry for would be stored under
    `source = 'hanswehr'` while coming from nowhere in Hans Wehr.

    It is not silently ignored, though: it comes back as `unused_override`, so
    the human sees that their decision did not ship instead of reading a missing
    gloss as the override taking effect.

    Exactly one row, not one per cause. Both apply -- the root is absent from HW
    *and* its override went unused -- but two rows under one root is a duplicate
    the baseline refuses to load, so the run that emitted them would leave the
    gate unrunnable. `stats` still counts both.
    """
    rows, quar, stats = build_rows({}, ["zzz"], {}, {}, overrides={"zzz": "invented"})
    assert rows == []
    assert quar == [("zzz", "unused_override", "")]
    assert stats["unused_overrides"] == 1
    assert stats["not_in_hanswehr"] == 1


def test_the_baseline_can_read_a_run_whose_override_names_an_absent_root(tmp_path):
    """The regression the single row exists for, exercised through the gate.

    `build_rows` emitting a second row for `zzz` is invisible until the baseline
    is written and read back, which is where it raises -- so asserting on
    `quarantined` alone would not have caught it.
    """
    from tools import hanswehr_baseline

    rows, quar, _ = build_rows({}, ["zzz"], {}, {}, overrides={"zzz": "invented"})
    baseline = tmp_path / "b.tsv"
    hanswehr_baseline.write(
        baseline,
        sorted((row[0], row[1], "-", row[2]) for row in review_rows(rows, quar)),
    )
    assert hanswehr_baseline.read(baseline) == {"zzz": ("unused_override", "-", "")}


def test_an_override_for_a_root_that_is_not_a_target_is_reported():
    """The mistyped-root case: `ArDD` is nobody's root, so the loop never sees
    it and the human's decision evaporates with nothing printed.

    Same silent-loss shape `load_overrides` raises for and
    `delete_root_definitions` reports -- and the likeliest one, since this file
    is hand-edited Buckwalter.
    """
    idx = {hanswehr.normalize_key("ارض"): [(1, "ارض arḍ earth")]}
    rows, quar, stats = build_rows(
        idx, ["ArD"], {}, {}, overrides={"ArD": "earth; land", "ArDD": "typo"}
    )
    assert rows == [("ArD", "earth; land")]
    assert quar == [("ArDD", "unused_override", "")]
    assert stats["unused_overrides"] == 1


def test_an_override_gloss_with_a_tab_raises():
    idx = {hanswehr.normalize_key("ارض"): [(1, "ارض arḍ termite")]}
    with pytest.raises(ValueError, match="delimiter"):
        build_rows(idx, ["ArD"], {}, {}, overrides={"ArD": "earth\tland"})


def test_review_rows_appends_the_options_for_a_flagged_root_only():
    out = review_rows(
        [("Trf", "blink"), ("Twd", "mountain")],
        [("qtl", "not_in_hanswehr", "")],
        options={"Trf": ["glance", "extremity"]},
    )
    assert out == [
        ("Trf", "kept", "blink", "glance", "extremity"),
        ("Twd", "kept", "mountain"),
        ("qtl", "not_in_hanswehr", ""),
    ]
