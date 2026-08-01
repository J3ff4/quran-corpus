"""Tests for the corpus form-gloss preparation helpers.

Snapshot bodies here are synthetic and gzipped in ``tmp_path`` at test time --
never a copy of a real archived page (§9).
"""

import gzip
import sqlite3
from pathlib import Path

import pytest

from scraper.sources.corpus_form_glosses import FormGloss
from tools.prepare_corpus_form_glosses import (
    build_rows,
    iter_root_glosses,
    join_glosses,
    load_defless_roots,
    main,
)

VERB = '<html><body><h4 class="dxe">Verb (form I) -to strike</h4></body></html>'


def test_join_glosses_dedupes_and_orders():
    # Two forms sharing a sense must not print it twice (نصر: form I and form
    # VI are both "to help").
    got = join_glosses(
        [
            FormGloss("Verb (form I)", "to help"),
            FormGloss("Verb (form VI)", "to help"),
            FormGloss("Verb (form X)", "to seek help"),
        ]
    )
    assert got == "to help; to seek help"


def test_join_glosses_drops_a_gloss_whose_senses_were_all_printed():
    # The corpus repeats a sense on its own after listing it inside a wider
    # gloss ("to turn away, to avert, to hinder" then bare "to hinder"), which
    # an exact-string test keeps -- 8 such senses across the 155 roots this
    # tool produces, printed to the reader as an unexplained repetition.
    got = join_glosses(
        [
            FormGloss("Verb (form I)", "to turn away, to avert, to hinder"),
            FormGloss("Verb (form II)", "to hinder"),
        ]
    )
    assert got == "to turn away, to avert, to hinder"


def test_join_glosses_keeps_a_gloss_carrying_one_new_sense():
    # Only an ENTIRELY-covered gloss is dropped. "to announce" repeats, but
    # "to declare" is new, so the pair must survive intact rather than being
    # split apart or dropped whole.
    got = join_glosses(
        [
            FormGloss("Verb (form IV)", "to announce, to proclaim"),
            FormGloss("Verb (form X)", "to announce, to declare"),
        ]
    )
    assert got == "to announce, to proclaim; to announce, to declare"


def test_join_glosses_keeps_a_sense_merely_contained_in_another():
    # Substring containment would be the shorter test and is wrong: it drops
    # "permission" because "to ask permission" was printed. Distinct senses.
    got = join_glosses(
        [
            FormGloss("Verb (form X)", "to ask permission"),
            FormGloss("Noun", "permission"),
        ]
    )
    assert got == "to ask permission; permission"


def test_join_glosses_empty():
    assert join_glosses([]) == ""


def _snapshot(dirpath: Path, filename: str, body: str) -> None:
    (dirpath / filename).write_bytes(gzip.compress(body.encode("utf-8")))


def test_iter_root_glosses_decodes_percent_encoded_filenames(tmp_path: Path):
    # Snapshot filenames percent-encode uppercase ASCII, so "$Am" is stored as
    # "root_%24%41m.html.gz". Reading them back requires unquoting; getting it
    # wrong silently yields keys that match no root and imports nothing.
    _snapshot(
        tmp_path,
        "root_%24%41m.html.gz",
        '<html><body><h4 class="dxe">Verb (form I) -to strike</h4></body></html>',
    )
    got = dict(iter_root_glosses(tmp_path))
    assert list(got) == ["$Am"]
    assert got["$Am"] == [FormGloss("Verb (form I)", "to strike")]


def test_iter_root_glosses_keeps_buckwalter_case_distinct(tmp_path: Path):
    # z is ز and Z is ظ -- different letters, different roots. Case-folding the
    # decoded key would silently merge zlm (ز ل م) into Zlm (ظ ل م).
    _snapshot(
        tmp_path,
        "root_zlm.html.gz",
        '<html><body><h4 class="dxe">Verb (form I) -to swallow</h4></body></html>',
    )
    _snapshot(
        tmp_path,
        "root_%5Alm.html.gz",
        '<html><body><h4 class="dxe">Verb (form I) -to oppress</h4></body></html>',
    )
    got = dict(iter_root_glosses(tmp_path))
    assert sorted(got) == ["Zlm", "zlm"]
    assert got["Zlm"] == [FormGloss("Verb (form I)", "to oppress")]


def test_iter_root_glosses_prefers_the_canonical_name_over_a_legacy_one(tmp_path: Path):
    # One root can own both names: the pre-bdd7e7b encoder left uppercase
    # literal, the current one escapes it, and the migration refuses to clobber.
    # '%' (0x25) sorts before 'Z' (0x5A), so a plain name-sorted walk yields the
    # stale legacy copy last and lets it win the upsert. Only the current
    # encoder writes the canonical name, so it is always the fresher of the two.
    _snapshot(tmp_path, "root_Zlm.html.gz", '<h4 class="dxe">Verb (form I) -stale</h4>')
    _snapshot(
        tmp_path, "root_%5Alm.html.gz", '<h4 class="dxe">Verb (form I) -fresh</h4>'
    )
    got = dict(iter_root_glosses(tmp_path))
    assert got == {"Zlm": [FormGloss("Verb (form I)", "fresh")]}


def test_iter_root_glosses_ignores_unrelated_files(tmp_path: Path):
    _snapshot(
        tmp_path, "root_qwl.html.gz", '<h4 class="dxe">Verb (form I) -to say</h4>'
    )
    (tmp_path / "checkpoint.json").write_text("{}")
    (tmp_path / "word_qwl.html.gz").write_bytes(gzip.compress(b"<html></html>"))
    assert [bw for bw, _ in iter_root_glosses(tmp_path)] == ["qwl"]


def test_iter_root_glosses_yields_empty_for_bare_headers(tmp_path: Path):
    # A noun-only root still yields an entry, with no glosses. The caller
    # decides what to do with it; silently dropping it here would hide the
    # 101 roots that legitimately have nothing to import.
    _snapshot(tmp_path, "root_Ahl.html.gz", '<h4 class="dxe">Noun</h4>')
    assert dict(iter_root_glosses(tmp_path)) == {"Ahl": []}


def test_build_rows_filters_to_known_roots(tmp_path: Path):
    # An unrecognised root code must never reach the importer: it calls
    # get_or_create_root, so it would insert a root the corpus never had.
    _snapshot(tmp_path, "root_Drb.html.gz", VERB)
    _snapshot(tmp_path, "root_zzz.html.gz", VERB)
    rows, stats = build_rows(tmp_path, valid_roots={"Drb"})
    assert rows == [("Drb", "to strike")]
    assert stats["unknown_root"] == 1
    assert stats["kept"] == 1


def test_build_rows_drops_roots_with_no_gloss(tmp_path: Path):
    # Paired with a root that does yield one, because a run that keeps nothing
    # at all now raises -- see test_build_rows_raises_when_every_candidate_is_
    # gloss_less. What this pins is the per-root drop, not the empty run.
    _snapshot(tmp_path, "root_Ahl.html.gz", '<h4 class="dxe">Noun</h4>')
    _snapshot(tmp_path, "root_Drb.html.gz", VERB)
    rows, stats = build_rows(tmp_path, valid_roots={"Ahl", "Drb"})
    assert rows == [("Drb", "to strike")]
    assert stats["no_gloss"] == 1


def test_build_rows_only_roots_narrows_output(tmp_path: Path):
    # This is what implements the "import only the definition-less roots"
    # decision -- no second code path. `main` passes it unless --all is given.
    for bw in ("Drb", "qwl"):
        _snapshot(tmp_path, f"root_{bw}.html.gz", VERB)
    rows, stats = build_rows(tmp_path, valid_roots={"Drb", "qwl"}, only_roots={"qwl"})
    assert [r[0] for r in rows] == ["qwl"]
    assert stats["skipped"] == 1


@pytest.mark.parametrize("bad", ["\t", "\n", "\r"])
def test_build_rows_rejects_tsv_delimiters(tmp_path: Path, bad: str, monkeypatch):
    # The TSV has no quoting, so a delimiter inside a definition shifts every
    # column after it and `import-lane` writes one root's text onto another.
    # `join_glosses` cannot produce one today, so the only way to reach the
    # guard is to bypass it -- which is the point: the guard must not depend on
    # the joiner staying as it is.
    import tools.prepare_corpus_form_glosses as mod

    _snapshot(tmp_path, "root_Drb.html.gz", VERB)
    monkeypatch.setattr(mod, "join_glosses", lambda _g: f"to strike{bad}to set forth")
    with pytest.raises(ValueError, match="TSV delimiter"):
        mod.build_rows(tmp_path, valid_roots={"Drb"})


def test_build_rows_raises_on_an_empty_archive(tmp_path: Path):
    # The archive is nested (.snapshots/roots), so passing .snapshots reads zero
    # snapshots, writes an empty TSV, and prints a success line. Hit for real
    # while verifying this tool.
    with pytest.raises(ValueError, match="no root snapshots"):
        build_rows(tmp_path, valid_roots={"Drb"})


def test_build_rows_raises_on_an_empty_root_set(tmp_path: Path):
    # Same failure the empty-archive guard catches, reached the other way: a
    # wrong or freshly-created --db means every snapshot is `unknown_root`, so
    # `total` is non-zero, the guard above never fires, and the run writes an
    # empty TSV and reports success.
    _snapshot(tmp_path, "root_Drb.html.gz", VERB)
    with pytest.raises(ValueError, match="no roots in the DB"):
        build_rows(tmp_path, valid_roots=set())


def test_build_rows_raises_when_nothing_is_left_to_fill(tmp_path: Path):
    # `only_roots=set()` means every root already has a definition. Silently
    # emitting nothing looks identical to a broken --snapshots path.
    _snapshot(tmp_path, "root_Drb.html.gz", VERB)
    with pytest.raises(ValueError, match="nothing to do"):
        build_rows(tmp_path, valid_roots={"Drb"}, only_roots=set())


def test_build_rows_raises_when_a_regenerated_root_loses_its_gloss(tmp_path: Path):
    # A --refresh run re-emits roots this tool already filled. `import-lane`
    # upserts and never deletes, so one that now parses to nothing keeps its
    # stale definition live on the site while the run reports success and files
    # it under `no_gloss` -- indistinguishable from a root that never had one.
    _snapshot(tmp_path, "root_Ahl.html.gz", '<h4 class="dxe">Noun</h4>')
    _snapshot(tmp_path, "root_Drb.html.gz", VERB)
    valid = {"Ahl", "Drb"}
    # Without must_yield the same input is a normal, correct run: Ahl is a root
    # that simply has no gloss upstream.
    rows, _ = build_rows(tmp_path, valid_roots=valid, only_roots=valid)
    assert [r[0] for r in rows] == ["Drb"]
    with pytest.raises(ValueError, match="cannot delete: Ahl"):
        build_rows(tmp_path, valid_roots=valid, only_roots=valid, must_yield={"Ahl"})


def test_build_rows_raises_when_a_regenerated_root_has_no_snapshot(tmp_path: Path):
    # The same stranding reached without the empty-gloss branch. `must_yield`
    # comes from the DB; the archive is an independent untracked directory, so
    # a root can be missing from it entirely -- the loop never visits it, and a
    # guard keyed on the no-gloss branch would let the run succeed with the
    # stale definition still live. The test is what reached the output.
    _snapshot(tmp_path, "root_Drb.html.gz", VERB)
    with pytest.raises(ValueError, match="cannot delete: Ahl"):
        build_rows(
            tmp_path,
            valid_roots={"Ahl", "Drb"},
            only_roots={"Ahl", "Drb"},
            must_yield={"Ahl"},
        )


def test_build_rows_raises_when_a_regenerated_root_is_not_a_db_root(tmp_path: Path):
    # Third route to the same stranding: the snapshot exists and yields a
    # gloss, but the root is gone from `valid_roots`, so it is counted under
    # `unknown_root` and skipped before the definition is ever built.
    _snapshot(tmp_path, "root_Ahl.html.gz", VERB)
    _snapshot(tmp_path, "root_Drb.html.gz", VERB)
    with pytest.raises(ValueError, match="cannot delete: Ahl"):
        build_rows(tmp_path, valid_roots={"Drb"}, must_yield={"Ahl"})


def _defs_db(tmp_path: Path, rows: str) -> Path:
    """Minimal roots + root_definitions DB. `rows` is a VALUES list body."""
    db = tmp_path / "t.db"
    con = sqlite3.connect(db)
    # noqa justification: `rows` is a literal written by the test directly
    # below each call, and the target is a throwaway tmp_path DB. No caller
    # passes external input, so there is no injection path for S608 to guard.
    # The directive sits on the first string, not on `executescript(` -- ruff
    # anchors the diagnostic to the start of the concatenated SQL, so on the
    # call line it is silently inert (verified: the finding still fired).
    con.executescript(
        "CREATE TABLE roots(id INTEGER PRIMARY KEY, root_buckwalter TEXT);"  # noqa: S608
        "CREATE TABLE root_definitions(id INTEGER PRIMARY KEY, root_id INT,"
        " source TEXT, definition TEXT);"
        "INSERT INTO roots VALUES (1,'Drb'),(2,'Ahl'),(3,'qwl');"
        f"INSERT INTO root_definitions VALUES {rows};"
    )
    con.commit()
    con.close()
    return db


def test_load_defless_roots_selects_only_roots_with_no_definition(tmp_path: Path):
    db = _defs_db(tmp_path, "(1,1,'qurandev-lane','to strike')")
    assert load_defless_roots(db) == {"Ahl", "qwl"}


def test_load_defless_roots_refresh_readmits_roots_this_tool_filled(tmp_path: Path):
    # Without --refresh the tool is one-shot: the rows the first import wrote
    # are exactly what the default filter excludes, so a parser fix has no way
    # to reach the roots it needs to correct.
    db = _defs_db(
        tmp_path,
        "(1,1,'corpus-forms','to strike'),(2,3,'qurandev-lane','to say')",
    )
    assert load_defless_roots(db) == {"Ahl"}
    assert load_defless_roots(db, "corpus-forms") == {"Ahl", "Drb"}


def test_load_defless_roots_refresh_skips_roots_holding_another_source(tmp_path: Path):
    # Re-importing one of these would sit a corpus gloss beside a Lane entry --
    # the promotion option (b) exists to prevent. Refresh must not widen to it.
    db = _defs_db(
        tmp_path,
        "(1,1,'corpus-forms','to strike'),(2,1,'qurandev-lane','LANE: to strike')",
    )
    assert load_defless_roots(db, "corpus-forms") == {"Ahl", "qwl"}


def test_load_defless_roots_refresh_on_an_unknown_source_is_a_noop(tmp_path: Path):
    db = _defs_db(tmp_path, "(1,1,'qurandev-lane','to strike')")
    assert load_defless_roots(db, "not-a-source") == load_defless_roots(db)


def _run_main(monkeypatch, snaps: Path, db: Path, out: Path, *flags: str) -> list[str]:
    """Invoke the CLI end to end and return the TSV's lines.

    Through ``sys.argv`` rather than a refactored ``main(argv)``: the argument
    wiring -- which flags conflict, which one selects the filter, what reaches
    ``build_rows`` -- is the part under test, so it has to be the real parser.
    """
    import sys

    argv = ["prepare_corpus_form_glosses", "--snapshots", str(snaps), "--db", str(db)]
    monkeypatch.setattr(sys, "argv", [*argv, "--out", str(out), *flags])
    main()
    return out.read_text(encoding="utf-8").splitlines()


def _cli_fixture(tmp_path: Path, defs: str) -> tuple[Path, Path, Path]:
    """Snapshot dir + DB + output path. Drb and qwl gloss; Ahl is noun-only."""
    snaps = tmp_path / "snaps"
    snaps.mkdir()
    _snapshot(snaps, "root_Drb.html.gz", VERB)
    _snapshot(snaps, "root_qwl.html.gz", '<h4 class="dxe">Verb (form I) -to say</h4>')
    _snapshot(snaps, "root_Ahl.html.gz", '<h4 class="dxe">Noun</h4>')
    return snaps, _defs_db(tmp_path, defs), tmp_path / "out.tsv"


def test_main_defaults_to_the_definition_less_roots(tmp_path: Path, monkeypatch):
    # Option (b): fill the gaps, never sit a corpus gloss beside a Lane entry.
    # Drb already holds one, so the default run must leave it alone.
    snaps, db, out = _cli_fixture(tmp_path, "(1,1,'qurandev-lane','to strike')")
    assert _run_main(monkeypatch, snaps, db, out) == ["qwl\tto say"]


def test_main_all_emits_every_root_that_glosses(tmp_path: Path, monkeypatch):
    # Option (a). Ahl is absent because it has no gloss upstream, not because
    # it was filtered -- --all bypasses the filter, not the parser.
    snaps, db, out = _cli_fixture(tmp_path, "(1,1,'qurandev-lane','to strike')")
    got = _run_main(monkeypatch, snaps, db, out, "--all")
    assert sorted(got) == ["Drb\tto strike", "qwl\tto say"]


def test_main_refresh_re_emits_only_this_tools_own_rows(tmp_path: Path, monkeypatch):
    # Drb's only definition is corpus-forms, so --refresh readmits it; qwl's is
    # Lane's, so it stays excluded even though the snapshot glosses fine.
    snaps, db, out = _cli_fixture(
        tmp_path, "(1,1,'corpus-forms','stale'),(2,3,'qurandev-lane','to say')"
    )
    assert _run_main(monkeypatch, snaps, db, out, "--refresh", "corpus-forms") == [
        "Drb\tto strike"
    ]


def test_main_refresh_raises_when_a_regenerated_root_stops_glossing(
    tmp_path: Path, monkeypatch
):
    # The wiring the must_yield guard depends on: main has to derive the
    # regenerating set and pass it down. Ahl holds a corpus-forms row and its
    # snapshot is noun-only, so re-importing would leave the stale text live.
    snaps, db, out = _cli_fixture(tmp_path, "(1,2,'corpus-forms','stale')")
    with pytest.raises(ValueError, match="cannot delete: Ahl"):
        _run_main(monkeypatch, snaps, db, out, "--refresh", "corpus-forms")
    assert not out.exists()


def test_main_rejects_all_with_refresh(tmp_path: Path, monkeypatch):
    # --all already emits every root; accepting both would let the operator
    # believe the run was narrowed when it was not.
    snaps, db, out = _cli_fixture(tmp_path, "(1,1,'corpus-forms','stale')")
    with pytest.raises(SystemExit):
        _run_main(monkeypatch, snaps, db, out, "--all", "--refresh", "corpus-forms")


def test_build_rows_raises_when_every_candidate_is_gloss_less(tmp_path: Path):
    # The re-run case: after an import, the default filter leaves only the 101
    # roots the corpus publishes no gloss for. `total` and `only_roots` are both
    # non-zero, so neither earlier guard fires, and this used to overwrite a
    # good TSV with an empty one and print a success line.
    _snapshot(tmp_path, "root_Ahl.html.gz", '<h4 class="dxe">Noun</h4>')
    with pytest.raises(ValueError, match="no definitions to write"):
        build_rows(tmp_path, valid_roots={"Ahl"}, only_roots={"Ahl"})
