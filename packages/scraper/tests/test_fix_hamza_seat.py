from __future__ import annotations

from scraper.db import ScraperDatabase
from scraper.fix_hamza_seat import fix_hamza_seat
from scraper.models import AyahModel, SurahModel, WordModel

# Built from numeric codepoints, not hand-typed literals -- see hamza_seat.py
# and test_hamza_seat.py for why (diacritic-order transposition bug hit twice
# already in this module's development).
_LAM, _SUKUN, _HAMZA = chr(0x0644), chr(0x0652), chr(0x0621)
_ALEF_WASLA, _FATHA = chr(0x0671), chr(0x064E)
_TATWEEL, _HAMZA_ABOVE = chr(0x0640), chr(0x0654)
_SEAT = _LAM + _SUKUN + _TATWEEL + _HAMZA_ABOVE

_ALEF, _KHA, _KASRA, _RA = chr(0x0627), chr(0x062E), chr(0x0650), chr(0x0631)
_AKHIRI = _FATHA + _ALEF + _KHA + _KASRA + _RA + _KASRA  # "َاخِرِ"

_GIVEN_WORD = _ALEF_WASLA + _LAM + _SUKUN + _HAMZA + _AKHIRI  # "ٱلْءَاخِرِ"
_FIXED_WORD = _ALEF_WASLA + _SEAT + _AKHIRI  # tatweel-seat form


def _db(tmp_path) -> ScraperDatabase:
    db = ScraperDatabase(str(tmp_path / "s.db"))
    db.upsert_surah(
        SurahModel(
            id=2,
            name_arabic="a",
            name_translit="a",
            name_translation="a",
            revelation_type="medinan",
            ayah_count=286,
            order_number=2,
        )
    )
    return db


def test_fixes_ayah_and_word_text(tmp_path) -> None:
    db = _db(tmp_path)
    aid = db.upsert_ayah(
        AyahModel(surah_id=2, ayah_number=8, text_uthmani=_GIVEN_WORD)
    )
    db.upsert_word(WordModel(ayah_id=aid, position=8, text_arabic=_GIVEN_WORD))

    ayahs_changed, words_changed = fix_hamza_seat(db)

    assert ayahs_changed == 1
    assert words_changed == 1
    ayah = db.get_ayah(2, 8)
    assert ayah["text_uthmani"] == _FIXED_WORD
    rows = db._conn.execute(
        "SELECT position, text_arabic FROM words WHERE ayah_id = ?", (aid,)
    ).fetchall()
    words = {r["position"]: r["text_arabic"] for r in rows}
    assert words[8] == _FIXED_WORD


def test_root_internal_hamza_untouched(tmp_path) -> None:
    db = _db(tmp_path)
    # 3:91 "مِّلْءُ" -- root m-l-hamza, hamza is 3rd radical, preceded by meem.
    meem, shadda, damma = chr(0x0645), chr(0x0651), chr(0x064F)
    milu = meem + shadda + _LAM + _SUKUN + _HAMZA + damma
    aid = db.upsert_ayah(AyahModel(surah_id=2, ayah_number=1, text_uthmani=milu))
    db.upsert_word(WordModel(ayah_id=aid, position=1, text_arabic=milu))

    ayahs_changed, words_changed = fix_hamza_seat(db)

    assert ayahs_changed == 0
    assert words_changed == 0


def test_idempotent_second_run_is_noop(tmp_path) -> None:
    db = _db(tmp_path)
    aid = db.upsert_ayah(
        AyahModel(surah_id=2, ayah_number=8, text_uthmani=_GIVEN_WORD)
    )
    db.upsert_word(WordModel(ayah_id=aid, position=1, text_arabic=_GIVEN_WORD))
    assert fix_hamza_seat(db) == (1, 1)
    assert fix_hamza_seat(db) == (0, 0)
