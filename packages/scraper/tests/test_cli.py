import sqlite3
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from click.testing import CliRunner

from scraper.checkpoint import Checkpoint
from scraper.cli import main
from scraper.source_header import check_pair, header


@pytest.fixture
def runner():
    return CliRunner()


def test_seed_command_exits_zero(runner, tmp_path):
    db = str(tmp_path / "test.db")
    result = runner.invoke(main, ["seed", "--db", db])
    assert result.exit_code == 0
    assert "Seed complete" in result.output


def test_seed_command_creates_languages(runner, tmp_path):
    db = str(tmp_path / "test.db")
    runner.invoke(main, ["seed", "--db", db])
    conn = sqlite3.connect(db)
    count = conn.execute("SELECT COUNT(*) FROM languages").fetchone()[0]
    conn.close()
    assert count == 4  # ar, en, uz, ru


def test_seed_command_creates_surahs(runner, tmp_path):
    db = str(tmp_path / "test.db")
    runner.invoke(main, ["seed", "--db", db])
    conn = sqlite3.connect(db)
    count = conn.execute("SELECT COUNT(*) FROM surahs").fetchone()[0]
    conn.close()
    assert count == 114


def test_seed_command_is_idempotent(runner, tmp_path):
    db = str(tmp_path / "test.db")
    result1 = runner.invoke(main, ["seed", "--db", db])
    result2 = runner.invoke(main, ["seed", "--db", db])
    assert result1.exit_code == 0
    assert result2.exit_code == 0


def test_scrape_command_calls_seed_first(runner, tmp_path):
    """scrape seeds the DB then attempts scraping; mock httpx to avoid real HTTP.

    Runs on the default --rate-limit rather than forcing it to 0: the floor
    (CLAUDE.md §11) rejects sub-1.5s values, and the value is incidental here.
    The scrape path's sleep is patched at its source module so the test pays no
    real delay.
    """
    db = str(tmp_path / "test.db")
    with (
        patch("scraper.sources.corpus_quran.httpx.Client") as mock_client_cls,
        patch("scraper.sources.corpus_quran.time.sleep"),
    ):
        mock_client = mock_client_cls.return_value.__enter__.return_value
        mock_resp = MagicMock()
        mock_resp.text = "<html><body></body></html>"
        mock_client.get.return_value = mock_resp
        result = runner.invoke(main, ["scrape", "--db", db, "--surah", "1"])

    # Bind and assert the exit code: without it a click usage error (exit 2)
    # slips through silently and the test fails on the confusing empty-table
    # assertion below instead of naming the real cause.
    assert result.exit_code == 0, result.output

    conn = sqlite3.connect(db)
    count = conn.execute("SELECT COUNT(*) FROM surahs").fetchone()[0]
    conn.close()
    assert count == 114  # seed ran


def test_scrape_command_rejects_sub_floor_rate_limit(runner, tmp_path):
    """CLAUDE.md §11's ~1 req/1.5-2s floor is enforced by click, not by trust."""
    db = str(tmp_path / "test.db")
    with patch("scraper.sources.corpus_quran.scrape_chapter") as mock_scrape:
        result = runner.invoke(
            main, ["scrape", "--db", db, "--surah", "1", "--rate-limit", "0.1"]
        )

    assert result.exit_code != 0
    assert "1.5" in result.output  # click names the accepted range
    mock_scrape.assert_not_called()  # rejected before any request went out


def test_import_tanzil_command(runner, tmp_path):
    db = str(tmp_path / "test.db")
    xml_path = str(Path(__file__).parent / "fixtures" / "tanzil_sample.xml")
    runner.invoke(main, ["seed", "--db", db])
    result = runner.invoke(main, ["import-tanzil", xml_path, "--db", db])
    assert result.exit_code == 0
    assert "Import complete" in result.output


def test_import_quranenc_command(runner, tmp_path):
    db = str(tmp_path / "test.db")
    json_path = str(Path(__file__).parent / "fixtures" / "quranenc_sample.json")
    runner.invoke(main, ["seed", "--db", db])
    # Must import Tanzil first so ayahs exist
    xml_path = str(Path(__file__).parent / "fixtures" / "tanzil_sample.xml")
    runner.invoke(main, ["import-tanzil", xml_path, "--db", db])
    result = runner.invoke(
        main,
        ["import-quranenc", json_path, "en", "Test Translator", "--db", db],
    )
    assert result.exit_code == 0
    assert "Import complete" in result.output


def test_rescrape_formless_roots_is_registered():
    assert "rescrape-formless-roots" in main.commands


def test_rescrape_formless_roots_no_op_on_clean_db(runner, tmp_path):
    # Empty DB -> no formless roots -> must exit 0 without making any request.
    db = str(tmp_path / "t.db")
    runner.invoke(main, ["seed", "--db", db])
    result = runner.invoke(
        main,
        [
            "rescrape-formless-roots",
            "--db",
            db,
            "--checkpoint",
            str(tmp_path / "c.json"),
            "--snapshot-dir",
            str(tmp_path / "snaps"),
        ],
    )
    assert result.exit_code == 0
    assert "nothing to do" in result.output


def test_rescrape_formless_roots_targets_only_formless(runner, tmp_path):
    """The recovery path: clear only the formless roots' checkpoint keys.

    A root that already has forms must keep its key (or the run redoes the
    ~930 roots this command exists to skip) and must stay out of the scrape.
    """
    db = str(tmp_path / "t.db")
    runner.invoke(main, ["seed", "--db", db])
    conn = sqlite3.connect(db)
    conn.execute(
        "INSERT INTO roots (root_buckwalter, root_arabic, occurrence_count)"
        " VALUES ('ArD', ?, 461), ('ktb', ?, 319)",
        ("أرض", "كتب"),
    )
    conn.execute(
        "INSERT INTO root_forms (root_id, sort_order, pos_label, form_arabic,"
        " occurrence_count) SELECT id, 0, 'Noun', ?, 260 FROM roots"
        " WHERE root_buckwalter = 'ktb'",
        ("كِتَٰب",),
    )
    conn.commit()
    conn.close()

    ckpt_path = tmp_path / "c.json"
    ckpt = Checkpoint(str(ckpt_path))
    ckpt.mark_done("root_ArD")
    ckpt.mark_done("root_ktb")

    snap_dir = str(tmp_path / "snaps")
    with patch(
        "scraper.sources.dictionary_scrape.scrape_dictionary", return_value=1
    ) as mock_scrape:
        result = runner.invoke(
            main,
            [
                "rescrape-formless-roots",
                "--db",
                db,
                "--checkpoint",
                str(ckpt_path),
                "--snapshot-dir",
                snap_dir,
            ],
        )

    assert result.exit_code == 0
    mock_scrape.assert_called_once()
    assert mock_scrape.call_args.kwargs["roots"] == ["ArD"]
    assert mock_scrape.call_args.kwargs["snapshot_dir"] == snap_dir

    # Re-read from disk: clear() must have persisted, or a resumed run skips
    # the very root it was told to redo.
    reloaded = Checkpoint(str(ckpt_path))
    assert not reloaded.is_done("root_ArD")
    assert reloaded.is_done("root_ktb")


def test_rescrape_formless_roots_requires_an_explicit_checkpoint(runner, tmp_path):
    # Sharing the main dict_checkpoint.json silently rewrites the state the
    # full scrape resumes from. Make the operator name the file.
    db = str(tmp_path / "t.db")
    runner.invoke(main, ["seed", "--db", db])
    result = runner.invoke(main, ["rescrape-formless-roots", "--db", db])
    assert result.exit_code != 0
    assert "checkpoint" in result.output.lower()


def _seed_roots(db: str) -> None:
    conn = sqlite3.connect(db)
    conn.execute(
        "INSERT INTO roots (root_buckwalter, root_arabic, occurrence_count)"
        " VALUES ('$Tn', ?, 88), ('ktb', ?, 319)",
        ("ش ط ن", "كتب"),
    )
    conn.commit()
    conn.close()


def _root_arabic(db: str, bw: str) -> str:
    conn = sqlite3.connect(db)
    val = conn.execute(
        "SELECT root_arabic FROM roots WHERE root_buckwalter = ?", (bw,)
    ).fetchone()[0]
    conn.close()
    return val


def test_normalize_root_arabic_compacts_spaced_roots(runner, tmp_path):
    db = str(tmp_path / "t.db")
    runner.invoke(main, ["seed", "--db", db])
    _seed_roots(db)
    result = runner.invoke(main, ["normalize-root-arabic", "--db", db])
    assert result.exit_code == 0
    assert "1 roots updated" in result.output
    assert _root_arabic(db, "$Tn") == "شطن"  # شطن
    assert _root_arabic(db, "ktb") == "كتب"  # كتب, untouched


def test_normalize_root_arabic_is_idempotent(runner, tmp_path):
    db = str(tmp_path / "t.db")
    runner.invoke(main, ["seed", "--db", db])
    _seed_roots(db)
    runner.invoke(main, ["normalize-root-arabic", "--db", db])
    second = runner.invoke(main, ["normalize-root-arabic", "--db", db])
    assert second.exit_code == 0
    assert "0 roots updated" in second.output


def test_normalize_root_arabic_keeps_hamza(runner, tmp_path):
    # Whitespace only -- the hamza seat corpus supplies is correct orthography.
    db = str(tmp_path / "t.db")
    runner.invoke(main, ["seed", "--db", db])
    conn = sqlite3.connect(db)
    conn.execute(
        "INSERT INTO roots (root_buckwalter, root_arabic, occurrence_count)"
        " VALUES ('>rD', ?, 461)",
        ("أ ر ض",),
    )
    conn.commit()
    conn.close()
    runner.invoke(main, ["normalize-root-arabic", "--db", db])
    assert _root_arabic(db, ">rD") == "أرض"  # أرض, hamza kept


def test_migrate_snapshot_names_dry_run_changes_nothing(runner, tmp_path):
    (tmp_path / "root_lHn.html.gz").write_bytes(b"legacy")
    result = runner.invoke(
        main, ["migrate-snapshot-names", "--snapshot-dir", str(tmp_path), "--dry-run"]
    )
    assert result.exit_code == 0
    assert "1 would be renamed" in result.output
    # The point of --dry-run: the file is still there under its old name.
    assert (tmp_path / "root_lHn.html.gz").exists()


def test_migrate_snapshot_names_renames(runner, tmp_path):
    (tmp_path / "root_lHn.html.gz").write_bytes(b"legacy")
    result = runner.invoke(
        main, ["migrate-snapshot-names", "--snapshot-dir", str(tmp_path)]
    )
    assert result.exit_code == 0
    assert "1 renamed" in result.output
    assert (tmp_path / "root_l%48n.html.gz").read_bytes() == b"legacy"


def test_reparse_snapshots_reads_the_archive(runner, tmp_path):
    from scraper.snapshots import save_snapshot

    html = (
        "<html><body>The triliteral root hamza rā ḍād "
        '(<span class="at">أ ر ض</span>) occurs 461 times in the Quran as the '
        'noun <i class="ab">arḍ</i> (<span class="at">أَرْض</span>).</body></html>'
    )
    snaps = tmp_path / "snaps"
    save_snapshot(snaps, "root_ArD", html)
    db = str(tmp_path / "t.db")
    runner.invoke(main, ["seed", "--db", db])

    result = runner.invoke(
        main, ["reparse-snapshots", "--db", db, "--snapshot-dir", str(snaps)]
    )

    assert result.exit_code == 0
    assert "1 roots updated, 0 unparseable" in result.output
    conn = sqlite3.connect(db)
    assert (
        conn.execute(
            "SELECT root_arabic FROM roots WHERE root_buckwalter='ArD'"
        ).fetchone()[0]
        == "أرض"
    )
    conn.close()


@pytest.mark.parametrize("cmd", ["reparse-snapshots", "migrate-snapshot-names"])
def test_snapshot_commands_reject_a_missing_archive(runner, cmd):
    # Path.glob on a nonexistent directory yields nothing without raising, so
    # a typo'd --snapshot-dir used to print "0 roots updated" and exit 0 --
    # the same silent-nothing mode that hid 712 unarchived roots.
    result = runner.invoke(main, [cmd, "--snapshot-dir", "/nonexistent/typo"])
    assert result.exit_code != 0
    assert "does not exist" in result.output


def test_migrate_snapshot_names_warns_about_duplicate_keys(runner, tmp_path):
    # An archive where every affected key already has both names renames
    # nothing. Reporting only the count is indistinguishable from clean.
    (tmp_path / "root_lHn.html.gz").write_bytes(b"legacy")
    (tmp_path / "root_l%48n.html.gz").write_bytes(b"current")

    result = runner.invoke(
        main, ["migrate-snapshot-names", "--snapshot-dir", str(tmp_path)]
    )

    assert result.exit_code == 0
    assert "0 renamed" in result.output
    assert "warning: root_lHn archived under 2 names" in result.output


def test_fetch_lane_tei_reports_the_volumes_and_honours_force(runner, tmp_path):
    # The command's own wiring -- --dest, --force, and the size roll-up -- had no
    # test; only download_volumes did. A --force that never reached the function
    # would leave a stale mirror in place and report success.
    dest = tmp_path / "lane-tei"

    def fake_download(path, *, force=False, **kw):
        path.mkdir(parents=True, exist_ok=True)
        (path / "_S0.xml").write_bytes(b"x" * (3 * 1024 * 1024))
        fake_download.forced = force
        return [path / "_S0.xml"]

    with patch("scraper.sources.lane_tei.download_volumes", fake_download):
        result = runner.invoke(main, ["fetch-lane-tei", "--dest", str(dest)])
        assert result.exit_code == 0
        assert f"Lane TEI: 1 volumes, 3 MB -> {dest}" in result.output
        assert fake_download.forced is False

        forced = runner.invoke(main, ["fetch-lane-tei", "--dest", str(dest), "--force"])
        assert forced.exit_code == 0
        assert f"Lane TEI: 1 volumes, 3 MB -> {dest}" in forced.output
        assert fake_download.forced is True


def test_fetch_salmone_reports_the_file_and_honours_force(tmp_path, monkeypatch):
    calls = []

    def _fake(dest, *, force=False):
        calls.append(force)
        out = dest / "salmone.xml"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(b"x" * 2048)
        return out

    monkeypatch.setattr("scraper.sources.salmone.download_salmone", _fake)
    result = CliRunner().invoke(main, ["fetch-salmone", "--dest", str(tmp_path)])
    assert result.exit_code == 0
    # The whole line, not a substring `or` of two spellings: the command prints
    # raw bytes, so an alternative arm for a human-readable size can never be
    # true and quietly turns the assertion into "one of these, we don't mind
    # which" -- which pins neither.
    assert f"Salmone: salmone.xml, 2048 bytes -> {tmp_path}" in result.output
    result = CliRunner().invoke(
        main, ["fetch-salmone", "--dest", str(tmp_path), "--force"]
    )
    assert result.exit_code == 0 and calls == [False, True]


# ---- phase 24, task 6: the delete path `import-lane` lacks.


def _seed_definitions(db, rows):
    """`rows` is `[(root_buckwalter, source, definition), ...]`."""
    conn = sqlite3.connect(db)
    for bw, source, definition in rows:
        conn.execute(
            "INSERT OR IGNORE INTO roots (root_buckwalter, root_arabic,"
            " occurrence_count) VALUES (?, ?, 1)",
            (bw, bw),
        )
        conn.execute(
            "INSERT INTO root_definitions (root_id, source, definition)"
            " SELECT id, ?, ? FROM roots WHERE root_buckwalter = ?",
            (source, definition, bw),
        )
    conn.commit()
    conn.close()


def _prune_args(db, roots):
    return [
        "prune-definitions",
        "--db",
        db,
        "--source",
        "hanswehr",
        "--roots",
        str(roots),
    ]


def _definitions(db):
    conn = sqlite3.connect(db)
    rows = conn.execute(
        "SELECT r.root_buckwalter, d.source FROM root_definitions d"
        " JOIN roots r ON r.id = d.root_id ORDER BY r.root_buckwalter, d.source"
    ).fetchall()
    conn.close()
    return rows


def test_prune_definitions_deletes_only_the_named_source(runner, tmp_path):
    """A root dropped by the override gate must lose its Hans Wehr row and keep
    its Lane one -- that is the whole point of dropping it, Lane then leads."""
    db = str(tmp_path / "t.db")
    runner.invoke(main, ["seed", "--db", db])
    _seed_definitions(
        db,
        [
            ("ArD", "hanswehr", "termite"),
            ("ArD", "qurandev-lane", "earth"),
            ("qlb", "hanswehr", "reversal"),
        ],
    )
    roots = tmp_path / "drop.tsv"
    roots.write_text("# dropped by the human gate\nArD\t\n", encoding="utf-8")

    result = runner.invoke(
        main,
        _prune_args(db, roots),
    )
    assert result.exit_code == 0, result.output
    assert "Pruned 1 of 1" in result.output
    assert _definitions(db) == [("ArD", "qurandev-lane"), ("qlb", "hanswehr")]


def test_prune_definitions_skips_a_row_that_carries_a_replacement_gloss(
    runner, tmp_path
):
    """`hanswehr_overrides.tsv` is what the operator points this at, and it
    holds drops (empty gloss) *and* replacements side by side.

    Taking field 1 of every line would delete the replacements too: run
    `import-lane` to install five corrected glosses, then this to drop three,
    and all eight rows go. The replacement must survive untouched.
    """
    db = str(tmp_path / "t.db")
    runner.invoke(main, ["seed", "--db", db])
    _seed_definitions(db, [("ArD", "hanswehr", "earth"), ("qlb", "hanswehr", "mould")])
    roots = tmp_path / "overrides.tsv"
    roots.write_text("ArD\tearth; land, country\nqlb\t\n", encoding="utf-8")

    result = runner.invoke(main, _prune_args(db, roots))
    assert result.exit_code == 0, result.output
    assert "Skipped 1 rows carrying a gloss" in result.output
    assert "Pruned 1 of 1" in result.output
    assert _definitions(db) == [("ArD", "hanswehr")]


def test_prune_definitions_names_a_root_the_database_does_not_have(runner, tmp_path):
    """A mistyped Buckwalter root deletes nothing and reads exactly like a root
    with nothing to delete. Say which ones, or the typo ships."""
    db = str(tmp_path / "t.db")
    runner.invoke(main, ["seed", "--db", db])
    _seed_definitions(db, [("ArD", "hanswehr", "termite")])
    roots = tmp_path / "drop.tsv"
    roots.write_text("ArD\nAr9\n", encoding="utf-8")

    result = runner.invoke(
        main,
        _prune_args(db, roots),
    )
    assert result.exit_code == 0, result.output
    assert "Pruned 1 of 2" in result.output
    assert "Not in roots table: Ar9" in result.output


def test_prune_definitions_counts_a_duplicated_root_once(runner, tmp_path):
    """The denominator is the listed roots and the numerator is rows deleted, so
    a root listed twice printed "Pruned 1 of 2" -- the signature of a mistyped
    root -- and repeated itself in the unknown-roots line."""
    db = str(tmp_path / "t.db")
    runner.invoke(main, ["seed", "--db", db])
    _seed_definitions(db, [("ArD", "hanswehr", "termite")])
    roots = tmp_path / "drop.tsv"
    roots.write_text("ArD\nArD\nAr9\nAr9\n", encoding="utf-8")

    result = runner.invoke(main, _prune_args(db, roots))
    assert result.exit_code == 0, result.output
    assert "Pruned 1 of 2" in result.output
    assert "Not in roots table: Ar9" in result.output


def test_prune_definitions_does_nothing_for_an_empty_list(runner, tmp_path):
    db = str(tmp_path / "t.db")
    runner.invoke(main, ["seed", "--db", db])
    _seed_definitions(db, [("ArD", "hanswehr", "termite")])
    roots = tmp_path / "drop.tsv"
    roots.write_text("# nothing dropped yet\n", encoding="utf-8")

    result = runner.invoke(
        main,
        _prune_args(db, roots),
    )
    assert result.exit_code == 0
    assert "nothing to prune" in result.output
    assert _definitions(db) == [("ArD", "hanswehr")]


def test_prune_definitions_refuses_a_list_built_for_another_source(runner, tmp_path):
    """A prune list is bare roots, so it matches *any* source's rows. Requiring
    the flag stops it being forgotten, not the operator naming a different
    dictionary from the one the list was computed against -- which deletes rows
    nothing is about to reinstall. Must refuse before the delete, not report it."""
    db = str(tmp_path / "t.db")
    runner.invoke(main, ["seed", "--db", db])
    _seed_definitions(db, [("ArD", "hanswehr", "termite")])
    roots = tmp_path / "drop.tsv"
    roots.write_text("# source: corpus-forms\nArD\n", encoding="utf-8")

    result = runner.invoke(main, _prune_args(db, roots))
    assert result.exit_code != 0
    assert "generated for source 'corpus-forms'" in result.output
    assert _definitions(db) == [("ArD", "hanswehr")]


def test_import_lane_refuses_a_tsv_built_for_another_source(runner, tmp_path):
    """The other half of the same pair: prune at the right source, import at the
    wrong one, and the dictionary is deleted and reinstalled under a name no
    query joins on."""
    db = str(tmp_path / "t.db")
    runner.invoke(main, ["seed", "--db", db])
    tsv = tmp_path / "in.tsv"
    tsv.write_text("# source: hanswehr\nArD\tearth\n", encoding="utf-8")

    result = runner.invoke(
        main, ["import-lane", str(tsv), "--db", db, "--source", "corpus-forms"]
    )
    assert result.exit_code != 0
    assert "generated for source 'hanswehr'" in result.output
    assert _definitions(db) == []


def test_import_lane_accepts_a_tsv_whose_header_matches(runner, tmp_path):
    """And an artifact with no header at all stays importable -- the three other
    prepare tools do not write one, and none of their output is regenerated
    here."""
    db = str(tmp_path / "t.db")
    runner.invoke(main, ["seed", "--db", db])
    tagged, bare = tmp_path / "tagged.tsv", tmp_path / "bare.tsv"
    tagged.write_text("# source: hanswehr\nArD\tearth\n", encoding="utf-8")
    bare.write_text("qlb\treversal\n", encoding="utf-8")

    for path in (tagged, bare):
        result = runner.invoke(
            main, ["import-lane", str(path), "--db", db, "--source", "hanswehr"]
        )
        assert result.exit_code == 0, result.output
    assert _definitions(db) == [("ArD", "hanswehr"), ("qlb", "hanswehr")]


def test_the_pair_flag_refuses_artifacts_from_two_different_runs(runner, tmp_path):
    """The tag pairs the two *sources*; every run of one tool writes the same
    one. Prune with run B's list, import run A's glosses, and the source holds
    neither run: a root B dropped survives the prune that never listed it. The
    stamp is the only thing that separates them, and both halves must refuse."""
    db = str(tmp_path / "t.db")
    runner.invoke(main, ["seed", "--db", db])
    _seed_definitions(db, [("ArD", "hanswehr", "termite")])
    tsv_a, roots_b = tmp_path / "a.tsv", tmp_path / "b.txt"
    tsv_a.write_text("# source: hanswehr run: r-a\nqlb\treversal\n", encoding="utf-8")
    roots_b.write_text("# source: hanswehr run: r-b\nArD\n", encoding="utf-8")

    prune = runner.invoke(main, _prune_args(db, roots_b) + ["--pair", str(tsv_a)])
    imp = runner.invoke(
        main,
        ["import-lane", str(tsv_a), "--db", db, "--source", "hanswehr"]
        + ["--pair", str(roots_b)],
    )

    for result in (prune, imp):
        assert result.exit_code != 0
        assert "is from run" in result.output
    # Neither touched the DB: the check runs before the delete and the upsert.
    assert _definitions(db) == [("ArD", "hanswehr")]


def test_the_pair_flag_accepts_one_run_and_rejects_an_unstamped_file(runner, tmp_path):
    """Matching stamps pass. An *absent* stamp fails, unlike a missing `# source:`
    line -- passing --pair asks for the guarantee, and a file with no stamp
    cannot give it, so silently accepting it would report a check never made."""
    db = str(tmp_path / "t.db")
    runner.invoke(main, ["seed", "--db", db])
    tsv, roots = tmp_path / "out.tsv", tmp_path / "prune.txt"
    tsv.write_text("# source: hanswehr run: r-1\nqlb\treversal\n", encoding="utf-8")
    roots.write_text("# source: hanswehr run: r-1\nArD\n", encoding="utf-8")
    bare = tmp_path / "bare.txt"
    bare.write_text("# source: hanswehr\nArD\n", encoding="utf-8")

    ok = runner.invoke(
        main,
        ["import-lane", str(tsv), "--db", db, "--source", "hanswehr"]
        + ["--pair", str(roots)],
    )
    assert ok.exit_code == 0, ok.output
    assert _definitions(db) == [("qlb", "hanswehr")]

    unstamped = runner.invoke(
        main,
        ["import-lane", str(tsv), "--db", db, "--source", "hanswehr"]
        + ["--pair", str(bare)],
    )
    assert unstamped.exit_code != 0
    assert "carries no run stamp" in unstamped.output


def test_the_pair_flag_refuses_a_blank_stamp_and_a_cross_source_pair(runner, tmp_path):
    """Two holes the run stamp left open. A blank stamp is absent, not a value two
    files can agree on. And the tags must match too: each command runs `check` on
    the artifact it consumes and never on the one `--pair` names, so one stamp
    across two sources would walk the cross-source delete back in through the
    flag added to tighten it."""
    db = str(tmp_path / "t.db")
    runner.invoke(main, ["seed", "--db", db])
    _seed_definitions(db, [("ArD", "hanswehr", "termite")])
    tsv, blank = tmp_path / "out.tsv", tmp_path / "blank.txt"
    tsv.write_text("# source: hanswehr run: r-1\nqlb\treversal\n", encoding="utf-8")
    blank.write_text("# source: hanswehr run: \nArD\n", encoding="utf-8")
    blank_tsv = tmp_path / "blank.tsv"
    blank_tsv.write_text("# source: hanswehr run: \nqlb\treversal\n", encoding="utf-8")
    lane_roots = tmp_path / "lane.txt"
    lane_roots.write_text("# source: lane run: r-1\nArD\n", encoding="utf-8")

    def _import(pair: Path):
        return runner.invoke(
            main,
            ["import-lane", str(blank_tsv if pair is blank else tsv)]
            + ["--db", db, "--source", "hanswehr", "--pair", str(pair)],
        )

    blanks = _import(blank)
    assert blanks.exit_code != 0
    assert "carries no run stamp" in blanks.output

    crossed = _import(lane_roots)
    assert crossed.exit_code != 0
    assert "was generated for source" in crossed.output

    # Neither reached the upsert, so `qlb` never landed and `ArD` still stands.
    assert _definitions(db) == [("ArD", "hanswehr")]


def test_a_header_refuses_a_value_that_would_break_its_line():
    """`--source` is operator input and `_parse` reads only the first line. A
    newline in it therefore hides everything after from `check`, and what it
    hides lands in the artifact as a data row -- a forged gloss in the TSV, a
    forged root in the prune list. A tab is the TSV separator, so it splits the
    comment into fields instead.

    Rejected where the line is built, not at each call site: this is the one
    path every artifact's header goes through.
    """
    for value in ("hanswehr\nqlb\tforged", "hanswehr\rforged", "hans\twehr"):
        with pytest.raises(ValueError, match="single comment line"):
            header(value)
        # Every case through `run` too: it lands on the same line, so a guard
        # covering only `source` leaves the stamp able to break it.
        with pytest.raises(ValueError, match="single comment line"):
            header("hanswehr", value)

    assert header("hanswehr", "r-1") == "# source: hanswehr run: r-1\n"


def test_a_header_refuses_a_source_carrying_the_run_separator(tmp_path):
    """`_parse` partitions at the first ` run: `, so a source carrying one hands
    its own tail to the run field: `--source "hanswehr run: forged"` writes a
    stamp no prepare run produced, and `check_pair` then compares that instead
    of the real one -- two files from different runs agreeing because both
    sources were mistyped the same way.

    The run itself is not restricted: it is last on the line, so the first
    separator is still the real one and the value round-trips whole.
    """
    with pytest.raises(ValueError, match="run separator"):
        header("hanswehr run: forged")
    with pytest.raises(ValueError, match="run separator"):
        header("hanswehr run: forged", "r-1")

    # Read back through the consumer, not just as a string: the claim is that
    # the stamp survives `_parse` intact, which is what `check_pair` compares.
    a, b = tmp_path / "a.tsv", tmp_path / "b.tsv"
    for path in (a, b):
        path.write_text(header("hanswehr", "a run: b"), encoding="utf-8")
    assert check_pair(a, b) == "a run: b"


def test_import_lane_requires_a_source(runner, tmp_path):
    """Its old default, "lane", is a tag no row carries. Omitting the flag after a
    prune scoped to `hanswehr` deletes that dictionary and reinstalls it under a
    name nothing joins on -- the pair silently loses a live corpus."""
    tsv = tmp_path / "in.tsv"
    tsv.write_text("ArD\tearth\n", encoding="utf-8")
    result = runner.invoke(
        main, ["import-lane", str(tsv), "--db", str(tmp_path / "t.db")]
    )
    assert result.exit_code == 2


def test_prune_definitions_requires_a_source(runner, tmp_path):
    """No default: this is the one destructive command here, and a defaulted tag
    would delete whichever dictionary happened to be named in the code."""
    roots = tmp_path / "drop.tsv"
    roots.write_text("ArD\n", encoding="utf-8")
    result = runner.invoke(
        main,
        ["prune-definitions", "--db", str(tmp_path / "t.db"), "--roots", str(roots)],
    )
    assert result.exit_code == 2
