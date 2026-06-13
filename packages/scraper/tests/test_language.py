import os
import sqlite3
import tempfile

from scraper.db import ScraperDatabase
from scraper.models import LanguageModel


def _make_db() -> tuple[ScraperDatabase, str]:
    f = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    path = f.name
    f.close()
    return ScraperDatabase(path), path


def test_upsert_language_inserts_row():
    db, path = _make_db()
    try:
        lang = LanguageModel(
            code="en", name_native="English", name_english="English", direction="ltr"
        )
        db.upsert_language(lang)
        db.close()
        conn = sqlite3.connect(path)
        row = conn.execute(
            "SELECT code, direction FROM languages WHERE code='en'"
        ).fetchone()
        assert row == ("en", "ltr")
        conn.close()
    finally:
        os.unlink(path)


def test_upsert_language_is_idempotent():
    db, path = _make_db()
    try:
        lang = LanguageModel(
            code="ar", name_native="العربية", name_english="Arabic", direction="rtl"
        )
        db.upsert_language(lang)
        db.upsert_language(lang)
        db.close()
        conn = sqlite3.connect(path)
        count = conn.execute(
            "SELECT COUNT(*) FROM languages WHERE code='ar'"
        ).fetchone()[0]
        assert count == 1
        conn.close()
    finally:
        os.unlink(path)


def test_upsert_language_updates_name_on_conflict():
    db, path = _make_db()
    try:
        lang = LanguageModel(
            code="uz", name_native="Oʻzbekcha", name_english="Uzbek", direction="ltr"
        )
        db.upsert_language(lang)
        updated = LanguageModel(
            code="uz",
            name_native="Oʻzbekcha (yangilangan)",
            name_english="Uzbek",
            direction="ltr",
        )
        db.upsert_language(updated)
        db.close()
        conn = sqlite3.connect(path)
        row = conn.execute(
            "SELECT name_native FROM languages WHERE code='uz'"
        ).fetchone()
        assert row[0] == "Oʻzbekcha (yangilangan)"
        conn.close()
    finally:
        os.unlink(path)
