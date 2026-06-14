"""Tests for scraper/sources/corpus_quran.py.

HTTP calls are mocked via unittest.mock.patch. The real fixture HTML from
tests/fixtures/corpus_1_1.html is used as the mock response body so that
the parser exercises actual HTML.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from scraper.checkpoint import Checkpoint
from scraper.db import ScraperDatabase
from scraper.sources.corpus_quran import _process_page, scrape_chapter

FIXTURE_HTML = (Path(__file__).parent / "fixtures" / "corpus_1_1.html").read_text(
    encoding="utf-8"
)

# Variant with the navigationPane class renamed so parse_next_verse_url returns None.
_HTML_NO_NAV = FIXTURE_HTML.replace(
    '<div class="navigationPane">',
    '<div class="navigationPaneDone">',
)


@pytest.fixture()
def db(tmp_path: Path) -> ScraperDatabase:
    """In-memory DB seeded with Al-Fatiha surah and ayahs 1-6."""
    d = ScraperDatabase(str(tmp_path / "test.db"))
    # Languages are FK targets for word_glosses; the real CLI seeds them first.
    d._conn.execute(
        "INSERT INTO languages (code, name_native, name_english, direction) "
        "VALUES ('en', 'English', 'English', 'ltr')"
    )
    d._conn.execute(
        "INSERT INTO surahs "
        "(id, name_arabic, name_translit, name_translation, "
        "revelation_type, ayah_count, order_number) "
        "VALUES (1, 'الفاتحة', 'Al-Fatihah', 'The Opening', 'meccan', 7, 5)"
    )
    # Ayah 1 has the canonical Basmala text (4 space-separated tokens).
    d._conn.execute(
        "INSERT INTO ayahs (surah_id, ayah_number, text_uthmani) "
        "VALUES (1, 1, 'بِسۡمِ ٱللَّهِ ٱلرَّحۡمَـٰنِ ٱلرَّحِيمِ')"
    )
    # Ayahs 2-6 with 4-word placeholder text.
    placeholder = "كلمة كلمة كلمة كلمة"
    for ayah_num in range(2, 7):
        d._conn.execute(
            "INSERT INTO ayahs (surah_id, ayah_number, text_uthmani) VALUES (1, ?, ?)",
            (ayah_num, placeholder),
        )
    d._conn.commit()
    return d


@pytest.fixture()
def checkpoint(tmp_path: Path) -> Checkpoint:
    return Checkpoint(str(tmp_path / "cp.json"))


# ---------------------------------------------------------------------------
# _process_page
# ---------------------------------------------------------------------------


def test_process_page_inserts_words_for_verse_1(db: ScraperDatabase) -> None:
    """Words from the fixture HTML are inserted into the DB for verse 1."""
    _process_page(FIXTURE_HTML, 1, db)
    rows = db._conn.execute(
        "SELECT position FROM words "
        "WHERE ayah_id = "
        "(SELECT id FROM ayahs WHERE surah_id=1 AND ayah_number=1) "
        "ORDER BY position"
    ).fetchall()
    assert len(rows) == 4
    assert [r[0] for r in rows] == [1, 2, 3, 4]


def test_process_page_sets_text_arabic_from_tanzil(db: ScraperDatabase) -> None:
    """text_arabic for word 1:1:1 is the first space-split token of text_uthmani."""
    _process_page(FIXTURE_HTML, 1, db)
    row = db._conn.execute(
        "SELECT text_arabic FROM words "
        "WHERE ayah_id = "
        "(SELECT id FROM ayahs WHERE surah_id=1 AND ayah_number=1) "
        "AND position=1"
    ).fetchone()
    assert row is not None
    assert row[0] == "بِسۡمِ"


def test_process_page_sets_transliteration(db: ScraperDatabase) -> None:
    """transliteration for word 1:1:1 matches the corpus.quran.com <a> text."""
    _process_page(FIXTURE_HTML, 1, db)
    row = db._conn.execute(
        "SELECT transliteration FROM words "
        "WHERE ayah_id = "
        "(SELECT id FROM ayahs WHERE surah_id=1 AND ayah_number=1) "
        "AND position=1"
    ).fetchone()
    assert row is not None
    assert row[0] == "bis'mi"


def test_process_page_stores_english_gloss(db: ScraperDatabase) -> None:
    """The parsed english_gloss is stored in word_glosses under language 'en'."""
    _process_page(FIXTURE_HTML, 1, db)
    row = db._conn.execute(
        "SELECT g.gloss_text FROM word_glosses g "
        "JOIN words w ON w.id = g.word_id "
        "WHERE w.ayah_id = "
        "(SELECT id FROM ayahs WHERE surah_id=1 AND ayah_number=1) "
        "AND w.position=1 AND g.language_code='en'"
    ).fetchone()
    assert row is not None
    assert row[0] == "In (the) name"


def test_process_page_skips_missing_ayah(db: ScraperDatabase) -> None:
    """Words whose ayah is absent in DB are silently skipped (no crash)."""
    # Use chapter 99 which has no rows in the DB.
    _process_page(FIXTURE_HTML, 99, db)
    count = db._conn.execute("SELECT COUNT(*) FROM words").fetchone()[0]
    assert count == 0


# ---------------------------------------------------------------------------
# scrape_chapter
# ---------------------------------------------------------------------------


def test_scrape_chapter_marks_done_in_checkpoint(
    db: ScraperDatabase, checkpoint: Checkpoint
) -> None:
    """scrape_chapter marks the chapter as done after fetching all pages."""
    mock_response = MagicMock()
    mock_response.text = _HTML_NO_NAV  # no next-nav link → single page → loop ends

    with patch("scraper.sources.corpus_quran.httpx.Client") as mock_httpx_client:
        mock_client = MagicMock()
        mock_httpx_client.return_value.__enter__.return_value = mock_client
        mock_client.get.return_value = mock_response
        scrape_chapter(1, db, checkpoint, rate_limit=0)

    assert checkpoint.is_done("chapter_1")


def test_scrape_chapter_skips_if_already_done(
    db: ScraperDatabase, checkpoint: Checkpoint
) -> None:
    """scrape_chapter makes no HTTP requests if the chapter is already marked done."""
    checkpoint.mark_done("chapter_1")

    with patch("scraper.sources.corpus_quran.httpx.Client") as mock_httpx_client:
        scrape_chapter(1, db, checkpoint, rate_limit=0)
        mock_httpx_client.assert_not_called()


def test_scrape_chapter_follows_pagination(
    db: ScraperDatabase, checkpoint: Checkpoint
) -> None:
    """scrape_chapter calls get() twice when first page links to a next page."""
    first_response = MagicMock()
    first_response.text = FIXTURE_HTML  # has navigationPane → verse 7

    second_response = MagicMock()
    second_response.text = _HTML_NO_NAV  # no nav → last page

    with patch("scraper.sources.corpus_quran.httpx.Client") as mock_httpx_client:
        mock_client = MagicMock()
        mock_httpx_client.return_value.__enter__.return_value = mock_client
        mock_client.get.side_effect = [first_response, second_response]
        scrape_chapter(1, db, checkpoint, rate_limit=0)

    assert mock_client.get.call_count == 2
    assert checkpoint.is_done("chapter_1")
