import pytest

from scraper.db import ScraperDatabase
from scraper.models import (
    AyahModel,
    SurahModel,
    WordModel,
    WordSegmentModel,
)
from scraper.word_arabic import derive_word_arabic

# Built from numeric codepoints, not hand-typed literals -- see
# scraper/hamza_seat.py and test_hamza_seat.py for why.
_LAM, _SUKUN, _HAMZA = chr(0x0644), chr(0x0652), chr(0x0621)
_ALEF_WASLA, _FATHA = chr(0x0671), chr(0x064E)
_TATWEEL, _HAMZA_ABOVE = chr(0x0640), chr(0x0654)
_SEAT = _LAM + _SUKUN + _TATWEEL + _HAMZA_ABOVE
_ALEF, _KHA, _KASRA, _RA = chr(0x0627), chr(0x062E), chr(0x0650), chr(0x0631)
_AKHIRI = _FATHA + _ALEF + _KHA + _KASRA + _RA + _KASRA
_ARTICLE_SEG = _ALEF_WASLA + _LAM + _SUKUN  # "ٱلْ"
_HAMZA_SEG = _HAMZA + _AKHIRI  # "ءَاخِرِ"
_FIXED_WORD = _ALEF_WASLA + _SEAT + _AKHIRI


def _mkdb(tmp_path):
    db = ScraperDatabase(str(tmp_path / "t.db"))
    db.upsert_surah(SurahModel(id=1, name_arabic="x", name_translit="x",
        name_translation="x", revelation_type="meccan", ayah_count=1, order_number=1))
    db.upsert_ayah(AyahModel(id=1, surah_id=1, ayah_number=1, text_uthmani="x"))
    return db


def _word(db, position, text_arabic):
    return db.upsert_word(
        WordModel(ayah_id=1, position=position, text_arabic=text_arabic)
    )


def _seg(db, word_id, idx, form):
    db.upsert_word_segment(
        WordSegmentModel(word_id=word_id, segment_index=idx, form_arabic=form)
    )


def test_derive_fixes_drift_and_leaves_aligned(tmp_path):
    db = _mkdb(tmp_path)
    drift = _word(db, 1, "بِسْمِ")       # wrong
    _seg(db, drift, 0, "قُلْ")           # truth
    ok = _word(db, 2, "ٱلْكِتَٰبُ")       # already right (2 segments)
    _seg(db, ok, 0, "ٱلْ")
    _seg(db, ok, 1, "كِتَٰبُ")
    changed = derive_word_arabic(db)
    assert changed == 1
    rows = {r["position"]: r["text_arabic"] for r in
            db._conn.execute("SELECT position,text_arabic FROM words")}
    assert rows[1] == "قُلْ"
    assert rows[2] == "ٱلْكِتَٰبُ"
    # idempotent
    assert derive_word_arabic(db) == 0


def test_derive_concats_in_segment_index_order_not_insertion_order(tmp_path):
    # Insert segments out of index order to prove the concat orders by
    # segment_index (SQLite >= 3.44 in-aggregate ORDER BY), not by rowid.
    db = _mkdb(tmp_path)
    wid = _word(db, 1, "")
    _seg(db, wid, 2, "ج")
    _seg(db, wid, 0, "ا")
    _seg(db, wid, 1, "ب")
    derive_word_arabic(db)
    row = db._conn.execute(
        "SELECT text_arabic FROM words WHERE position=1"
    ).fetchone()
    assert row["text_arabic"] == "ابج"


def test_derive_raises_when_word_lacks_segments(tmp_path):
    db = _mkdb(tmp_path)
    _word(db, 1, "x")  # no segment
    with pytest.raises(ValueError, match="lack segments"):
        derive_word_arabic(db)


def test_derive_reapplies_hamza_seat_fix_after_rebuild(tmp_path):
    # Regression: group_concat(form_arabic) has no way to call
    # fix_seatless_hamza mid-query, so a fresh segment rebuild used to
    # silently restore the seatless form (e.g. 2:8 word 8). See db.py's
    # rebuild_text_arabic_from_segments.
    db = _mkdb(tmp_path)
    wid = _word(db, 1, "")
    _seg(db, wid, 0, _ARTICLE_SEG)
    _seg(db, wid, 1, _HAMZA_SEG)
    derive_word_arabic(db)
    row = db._conn.execute(
        "SELECT text_arabic FROM words WHERE position=1"
    ).fetchone()
    assert row["text_arabic"] == _FIXED_WORD
