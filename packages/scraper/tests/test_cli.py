import sqlite3
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from click.testing import CliRunner

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
    """scrape seeds the DB then attempts scraping; mock httpx to avoid real HTTP."""
    db = str(tmp_path / "test.db")
    with patch("scraper.sources.corpus_quran.httpx.Client") as mock_client_cls:
        mock_client = mock_client_cls.return_value.__enter__.return_value
        mock_resp = MagicMock()
        mock_resp.text = "<html><body></body></html>"
        mock_client.get.return_value = mock_resp
        runner.invoke(main, ["scrape", "--db", db, "--surah", "1", "--rate-limit", "0"])

    conn = sqlite3.connect(db)
    count = conn.execute("SELECT COUNT(*) FROM surahs").fetchone()[0]
    conn.close()
    assert count == 114  # seed ran


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
