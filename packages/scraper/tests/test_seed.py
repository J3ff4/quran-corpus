import os
import sqlite3
import tempfile

from scraper.db import ScraperDatabase
from scraper.seed import seed_database


def _make_db() -> tuple[ScraperDatabase, str]:
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    path = f.name
    f.close()
    return ScraperDatabase(path), path


def test_seed_inserts_four_languages():
    db, path = _make_db()
    try:
        seed_database(db)
        db.close()
        conn = sqlite3.connect(path)
        codes = {r[0] for r in conn.execute("SELECT code FROM languages").fetchall()}
        assert {"ar", "en", "uz", "ru"} == codes
        conn.close()
    finally:
        os.unlink(path)


def test_seed_inserts_114_surahs():
    db, path = _make_db()
    try:
        seed_database(db)
        db.close()
        conn = sqlite3.connect(path)
        count = conn.execute("SELECT COUNT(*) FROM surahs").fetchone()[0]
        assert count == 114
        conn.close()
    finally:
        os.unlink(path)


def test_seed_is_idempotent():
    db, path = _make_db()
    try:
        seed_database(db)
        seed_database(db)  # second call must not raise or duplicate
        db.close()
        conn = sqlite3.connect(path)
        lang_count = conn.execute("SELECT COUNT(*) FROM languages").fetchone()[0]
        surah_count = conn.execute("SELECT COUNT(*) FROM surahs").fetchone()[0]
        assert lang_count == 4
        assert surah_count == 114
        conn.close()
    finally:
        os.unlink(path)
