from __future__ import annotations

from scraper.backfill_descriptions import trim_stored_descriptions
from scraper.db import ScraperDatabase
from scraper.models import AyahModel, SurahModel, WordModel

_DIRTY = "The first word of verse (1:1) is a noun. Chapter (1) sūrat l-fātiḥah junk"
_CLEAN = "The first word of verse (1:1) is a noun."


def _seed_word(db: ScraperDatabase, position: int, description: str) -> int:
    aid = db.upsert_ayah(AyahModel(surah_id=1, ayah_number=1, text_uthmani="x"))
    wid = db.upsert_word(WordModel(ayah_id=aid, position=position, text_arabic="x"))
    db.update_word_detail(wid, description, None)
    return wid


def _db(tmp_path) -> ScraperDatabase:
    db = ScraperDatabase(str(tmp_path / "s.db"))
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
    return db


def test_trims_chrome_and_counts_changed(tmp_path) -> None:
    db = _db(tmp_path)
    dirty = _seed_word(db, 1, _DIRTY)
    clean = _seed_word(db, 2, _CLEAN)

    changed = trim_stored_descriptions(db)

    assert changed == 1  # only the dirty row rewritten
    stored = db.get_words_with_description()
    rows = {r["id"]: r["morphology_description"] for r in stored}
    assert rows[dirty] == _CLEAN
    assert rows[clean] == _CLEAN


def test_idempotent_second_run_changes_nothing(tmp_path) -> None:
    db = _db(tmp_path)
    _seed_word(db, 1, _DIRTY)
    assert trim_stored_descriptions(db) == 1
    assert trim_stored_descriptions(db) == 0
