from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from scraper.checkpoint import Checkpoint
from scraper.db import ScraperDatabase
from scraper.models import AyahModel, SurahModel, WordModel
from scraper.sources.dictionary_scrape import scrape_dictionary, scrape_word_details

FIX = Path(__file__).parent / "fixtures"


class _FakeResp:
    def __init__(self, text: str) -> None:
        self.text = text

    def raise_for_status(self) -> None: ...


class _FakeClient:
    def __init__(self, text: str) -> None:
        self._text = text

    def __enter__(self) -> _FakeClient:
        return self

    def __exit__(self, *a: object) -> None: ...

    def get(self, url: str) -> _FakeResp:
        return _FakeResp(self._text)


def _seed(tmp_path):
    db = ScraperDatabase(str(tmp_path / "d.db"))
    db.upsert_surah(
        SurahModel(
            id=1,
            name_arabic="ا",
            name_translit="a",
            name_translation="a",
            revelation_type="meccan",
            ayah_count=7,
            order_number=1,
        )
    )
    aid = db.upsert_ayah(AyahModel(surah_id=1, ayah_number=1, text_uthmani="بِسْمِ"))
    db.upsert_word(
        WordModel(ayah_id=aid, position=1, text_arabic="بِسْمِ", root_buckwalter="ktb")
    )
    return db


def test_scrape_dictionary_writes_root(tmp_path):
    db = _seed(tmp_path)
    html = (FIX / "corpus_dict_ktb.html").read_text(encoding="utf-8")
    ck = Checkpoint(str(tmp_path / "c.json"))
    n = scrape_dictionary(
        db, ck, client_factory=lambda: _FakeClient(html), rate_limit=0
    )
    assert n == 1
    row = db._conn.execute(
        "SELECT occurrence_count FROM roots WHERE root_buckwalter='ktb'"
    ).fetchone()
    assert row[0] == 319
    forms = db._conn.execute("SELECT COUNT(*) FROM root_forms").fetchone()[0]
    assert forms >= 5
    assert ck.is_done("root_ktb")
    # resume: second run is a no-op
    assert (
        scrape_dictionary(
            db, ck, client_factory=lambda: _FakeClient(html), rate_limit=0
        )
        == 0
    )
    db.close()


def test_scrape_dictionary_honours_explicit_root_list(tmp_path):
    # Re-scraping only the broken roots must not re-fetch all 1,642.
    db = _seed(tmp_path)
    html = (FIX / "corpus_dict_ktb.html").read_text(encoding="utf-8")
    ck = Checkpoint(str(tmp_path / "c.json"))
    n = scrape_dictionary(
        db, ck, client_factory=lambda: _FakeClient(html), rate_limit=0, roots=[]
    )
    assert n == 0
    assert not ck.is_done("root_ktb")


def test_scrape_dictionary_writes_snapshots(tmp_path):
    db = _seed(tmp_path)
    html = (FIX / "corpus_dict_ktb.html").read_text(encoding="utf-8")
    ck = Checkpoint(str(tmp_path / "c.json"))
    snaps = tmp_path / "snaps"
    scrape_dictionary(
        db,
        ck,
        client_factory=lambda: _FakeClient(html),
        rate_limit=0,
        snapshot_dir=snaps,
    )
    written = list(snaps.glob("*.html.gz"))
    assert len(written) == 1


def test_scrape_dictionary_writes_no_snapshots_by_default(tmp_path):
    db = _seed(tmp_path)
    html = (FIX / "corpus_dict_ktb.html").read_text(encoding="utf-8")
    ck = Checkpoint(str(tmp_path / "c.json"))
    # Assert the behaviour, not a filesystem side effect: pytest's CWD is the
    # package root, not tmp_path, so globbing tmp_path would miss a snapshot
    # written to the CLI's relative default (".snapshots/roots") and pass
    # vacuously. Patching at the call site is CWD-independent.
    with patch("scraper.sources.dictionary_scrape.save_snapshot") as mock_save:
        scrape_dictionary(
            db, ck, client_factory=lambda: _FakeClient(html), rate_limit=0
        )
    mock_save.assert_not_called()


def test_scrape_word_details_writes_description(tmp_path):
    db = _seed(tmp_path)
    html = (FIX / "corpus_word_detail_1_1_1.html").read_text(encoding="utf-8")
    ck = Checkpoint(str(tmp_path / "c2.json"))
    n = scrape_word_details(
        db, ck, client_factory=lambda: _FakeClient(html), rate_limit=0
    )
    assert n == 1
    row = db._conn.execute(
        "SELECT morphology_description, grammar_arabic FROM words WHERE position=1"
    ).fetchone()
    assert "morphological segment" in row[0]
    assert "جار" in (row[1] or "")
    assert db._conn.execute("SELECT COUNT(*) FROM word_segments").fetchone()[0] == 0
    db.close()
