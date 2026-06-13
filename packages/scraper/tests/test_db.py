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
