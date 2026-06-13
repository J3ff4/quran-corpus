import os
import sqlite3
import tempfile
from pathlib import Path

from scraper.db import ScraperDatabase
from scraper.seed import seed_database
from scraper.sources.tanzil import import_tanzil_text

FIXTURE = Path(__file__).parent / "fixtures" / "tanzil_sample.xml"


def _make_db() -> tuple[ScraperDatabase, str]:
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    path = f.name
    f.close()
    db = ScraperDatabase(path)
    seed_database(db)  # surahs must exist before ayahs (FK)
    return db, path


def test_import_tanzil_inserts_all_ayahs():
    db, path = _make_db()
    try:
        import_tanzil_text(FIXTURE, db)
        db.close()
        conn = sqlite3.connect(path)
        count = conn.execute("SELECT COUNT(*) FROM ayahs WHERE surah_id=1").fetchone()[
            0
        ]
        assert count == 7
        conn.close()
    finally:
        os.unlink(path)


def test_import_tanzil_stores_uthmani_text():
    db, path = _make_db()
    try:
        import_tanzil_text(FIXTURE, db)
        db.close()
        conn = sqlite3.connect(path)
        text = conn.execute(
            "SELECT text_uthmani FROM ayahs WHERE surah_id=1 AND ayah_number=1"
        ).fetchone()[0]
        assert "بِسۡمِ" in text
        conn.close()
    finally:
        os.unlink(path)


def test_import_tanzil_is_idempotent():
    db, path = _make_db()
    try:
        import_tanzil_text(FIXTURE, db)
        import_tanzil_text(FIXTURE, db)
        db.close()
        conn = sqlite3.connect(path)
        count = conn.execute("SELECT COUNT(*) FROM ayahs WHERE surah_id=1").fetchone()[
            0
        ]
        assert count == 7
        conn.close()
    finally:
        os.unlink(path)


def test_import_tanzil_sets_ayah_number():
    db, path = _make_db()
    try:
        import_tanzil_text(FIXTURE, db)
        db.close()
        conn = sqlite3.connect(path)
        numbers = [
            r[0]
            for r in conn.execute(
                "SELECT ayah_number FROM ayahs WHERE surah_id=1 ORDER BY ayah_number"
            ).fetchall()
        ]
        assert numbers == list(range(1, 8))
        conn.close()
    finally:
        os.unlink(path)
