import os
import sqlite3
import tempfile

from scraper.db import ScraperDatabase
from scraper.models import SurahModel


def test_create_schema_creates_all_tables():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        path = f.name
    try:
        db = ScraperDatabase(path)
        db.close()
        conn = sqlite3.connect(path)
        tables = {
            r[0]
            for r in conn.execute(
                "SELECT name FROM sqlite_master"
                " WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            ).fetchall()
        }
        expected = {
            "surahs",
            "ayahs",
            "words",
            "languages",
            "translations",
            "word_glosses",
        }
        assert tables == expected
        conn.close()
    finally:
        os.unlink(path)


def test_upsert_surah_inserts_row():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        path = f.name
    try:
        db = ScraperDatabase(path)
        surah = SurahModel(
            id=1,
            name_arabic="الفاتحة",
            name_translit="Al-Fatihah",
            name_translation="The Opening",
            revelation_type="meccan",
            ayah_count=7,
            order_number=1,
        )
        db.upsert_surah(surah)
        db.close()
        conn = sqlite3.connect(path)
        row = conn.execute("SELECT id, name_translit FROM surahs WHERE id=1").fetchone()
        assert row == (1, "Al-Fatihah")
        conn.close()
    finally:
        os.unlink(path)


def test_upsert_surah_is_idempotent():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        path = f.name
    try:
        db = ScraperDatabase(path)
        surah = SurahModel(
            id=1,
            name_arabic="الفاتحة",
            name_translit="Al-Fatihah",
            name_translation="The Opening",
            revelation_type="meccan",
            ayah_count=7,
            order_number=1,
        )
        db.upsert_surah(surah)
        db.upsert_surah(surah)
        db.close()
        conn = sqlite3.connect(path)
        count = conn.execute("SELECT COUNT(*) FROM surahs").fetchone()[0]
        assert count == 1
        conn.close()
    finally:
        os.unlink(path)


def test_upsert_word_does_not_clobber_existing_fields_with_null():
    """A later upsert without root/lemma must not overwrite existing values.

    This lets the HTML scraper (no root/lemma) and the corpus-file importer
    (root/lemma) coexist regardless of import order.
    """
    from scraper.models import AyahModel, WordModel

    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        path = f.name
    try:
        db = ScraperDatabase(path)
        db.upsert_surah(
            SurahModel(
                id=1,
                name_arabic="الفاتحة",
                name_translit="Al-Fatihah",
                name_translation="The Opening",
                revelation_type="meccan",
                ayah_count=7,
                order_number=1,
            )
        )
        ayah_id = db.upsert_ayah(
            AyahModel(surah_id=1, ayah_number=1, text_uthmani="بِسْمِ")
        )
        # First: corpus-file style upsert with root/lemma.
        db.upsert_word(
            WordModel(
                ayah_id=ayah_id,
                position=1,
                text_arabic="بِسْمِ",
                root="سمو",
                lemma="ٱسْم",
                root_buckwalter="smw",
                pos_tag="N",
                morphology_json='["P", "N"]',
            )
        )
        # Second: HTML-scrape style upsert without root/lemma, with a gloss-side
        # field (transliteration). Must preserve root/lemma/morphology.
        db.upsert_word(
            WordModel(
                ayah_id=ayah_id,
                position=1,
                text_arabic="بِسْمِ",
                transliteration="bis'mi",
            )
        )
        db.close()

        conn = sqlite3.connect(path)
        row = conn.execute(
            "SELECT root, lemma, root_buckwalter, pos_tag, morphology_json,"
            " transliteration FROM words WHERE ayah_id=? AND position=1",
            (ayah_id,),
        ).fetchone()
        conn.close()
        assert row[0] == "سمو"  # root preserved
        assert row[1] == "ٱسْم"  # lemma preserved
        assert row[2] == "smw"  # root_buckwalter preserved
        assert row[3] == "N"  # pos_tag preserved
        assert row[4] == '["P", "N"]'  # morphology preserved
        assert row[5] == "bis'mi"  # transliteration added
    finally:
        os.unlink(path)
