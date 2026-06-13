import os
import sqlite3
import tempfile
from pathlib import Path

from scraper.db import ScraperDatabase
from scraper.seed import seed_database
from scraper.sources.quranenc import import_quranenc_translation
from scraper.sources.tanzil import import_tanzil_text

FIXTURE_JSON = Path(__file__).parent / "fixtures" / "quranenc_sample.json"
FIXTURE_XML = Path(__file__).parent / "fixtures" / "tanzil_sample.xml"


def _make_db() -> tuple[ScraperDatabase, str]:
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    path = f.name
    f.close()
    db = ScraperDatabase(path)
    seed_database(db)
    import_tanzil_text(FIXTURE_XML, db)  # ayahs must exist before translations (FK)
    return db, path


def test_import_quranenc_inserts_translations():
    db, path = _make_db()
    try:
        import_quranenc_translation(FIXTURE_JSON, "en", "Sahih International", db)
        db.close()
        conn = sqlite3.connect(path)
        count = conn.execute(
            "SELECT COUNT(*) FROM translations WHERE language_code='en'"
        ).fetchone()[0]
        assert count == 7
        conn.close()
    finally:
        os.unlink(path)


def test_import_quranenc_stores_correct_text():
    db, path = _make_db()
    try:
        import_quranenc_translation(FIXTURE_JSON, "en", "Sahih International", db)
        db.close()
        conn = sqlite3.connect(path)
        row = conn.execute(
            """SELECT t.text FROM translations t
               JOIN ayahs a ON a.id = t.ayah_id
               WHERE a.surah_id=1 AND a.ayah_number=1 AND t.language_code='en'"""
        ).fetchone()
        assert row is not None
        assert "Merciful" in row[0]
        conn.close()
    finally:
        os.unlink(path)


def test_import_quranenc_stores_translator():
    db, path = _make_db()
    try:
        import_quranenc_translation(FIXTURE_JSON, "en", "Sahih International", db)
        db.close()
        conn = sqlite3.connect(path)
        row = conn.execute(
            "SELECT translator FROM translations WHERE language_code='en' LIMIT 1"
        ).fetchone()
        assert row[0] == "Sahih International"
        conn.close()
    finally:
        os.unlink(path)


def test_import_quranenc_is_idempotent():
    db, path = _make_db()
    try:
        import_quranenc_translation(FIXTURE_JSON, "en", "Sahih International", db)
        import_quranenc_translation(FIXTURE_JSON, "en", "Sahih International", db)
        db.close()
        conn = sqlite3.connect(path)
        count = conn.execute(
            "SELECT COUNT(*) FROM translations WHERE language_code='en'"
        ).fetchone()[0]
        assert count == 7
        conn.close()
    finally:
        os.unlink(path)
