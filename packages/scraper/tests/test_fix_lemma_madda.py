from __future__ import annotations

from scraper.db import ScraperDatabase
from scraper.fix_lemma_madda import fix_lemma_madda
from scraper.models import AyahModel, SurahModel, WordModel, WordSegmentModel

# Built from numeric codepoints, not hand-typed literals -- see
# test_fix_hamza_seat.py's comment on this module's history of
# diacritic-order transposition bugs from literal Arabic glyphs.
_ALEF, _MADDA_COMBINING = chr(0x0627), chr(0x0653)
_ALEF_MADDA_PRECOMPOSED = chr(0x0622)
_BA, _HAMZA, _SEEN = chr(0x0628), chr(0x0621), chr(0x0633)

_DECOMPOSED_LEMMA = _BA + _HAMZA + _ALEF + _MADDA_COMBINING + _SEEN  # "بأآس"-ish
_PRECOMPOSED_LEMMA = _BA + _HAMZA + _ALEF_MADDA_PRECOMPOSED + _SEEN


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


def test_composes_decomposed_lemma_in_words_and_segments(tmp_path) -> None:
    db = _db(tmp_path)
    aid = db.upsert_ayah(AyahModel(surah_id=2, ayah_number=1, text_uthmani="x"))
    wid = db.upsert_word(
        WordModel(ayah_id=aid, position=1, text_arabic="x", lemma=_DECOMPOSED_LEMMA)
    )
    db.upsert_word_segment(
        WordSegmentModel(word_id=wid, segment_index=0, lemma=_DECOMPOSED_LEMMA)
    )

    words_changed, segments_changed = fix_lemma_madda(db)

    assert words_changed == 1
    assert segments_changed == 1
    word_row = db._conn.execute(
        "SELECT lemma FROM words WHERE id = ?", (wid,)
    ).fetchone()
    assert word_row["lemma"] == _PRECOMPOSED_LEMMA
    seg_row = db._conn.execute(
        "SELECT lemma FROM word_segments WHERE word_id = ?", (wid,)
    ).fetchone()
    assert seg_row["lemma"] == _PRECOMPOSED_LEMMA


def test_already_precomposed_lemma_untouched(tmp_path) -> None:
    db = _db(tmp_path)
    aid = db.upsert_ayah(AyahModel(surah_id=2, ayah_number=1, text_uthmani="x"))
    wid = db.upsert_word(
        WordModel(ayah_id=aid, position=1, text_arabic="x", lemma=_PRECOMPOSED_LEMMA)
    )
    db.upsert_word_segment(
        WordSegmentModel(word_id=wid, segment_index=0, lemma=_PRECOMPOSED_LEMMA)
    )

    assert fix_lemma_madda(db) == (0, 0)


def test_idempotent_second_run_is_noop(tmp_path) -> None:
    db = _db(tmp_path)
    aid = db.upsert_ayah(AyahModel(surah_id=2, ayah_number=1, text_uthmani="x"))
    wid = db.upsert_word(
        WordModel(ayah_id=aid, position=1, text_arabic="x", lemma=_DECOMPOSED_LEMMA)
    )
    db.upsert_word_segment(
        WordSegmentModel(word_id=wid, segment_index=0, lemma=_DECOMPOSED_LEMMA)
    )

    assert fix_lemma_madda(db) == (1, 1)
    assert fix_lemma_madda(db) == (0, 0)
