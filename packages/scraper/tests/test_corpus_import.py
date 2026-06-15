"""Tests for corpus morphology import (parser -> DB) and column migration."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from scraper.db import ScraperDatabase
from scraper.models import AyahModel
from scraper.seed import seed_database
from scraper.sources.corpus_import import import_corpus_morphology

FIXTURE = Path(__file__).parent / "fixtures" / "corpus_morphology_sample.txt"


@pytest.fixture
def db() -> ScraperDatabase:
    database = ScraperDatabase(":memory:")
    seed_database(database)  # surahs (FK target) + languages
    # Seed ayah text so text_arabic can be derived by position.
    database.upsert_ayah(
        AyahModel(surah_id=1, ayah_number=1, text_uthmani="بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ")
    )
    database.upsert_ayah(
        AyahModel(surah_id=1, ayah_number=2, text_uthmani="ٱلْحَمْدُ")
    )
    return database


def test_import_returns_word_count(db: ScraperDatabase) -> None:
    assert import_corpus_morphology(FIXTURE, db) == 4


def test_import_populates_root_and_lemma(db: ScraperDatabase) -> None:
    import_corpus_morphology(FIXTURE, db)
    row = db._conn.execute(  # noqa: SLF001 - test inspects DB state directly
        "SELECT root, lemma, root_buckwalter, lemma_buckwalter, pos_tag,"
        " morphology_json FROM words w JOIN ayahs a ON w.ayah_id=a.id"
        " WHERE a.surah_id=1 AND a.ayah_number=1 AND w.position=1"
    ).fetchone()
    assert row["root"] == "سمو"
    assert row["root_buckwalter"] == "smw"
    assert row["lemma"] == "ٱسْم"
    assert row["lemma_buckwalter"] == "{som"
    assert row["pos_tag"] == "P"
    assert row["morphology_json"] == '["P", "N"]'


def test_import_derives_text_arabic_from_ayah(db: ScraperDatabase) -> None:
    import_corpus_morphology(FIXTURE, db)
    row = db._conn.execute(  # noqa: SLF001
        "SELECT text_arabic FROM words w JOIN ayahs a ON w.ayah_id=a.id"
        " WHERE a.surah_id=1 AND a.ayah_number=1 AND w.position=2"
    ).fetchone()
    assert row["text_arabic"] == "ٱللَّهِ"


def test_import_skips_words_without_ayah(db: ScraperDatabase) -> None:
    """Ayah 1:1 has only 3 words seeded; corpus word at position 3 still imports
    (text_arabic derived), but a word in an unseeded ayah is skipped."""
    # Remove ayah 2 so its corpus word (1:2:1) has no ayah row.
    db._conn.execute("DELETE FROM ayahs WHERE surah_id=1 AND ayah_number=2")  # noqa: SLF001
    db._conn.commit()
    count = import_corpus_morphology(FIXTURE, db)
    assert count == 3  # 1:2:1 skipped


def test_reimport_is_idempotent(db: ScraperDatabase) -> None:
    import_corpus_morphology(FIXTURE, db)
    import_corpus_morphology(FIXTURE, db)
    n = db._conn.execute("SELECT COUNT(*) AS c FROM words").fetchone()["c"]  # noqa: SLF001
    assert n == 4


def test_migration_adds_columns_to_old_db(tmp_path: Path) -> None:
    """A pre-existing words table without the new columns gets them added."""
    path = tmp_path / "old.db"
    conn = sqlite3.connect(path)
    # Simulate an older schema: words without root_buckwalter/lemma_buckwalter.
    conn.executescript(
        """
        CREATE TABLE ayahs (id INTEGER PRIMARY KEY, surah_id INT, ayah_number INT,
                            text_uthmani TEXT);
        CREATE TABLE words (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ayah_id INTEGER NOT NULL,
          position INTEGER NOT NULL,
          text_arabic TEXT NOT NULL,
          transliteration TEXT, root TEXT, lemma TEXT,
          pos_tag TEXT, morphology_json TEXT,
          UNIQUE(ayah_id, position)
        );
        """
    )
    conn.commit()
    conn.close()

    # Opening via ScraperDatabase must add the missing columns without error.
    database = ScraperDatabase(str(path))
    cols = {r["name"] for r in database._conn.execute("PRAGMA table_info(words)")}  # noqa: SLF001
    database.close()
    assert "root_buckwalter" in cols
    assert "lemma_buckwalter" in cols
