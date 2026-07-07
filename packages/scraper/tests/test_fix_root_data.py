from __future__ import annotations

from scraper.db import ScraperDatabase
from scraper.fix_root_data import fix_root_data
from scraper.models import (
    AyahModel,
    RootFormModel,
    RootModel,
    SurahModel,
    WordModel,
    WordSegmentModel,
)


def _db(tmp_path) -> ScraperDatabase:
    db = ScraperDatabase(str(tmp_path / "s.db"))
    db.upsert_surah(
        SurahModel(
            id=1,
            name_arabic="ا",
            name_translit="a",
            name_translation="a",
            revelation_type="meccan",
            ayah_count=7,
            order_number=1,
        )
    )
    return db


def _seed_word_with_root(db: ScraperDatabase, position: int, root: str) -> None:
    """One word whose single stem segment carries `root`."""
    aid = db.upsert_ayah(AyahModel(surah_id=1, ayah_number=1, text_uthmani="x"))
    wid = db.upsert_word(WordModel(ayah_id=aid, position=position, text_arabic="x"))
    db.upsert_word_segment(
        WordSegmentModel(word_id=wid, segment_index=0, segment_type="stem", root=root)
    )


def test_recomputes_counts_and_deletes_junk_forms(tmp_path) -> None:
    db = _db(tmp_path)
    # root ktb: stored 0, but 3 word_segments carry it -> should become 3
    kid = db.upsert_root(
        RootModel(root_buckwalter="ktb", root_arabic="ك ت ب", occurrence_count=0)
    )
    for pos in (1, 2, 3):
        _seed_word_with_root(db, pos, "ktb")
    # a real derived form (has Arabic) and a junk one (form_arabic=None)
    db.upsert_root_form(
        RootFormModel(
            root_id=kid,
            sort_order=0,
            pos_label="Noun",
            form_arabic="كِتَٰب",
            occurrence_count=3,
        )
    )
    db.upsert_root_form(
        RootFormModel(
            root_id=kid, sort_order=1, pos_label="Lane's Lexicon", form_arabic=None
        )
    )
    # root with no segments at all: count stays 0
    db.upsert_root(
        RootModel(root_buckwalter="zzz", root_arabic="ز", occurrence_count=99)
    )

    counts_changed, forms_deleted = fix_root_data(db)

    assert forms_deleted == 1
    # ktb 0->3 and zzz 99->0 both changed
    assert counts_changed == 2
    ktb = db.get_root_by_buckwalter("ktb")
    assert ktb["occurrence_count"] == 3
    assert db.get_root_by_buckwalter("zzz")["occurrence_count"] == 0
    forms = db.get_root_forms_raw(kid)
    assert len(forms) == 1
    assert forms[0]["form_arabic"] == "كِتَٰب"


def test_idempotent_second_run_is_noop(tmp_path) -> None:
    db = _db(tmp_path)
    kid = db.upsert_root(
        RootModel(root_buckwalter="ktb", root_arabic="ك ت ب", occurrence_count=0)
    )
    _seed_word_with_root(db, 1, "ktb")
    db.upsert_root_form(
        RootFormModel(root_id=kid, sort_order=0, pos_label="junk", form_arabic=None)
    )
    assert fix_root_data(db) == (1, 1)
    assert fix_root_data(db) == (0, 0)
