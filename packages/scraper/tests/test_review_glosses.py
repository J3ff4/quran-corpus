from __future__ import annotations

from scraper.db import ScraperDatabase
from scraper.models import AyahModel, WordGlossModel, WordModel
from scraper.review_glosses import export_top, import_reviewed
from scraper.seed import seed_database
from scraper.translate_glosses import translate_glosses
from tests.test_mt import FakeMt


def _db(tmp_path):
    db = ScraperDatabase(str(tmp_path / "s.db"))
    seed_database(db)  # languages (en/uz) for the gloss FK, and all 114 surahs
    for pos, g in [(1, "from"), (2, "from"), (3, "Allah")]:
        aid = db.upsert_ayah(AyahModel(surah_id=1, ayah_number=1, text_uthmani="x"))
        wid = db.upsert_word(WordModel(ayah_id=aid, position=pos, text_arabic="x"))
        db.upsert_word_gloss(WordGlossModel(word_id=wid, language_code="en", gloss_text=g))
    translate_glosses(db, FakeMt())
    return db


def test_export_orders_by_occurrence(tmp_path):
    db = _db(tmp_path)
    rows = export_top(db, 10)
    assert rows[0] == {"en": "from", "uz": "uz:from", "occ": 2}
    assert {r["en"] for r in rows} == {"from", "Allah"}


def test_import_flips_only_reviewed_and_is_idempotent(tmp_path):
    db = _db(tmp_path)
    n = import_reviewed(db, [{"en": "from", "uz": "dan"}])
    assert n == 2  # both 'from' words updated
    rows = db._conn.execute(
        "SELECT gloss_text, source FROM word_glosses WHERE language_code='uz'"
    ).fetchall()
    by = {(r["gloss_text"], r["source"]) for r in rows}
    assert ("dan", "mt-reviewed") in by
    assert ("uz:Allah", "mt") in by  # untouched stays mt
    assert import_reviewed(db, [{"en": "from", "uz": "dan"}]) == 0  # no-op re-run
    db.close()


def _add_en_only_word(db, gloss_text: str) -> int:
    """Add a word with an EN gloss and no uz row — stand-in for NLLB returning
    empty (translate_glosses only skips writing a uz row; it never deletes the
    en one), reached by inserting the word AFTER translate_glosses already ran.
    """
    aid = db.upsert_ayah(AyahModel(surah_id=1, ayah_number=2, text_uthmani="y"))
    wid = db.upsert_word(WordModel(ayah_id=aid, position=1, text_arabic="y"))
    db.upsert_word_gloss(WordGlossModel(word_id=wid, language_code="en", gloss_text=gloss_text))
    return wid


def test_export_includes_no_uz_row_word_with_uz_none(tmp_path):
    db = _db(tmp_path)
    _add_en_only_word(db, "except")
    rows = export_top(db, 10)
    by_en = {r["en"]: r for r in rows}
    assert by_en["except"] == {"en": "except", "uz": None, "occ": 1}
    db.close()


def test_import_reviewed_creates_missing_uz_row(tmp_path):
    db = _db(tmp_path)
    wid = _add_en_only_word(db, "except")

    n = import_reviewed(db, [{"en": "except", "uz": "dan"}])
    assert n == 1
    row = db._conn.execute(
        "SELECT gloss_text, source FROM word_glosses WHERE word_id=? AND language_code='uz'",
        (wid,),
    ).fetchone()
    assert (row["gloss_text"], row["source"]) == ("dan", "mt-reviewed")

    assert import_reviewed(db, [{"en": "except", "uz": "dan"}]) == 0  # idempotent
    db.close()


def test_import_reviewed_skips_malformed_entries(tmp_path):
    db = _db(tmp_path)
    n = import_reviewed(db, [{"en": "from"}, {"uz": "dan"}, {}])
    assert n == 0
    db.close()


def test_import_reviewed_skips_null_or_blank_uz(tmp_path):
    # A partially edited export still carries uz=None (unfilled head word) and
    # possibly a blank string. Importing must skip them, not push NULL/'' into
    # the NOT NULL gloss_text column.
    db = _db(tmp_path)
    n = import_reviewed(db, [{"en": "from", "uz": None}, {"en": "Allah", "uz": "  "}])
    assert n == 0
    # 'from' words keep their mt rows; nothing crashed.
    rows = db._conn.execute(
        "SELECT source FROM word_glosses WHERE language_code='uz'"
    ).fetchall()
    assert all(r["source"] == "mt" for r in rows)
    db.close()


def test_export_groups_by_en_only(tmp_path):
    # One EN gloss whose words hold DIFFERING uz (some mt, one none) must stay a
    # single review row — grouping by (en,uz) would split a top gloss across
    # slots and starve other high-frequency glosses of a --top slot.
    db = _db(tmp_path)
    _add_en_only_word(db, "from")  # third 'from' word, no uz row
    rows = [r for r in export_top(db, 10) if r["en"] == "from"]
    assert len(rows) == 1
    assert rows[0]["occ"] == 3
    db.close()
