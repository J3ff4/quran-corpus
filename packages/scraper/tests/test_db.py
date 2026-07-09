import os
import sqlite3
import tempfile

import pytest

from scraper.db import ScraperDatabase
from scraper.models import SurahModel


@pytest.fixture
def seeded_word_id():
    def _make(tmp_path):
        from scraper.models import AyahModel, WordModel

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
        aid = db.upsert_ayah(AyahModel(surah_id=1, ayah_number=1, text_uthmani="بِسْمِ"))
        wid = db.upsert_word(WordModel(ayah_id=aid, position=1, text_arabic="بِسْمِ"))
        return db, wid

    return _make


def test_create_schema_creates_all_tables():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        path = f.name
    try:
        db = ScraperDatabase(path)
        db.close()
        conn = sqlite3.connect(path)
        tables = {
            r[0]
            for r in conn.execute(
                "SELECT name FROM sqlite_master"
                " WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            ).fetchall()
        }
        expected = {
            "surahs",
            "ayahs",
            "words",
            "languages",
            "translations",
            "word_glosses",
            "roots",
            "root_forms",
            "root_definitions",
            "word_segments",
            "word_concept_tags",
        }
        # Superset, not equality: schema.sql also declares the search_fts FTS5
        # virtual table, which materializes search_fts_* shadow tables we don't
        # pin here.
        assert expected <= tables
        conn.close()
    finally:
        os.unlink(path)


def test_schema_applies_fts_triggers_intact():
    """Regression: schema.sql has BEGIN…END trigger bodies (Phase 07b FTS sync).
    A naive `;`-split shreds them into 'incomplete input' — the splitter must
    keep each trigger whole so schema application succeeds and the triggers land.
    """
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        path = f.name
    try:
        db = ScraperDatabase(path)  # would raise OperationalError if split broke
        db.close()
        conn = sqlite3.connect(path)
        trigs = {
            r[0]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='trigger'"
            ).fetchall()
        }
        conn.close()
        assert {
            "trg_translations_ai",
            "trg_translations_ad",
            "trg_translations_au",
        } <= trigs
    finally:
        os.unlink(path)


def test_upsert_surah_inserts_row():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        path = f.name
    try:
        db = ScraperDatabase(path)
        surah = SurahModel(
            id=1,
            name_arabic="الفاتحة",
            name_translit="Al-Fatihah",
            name_translation="The Opening",
            revelation_type="meccan",
            ayah_count=7,
            order_number=1,
        )
        db.upsert_surah(surah)
        db.close()
        conn = sqlite3.connect(path)
        row = conn.execute("SELECT id, name_translit FROM surahs WHERE id=1").fetchone()
        assert row == (1, "Al-Fatihah")
        conn.close()
    finally:
        os.unlink(path)


def test_upsert_surah_is_idempotent():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        path = f.name
    try:
        db = ScraperDatabase(path)
        surah = SurahModel(
            id=1,
            name_arabic="الفاتحة",
            name_translit="Al-Fatihah",
            name_translation="The Opening",
            revelation_type="meccan",
            ayah_count=7,
            order_number=1,
        )
        db.upsert_surah(surah)
        db.upsert_surah(surah)
        db.close()
        conn = sqlite3.connect(path)
        count = conn.execute("SELECT COUNT(*) FROM surahs").fetchone()[0]
        assert count == 1
        conn.close()
    finally:
        os.unlink(path)


def test_upsert_word_does_not_clobber_existing_fields_with_null():
    """A later upsert without root/lemma must not overwrite existing values.

    This lets the HTML scraper (no root/lemma) and the corpus-file importer
    (root/lemma) coexist regardless of import order.
    """
    from scraper.models import AyahModel, WordModel

    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        path = f.name
    try:
        db = ScraperDatabase(path)
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
        ayah_id = db.upsert_ayah(
            AyahModel(surah_id=1, ayah_number=1, text_uthmani="بِسْمِ")
        )
        # First: corpus-file style upsert with root/lemma.
        db.upsert_word(
            WordModel(
                ayah_id=ayah_id,
                position=1,
                text_arabic="بِسْمِ",
                root="سمو",
                lemma="ٱسْم",
                root_buckwalter="smw",
                pos_tag="N",
                morphology_json='["P", "N"]',
            )
        )
        # Second: HTML-scrape style upsert without root/lemma, with a gloss-side
        # field (transliteration). Must preserve root/lemma/morphology.
        db.upsert_word(
            WordModel(
                ayah_id=ayah_id,
                position=1,
                text_arabic="بِسْمِ",
                transliteration="bis'mi",
            )
        )
        db.close()

        conn = sqlite3.connect(path)
        row = conn.execute(
            "SELECT root, lemma, root_buckwalter, pos_tag, morphology_json,"
            " transliteration FROM words WHERE ayah_id=? AND position=1",
            (ayah_id,),
        ).fetchone()
        conn.close()
        assert row[0] == "سمو"  # root preserved
        assert row[1] == "ٱسْم"  # lemma preserved
        assert row[2] == "smw"  # root_buckwalter preserved
        assert row[3] == "N"  # pos_tag preserved
        assert row[4] == '["P", "N"]'  # morphology preserved
        assert row[5] == "bis'mi"  # transliteration added
    finally:
        os.unlink(path)


def test_upsert_root_and_form(tmp_path):
    from scraper.models import RootFormModel, RootModel

    db = ScraperDatabase(str(tmp_path / "t.db"))
    rid = db.upsert_root(
        RootModel(root_buckwalter="ktb", root_arabic="ك ت ب", occurrence_count=319)
    )
    assert rid > 0
    # idempotent: same buckwalter returns same id, updates count
    rid2 = db.upsert_root(
        RootModel(root_buckwalter="ktb", root_arabic="ك ت ب", occurrence_count=320)
    )
    assert rid2 == rid
    db.upsert_root_form(
        RootFormModel(
            root_id=rid,
            sort_order=0,
            pos_label="Noun",
            form_arabic="كِتَٰب",
            occurrence_count=260,
        )
    )
    rows = db._conn.execute("SELECT occurrence_count FROM root_forms").fetchall()
    assert rows[0][0] == 260
    db.close()


def test_upsert_word_detail_columns_and_segments(tmp_path, seeded_word_id):
    from scraper.models import ConceptTagModel, WordSegmentModel

    db, wid = seeded_word_id(tmp_path)
    db.upsert_word_segment(
        WordSegmentModel(
            word_id=wid, segment_index=0, segment_type="prefix", pos_tag="P"
        )
    )
    db.upsert_word_segment(
        WordSegmentModel(
            word_id=wid,
            segment_index=1,
            segment_type="stem",
            pos_tag="N",
            features_json='{"case":"genitive"}',
            root="smw",
        )
    )
    db.upsert_concept_tag(
        ConceptTagModel(word_id=wid, tag_label="Allah", tag_type="named-entity")
    )
    segs = db._conn.execute(
        "SELECT segment_index,pos_tag FROM word_segments ORDER BY segment_index"
    ).fetchall()
    assert [s[1] for s in segs] == ["P", "N"]
    tags = db._conn.execute("SELECT tag_label FROM word_concept_tags").fetchall()
    assert tags[0][0] == "Allah"
    db.close()


def test_get_distinct_roots(tmp_path, seeded_word_id):
    db, wid = seeded_word_id(tmp_path)
    db._conn.execute("UPDATE words SET root_buckwalter='smw' WHERE id=?", (wid,))
    db._conn.commit()
    assert db.get_distinct_roots() == ["smw"]
    db.close()


def test_gloss_source_column_and_backfill(tmp_path) -> None:
    p = str(tmp_path / "s.db")
    # simulate a legacy DB: create word_glosses WITHOUT source, insert an EN row
    import sqlite3
    raw = sqlite3.connect(p)
    raw.executescript(
        """CREATE TABLE word_glosses(
             id INTEGER PRIMARY KEY AUTOINCREMENT,
             word_id INTEGER NOT NULL, language_code TEXT NOT NULL,
             gloss_text TEXT NOT NULL, UNIQUE(word_id, language_code));
           INSERT INTO word_glosses(word_id,language_code,gloss_text)
             VALUES (1,'en','from');"""
    )
    raw.commit(); raw.close()

    db = ScraperDatabase(p)  # _apply_schema runs the migration
    cols = {r["name"] for r in db._conn.execute("PRAGMA table_info(word_glosses)")}
    assert "source" in cols
    src = db._conn.execute(
        "SELECT source FROM word_glosses WHERE word_id=1 AND language_code='en'"
    ).fetchone()["source"]
    assert src == "corpus"
    db.close()
