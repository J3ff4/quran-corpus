from scraper.db import ScraperDatabase
from scraper.models import AyahModel, SurahModel, WordModel, WordSegmentModel
from scraper.validate_alignment import GROUND_TRUTH, validate_alignment


def _mkdb(tmp_path):
    """Seed a DB that satisfies every GROUND_TRUTH anchor (so the aligned case
    can assert []). Extra anchors beyond 112:1:1 matter because validate checks
    all of them. Returns (db, ayah_id) where ayah_id maps (surah,ayah)->id."""
    db = ScraperDatabase(str(tmp_path / "t.db"))
    ayah_id: dict[tuple[int, int], int] = {}
    seen_surah = set()
    aid = 0
    for surah, ayah, pos, exp_ar, exp_tr in GROUND_TRUTH:
        if surah not in seen_surah:
            db.upsert_surah(SurahModel(id=surah, name_arabic="x", name_translit="x",
                name_translation="x", revelation_type="meccan", ayah_count=ayah,
                order_number=surah))
            seen_surah.add(surah)
        if (surah, ayah) not in ayah_id:
            aid += 1
            db.upsert_ayah(
                AyahModel(
                    id=aid, surah_id=surah, ayah_number=ayah, text_uthmani="x"
                )
            )
            ayah_id[(surah, ayah)] = aid
        _w(db, ayah_id[(surah, ayah)], pos, exp_ar, exp_tr)
    return db, ayah_id


def _w(db, ayah_id, position, ta, tr):
    wid = db.upsert_word(
        WordModel(
            ayah_id=ayah_id, position=position, text_arabic=ta, transliteration=tr
        )
    )
    db.upsert_word_segment(
        WordSegmentModel(word_id=wid, segment_index=0, form_arabic=ta)
    )
    return wid


def test_passes_when_aligned(tmp_path):
    db, _ = _mkdb(tmp_path)  # all ground-truth anchors seeded correctly
    assert validate_alignment(db) == []


def test_flags_text_arabic_drift(tmp_path):
    db, _ = _mkdb(tmp_path)
    db._conn.execute(
        "UPDATE words SET text_arabic='بِسْمِ' "
        "WHERE id=(SELECT w.id FROM words w JOIN ayahs a "
        "ON a.id=w.ayah_id "
        "WHERE a.surah_id=112 AND a.ayah_number=1 AND w.position=1)"
    )
    db._conn.commit()
    errs = validate_alignment(db)
    assert any("segment concat" in e for e in errs)


def test_flags_missing_translit(tmp_path):
    db, _ = _mkdb(tmp_path)
    db._conn.execute(
        "UPDATE words SET transliteration=NULL "
        "WHERE id=(SELECT w.id FROM words w JOIN ayahs a "
        "ON a.id=w.ayah_id "
        "WHERE a.surah_id=112 AND a.ayah_number=1 AND w.position=1)"
    )
    db._conn.commit()
    errs = validate_alignment(db)
    assert any("transliteration" in e for e in errs)


def test_flags_ground_truth_mismatch(tmp_path):
    db, _ = _mkdb(tmp_path)
    db._conn.execute(
        "UPDATE words SET transliteration='xxx' "
        "WHERE id=(SELECT w.id FROM words w JOIN ayahs a "
        "ON a.id=w.ayah_id "
        "WHERE a.surah_id=112 AND a.ayah_number=1 AND w.position=1)"
    )
    db._conn.commit()
    errs = validate_alignment(db)
    assert any("112:1:1" in e for e in errs)


def test_flags_word_without_segments(tmp_path):
    db, ayah_id = _mkdb(tmp_path)
    # A word with a translit but no segment row: text_arabic is underivable and
    # the inner-join misalignment check can't see it — the gate must still flag.
    db.upsert_word(
        WordModel(
            ayah_id=ayah_id[(112, 1)], position=2,
            text_arabic="", transliteration="x",
        )
    )
    errs = validate_alignment(db)
    assert any("no segments" in e for e in errs)


def test_empty_form_suffix_is_not_flagged(tmp_path):
    # Empty-form suffixes (assimilated pronouns like the ي in رَبِّ) are valid
    # morphology, not truncation — the gate must NOT flag them. Here the word's
    # text_arabic already equals its non-empty segment's form, so alignment holds.
    db, ayah_id = _mkdb(tmp_path)
    wid = db.upsert_word(
        WordModel(
            ayah_id=ayah_id[(112, 1)], position=2,
            text_arabic="رَبِّ", transliteration="rabbi",
        )
    )
    db.upsert_word_segment(
        WordSegmentModel(word_id=wid, segment_index=0, form_arabic="رَبِّ")
    )
    db.upsert_word_segment(
        WordSegmentModel(word_id=wid, segment_index=1, form_arabic="")
    )
    db._conn.commit()
    errs = validate_alignment(db)
    assert errs == []
