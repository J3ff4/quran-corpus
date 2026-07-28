import sqlite3
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from click.testing import CliRunner

from scraper.checkpoint import Checkpoint
from scraper.cli import main


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
            "--db", db,
            "--checkpoint", str(tmp_path / "c.json"),
            "--snapshot-dir", str(tmp_path / "snaps"),
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
                "--db", db,
                "--checkpoint", str(ckpt_path),
                "--snapshot-dir", snap_dir,
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
