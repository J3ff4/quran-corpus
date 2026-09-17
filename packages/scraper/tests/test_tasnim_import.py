"""Tasnim import: grouping, validation, and the mt export that precedes it."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest

from scraper import tasnim_import
from scraper.db import ScraperDatabase
from scraper.tasnim_import import (
    clean_gloss,
    export_mt_glosses,
    import_tasnim,
    strip_markup,
    validate_gloss,
)


def _corpus(path: Path, words: dict[tuple[int, int], list[str]]) -> None:
    """A real corpus DB via ScraperDatabase, so the schema is schema.sql's."""
    db = ScraperDatabase(str(path))
    con = db._conn
    for (surah, ayah), texts in words.items():
        con.execute(
            "INSERT OR IGNORE INTO surahs (id, name_arabic, name_translit,"
            " name_translation, revelation_type, ayah_count, order_number)"
            " VALUES (?,?,?,?,'meccan',?,?)",
            (surah, "س", "s", "S", len(words), surah),
        )
        cur = con.execute(
            "INSERT INTO ayahs (surah_id, ayah_number, text_uthmani) VALUES (?,?,?)",
            (surah, ayah, " ".join(texts)),
        )
        for position, text in enumerate(texts, start=1):
            con.execute(
                "INSERT INTO words (ayah_id, position, text_arabic) VALUES (?,?,?)",
                (cur.lastrowid, position, text),
            )
    con.commit()
    db.close()


def _tasnim(path: Path, rows, *, names=(), verses=()) -> None:
    con = sqlite3.connect(path)
    con.executescript(
        "CREATE TABLE bywords (id INTEGER PRIMARY KEY, surahId INT, verseId INT,"
        " wordsAr TEXT, translateUzlat TEXT);"
        "CREATE TABLE surah_name (surahNo INT, nameUzbek TEXT, nameUzlat TEXT,"
        " suraMeanUzbek TEXT, suraMeanUzlat TEXT);"
        "CREATE TABLE quran (id INTEGER PRIMARY KEY, surahId INT, verseId INT,"
        " uzlat TEXT, uzbek TEXT);"
    )
    con.executemany(
        "INSERT INTO bywords (surahId, verseId, wordsAr, translateUzlat)"
        " VALUES (?,?,?,?)",
        rows,
    )
    con.executemany("INSERT INTO surah_name VALUES (?,?,?,?,?)", names)
    con.executemany(
        "INSERT INTO quran (surahId, verseId, uzlat, uzbek) VALUES (?,?,?,?)", verses
    )
    con.commit()
    con.close()


def _run(tmp_path, words, rows, **kw):
    corpus, tasnim = tmp_path / "c.db", tmp_path / "t.db"
    _corpus(corpus, words)
    _tasnim(tasnim, rows, **kw)
    summary = import_tasnim(
        corpus,
        tasnim,
        export_path=tmp_path / "mt.jsonl",
        rejects_path=tmp_path / "rejects.tsv",
    )
    return corpus, summary


def _glosses(path):
    con = sqlite3.connect(path)
    out = con.execute(
        "SELECT w.position, g.language_code, g.gloss_text, g.source, g.gloss_group"
        "  FROM word_glosses g JOIN words w ON w.id = g.word_id"
        " ORDER BY w.position, g.language_code"
    ).fetchall()
    con.close()
    return out


def test_a_group_writes_one_gloss_over_every_word_it_covers(tmp_path):
    # The reason gloss_group exists: Tasnim's "shubha yo'q" covers two of our
    # words, and both must carry it -- tagged as ONE gloss, not two glosses
    # that happen to read alike.
    corpus, summary = _run(
        tmp_path,
        {(1, 1): ["لَا", "رَيْبَ", "فِيهِ"]},
        [(1, 1, "لَا رَيْبَ", "shubha yo'q"), (1, 1, "ف۪يهِ", "unda")],
    )
    rows = _glosses(corpus)
    latin = [r for r in rows if r[1] == "uz"]
    assert [(r[0], r[2]) for r in latin] == [
        (1, "shubha yo'q"),
        (2, "shubha yo'q"),
        (3, "unda"),
    ]
    # Same group id on the pair, NULL on the single.
    assert latin[0][4] == latin[1][4] is not None
    assert latin[2][4] is None
    assert {r[3] for r in latin} == {"tasnim"}
    assert summary.groups == 2


def test_cyrillic_lands_under_its_own_code_sharing_the_group_ids(tmp_path):
    # Two BCP-47 codes, not a schema change: word_glosses is already
    # UNIQUE(word_id, language_code), so both scripts coexist per word.
    corpus, _ = _run(
        tmp_path,
        {(1, 1): ["لَا", "رَيْبَ"]},
        [(1, 1, "لَا رَيْبَ", "shubha yo'q")],
    )
    rows = _glosses(corpus)
    cyrl = [r for r in rows if r[1] == "uz-Cyrl"]
    assert [r[2] for r in cyrl] == ["шубҳа йўқ", "шубҳа йўқ"]
    assert {r[3] for r in cyrl} == {"tasnim-cyrl"}
    # Shared with the Latin rows: one gloss in two scripts, not two glosses.
    latin = [r for r in rows if r[1] == "uz"]
    assert {r[4] for r in cyrl} == {r[4] for r in latin}


def test_the_mt_rows_are_exported_before_they_are_deleted(tmp_path):
    # UNIQUE(word_id, language_code) means mt and Tasnim cannot coexist under
    # 'uz'. The export is the only copy of 75539 machine-translated glosses
    # once the delete runs.
    corpus = tmp_path / "c.db"
    _corpus(corpus, {(1, 1): ["لَا", "رَيْبَ"]})
    con = sqlite3.connect(corpus)
    con.execute(
        "INSERT INTO word_glosses (word_id, language_code, gloss_text, source)"
        " SELECT id, 'uz', 'eski', 'mt' FROM words"
    )
    con.commit()
    out = tmp_path / "mt.jsonl"
    assert export_mt_glosses(con, out) == 2
    con.close()
    lines = [json.loads(line) for line in out.read_text(encoding="utf-8").splitlines()]
    assert [line["gloss_text"] for line in lines] == ["eski", "eski"]
    assert lines[0]["surah_id"] == 1 and lines[0]["position"] == 1


def test_the_import_refuses_to_delete_mt_rows_it_did_not_export(tmp_path):
    # The assert the plan asks for, as code: a short export followed by a
    # delete is 75539 glosses gone with no copy anywhere.
    corpus = tmp_path / "c.db"
    _corpus(corpus, {(1, 1): ["لَا"]})
    con = sqlite3.connect(corpus)
    con.execute(
        "INSERT INTO word_glosses (word_id, language_code, gloss_text, source)"
        " SELECT id, 'uz', 'eski', 'mt' FROM words"
    )
    con.commit()
    con.close()
    _tasnim(tmp_path / "t.db", [(1, 1, "لَا", "yo'q")])
    # A file where the export's parent directory should be: mkdir raises, and
    # nothing may be deleted after that.
    (tmp_path / "blocked").write_text("not a directory", encoding="utf-8")
    with pytest.raises(RuntimeError, match="export failed"):
        import_tasnim(
            corpus,
            tmp_path / "t.db",
            export_path=tmp_path / "blocked" / "mt.jsonl",
            rejects_path=tmp_path / "rejects.tsv",
        )
    con = sqlite3.connect(corpus)
    assert con.execute("SELECT COUNT(*) FROM word_glosses").fetchone()[0] == 1
    con.close()


def test_a_short_export_stops_the_delete(monkeypatch, tmp_path):
    # The plan's own assert, as code. An export that silently wrote fewer rows
    # than the table holds is the one failure that loses glosses permanently:
    # the delete runs, and the copy is incomplete.
    corpus = tmp_path / "c.db"
    _corpus(corpus, {(1, 1): ["لَا", "رَيْبَ"]})
    con = sqlite3.connect(corpus)
    con.execute(
        "INSERT INTO word_glosses (word_id, language_code, gloss_text, source)"
        " SELECT id, 'uz', 'eski', 'mt' FROM words"
    )
    con.commit()
    con.close()
    _tasnim(tmp_path / "t.db", [(1, 1, "لَا رَيْبَ", "yo'q")])
    monkeypatch.setattr(tasnim_import, "export_mt_glosses", lambda con, path: 1)
    with pytest.raises(RuntimeError, match="1 of 2"):
        import_tasnim(
            corpus,
            tmp_path / "t.db",
            export_path=tmp_path / "mt.jsonl",
            rejects_path=tmp_path / "rejects.tsv",
        )
    con = sqlite3.connect(corpus)
    assert con.execute("SELECT COUNT(*) FROM word_glosses").fetchone()[0] == 2
    con.close()


@pytest.mark.parametrize(
    "gloss,reason",
    [
        ("", "empty"),
        ("   ", "empty"),
        ("x" * 121, "too long"),
        ("ibn as-sabil ابن السبيل", "arabic"),
    ],
)
def test_a_gloss_that_fails_validation_is_named_not_written(gloss, reason):
    # §3: validate at the boundary. Tasnim has rows with Arabic sitting in the
    # gloss column (4:36), and a 121-char "gloss" is a verse translation that
    # wandered into the word column.
    assert reason in (validate_gloss(gloss) or "")


def test_a_valid_gloss_passes():
    # The half that matters: a rule rejecting everything would pass the tests
    # above and ship no glosses at all.
    assert validate_gloss("shubha yo'q") is None
    assert validate_gloss("x" * 120) is None


def test_a_rejected_gloss_is_counted_and_leaves_its_word_bare(tmp_path):
    corpus, summary = _run(
        tmp_path,
        {(1, 1): ["لَا"]},
        [(1, 1, "لَا", "yo'q ابن")],
    )
    assert summary.rejected == 1
    assert _glosses(corpus) == []


def test_verse_markup_is_stripped(tmp_path):
    # Tasnim's `quran.uzlat` is HTML: the word-linking <b> tags would otherwise
    # be indexed verbatim into search_fts by trg_translations_ai.
    assert strip_markup("<b></b> Barcha <b>hamd</b> va sano.") == "Barcha hamd va sano."
    corpus, summary = _run(
        tmp_path,
        {(1, 1): ["لَا"]},
        [(1, 1, "لَا", "yo'q")],
        verses=[(1, 1, "<b>Alloh</b> nomi bilan", "<b>Аллоҳ</b> номи билан")],
    )
    con = sqlite3.connect(corpus)
    rows = con.execute(
        "SELECT language_code, translator, text FROM translations"
    ).fetchall()
    con.close()
    # Both scripts: Tasnim ships the verse in two columns, and a reader on the
    # Cyrillic toggle queries uz-Cyrl for the verse as well as the words.
    assert rows == [
        ("uz", "Tasnim", "Alloh nomi bilan"),
        ("uz-Cyrl", "Tasnim", "Аллоҳ номи билан"),
    ]
    assert summary.translations == 2


def test_a_rerun_does_not_destroy_the_mt_export(tmp_path):
    # The first import moves every mt gloss out of the DB, so the export file
    # becomes their only copy. A second run has 0 rows to write and must not
    # open that file for writing -- the count guard cannot catch it, because
    # both sides of `exported != expected` are then 0.
    export = tmp_path / "mt.jsonl"
    export.write_text('{"gloss_text": "the only copy"}\n', encoding="utf-8")
    corpus = tmp_path / "c.db"
    tasnim = tmp_path / "t.db"
    _corpus(corpus, {(1, 1): ["لَا"]})
    _tasnim(tasnim, [(1, 1, "لَا", "yo'q")])
    summary = import_tasnim(
        corpus, tasnim, export_path=export, rejects_path=tmp_path / "r.tsv"
    )
    assert summary.mt_exported == 0
    assert export.read_text(encoding="utf-8") == '{"gloss_text": "the only copy"}\n'


def test_a_rerun_leaves_no_stale_gloss_group(tmp_path):
    # gloss_group restarts at 1 every run. A tasnim row surviving on a word the
    # new run does not reach would carry a group id that now names a different
    # phrase, so two unrelated spans would read as one gloss. The delete is
    # what removes it -- the upsert only ever touches words the run reaches.
    corpus = tmp_path / "c.db"
    _corpus(corpus, {(1, 1): ["لَا"], (1, 2): ["رَيْبَ"]})
    con = sqlite3.connect(corpus)
    stale = con.execute("SELECT id FROM words ORDER BY id DESC LIMIT 1").fetchone()[0]
    con.execute(
        "INSERT INTO word_glosses (word_id, language_code, gloss_text, source,"
        " gloss_group) VALUES (?, 'uz', 'from an older run', 'tasnim', 1)",
        (stale,),
    )
    con.commit()
    con.close()

    tasnim = tmp_path / "t.db"
    _tasnim(tasnim, [(1, 1, "لَا", "yo'q")])
    import_tasnim(
        corpus,
        tasnim,
        export_path=tmp_path / "mt.jsonl",
        rejects_path=tmp_path / "r.tsv",
    )
    assert "from an older run" not in {r[2] for r in _glosses(corpus)}


def test_a_surah_meaning_equal_to_its_name_is_stored_null(tmp_path):
    # Tavba means Tavba: repeating it would render as "Tavba (Tavba)".
    corpus, summary = _run(
        tmp_path,
        {(1, 1): ["لَا"]},
        [(1, 1, "لَا", "yo'q")],
        names=[(1, "Тавба", "Tavba", "Тавба", "Tavba")],
    )
    con = sqlite3.connect(corpus)
    rows = con.execute(
        "SELECT language_code, name, meaning FROM surah_names ORDER BY language_code"
    ).fetchall()
    con.close()
    assert rows == [("uz", "Tavba", None), ("uz-Cyrl", "Тавба", None)]
    assert summary.surah_names == 2


def test_a_real_meaning_survives(tmp_path):
    # The mutation partner of the test above: a rule that nulled every meaning
    # would pass it.
    corpus, _ = _run(
        tmp_path,
        {(1, 1): ["لَا"]},
        [(1, 1, "لَا", "yo'q")],
        names=[(1, "Фотиҳа", "Fotiha", "Очувчи", "Ochuvchi")],
    )
    con = sqlite3.connect(corpus)
    rows = con.execute(
        "SELECT language_code, meaning FROM surah_names ORDER BY language_code"
    ).fetchall()
    con.close()
    assert rows == [("uz", "Ochuvchi"), ("uz-Cyrl", "Очувчи")]


def test_the_uz_cyrl_language_row_is_created(tmp_path):
    # surah_names and word_glosses both FK to languages(code); without this row
    # every Cyrillic insert fails.
    corpus, _ = _run(tmp_path, {(1, 1): ["لَا"]}, [(1, 1, "لَا", "yo'q")])
    con = sqlite3.connect(corpus)
    codes = {r[0] for r in con.execute("SELECT code FROM languages")}
    con.close()
    assert {"uz", "uz-Cyrl"} <= codes


def test_an_unaligned_ayah_is_reported_and_glosses_nothing(tmp_path):
    corpus, summary = _run(
        tmp_path,
        {(1, 1): ["لَا", "رَيْبَ"]},
        [(1, 1, "قُلْ", "ayt")],
    )
    assert summary.unaligned == 1
    assert _glosses(corpus) == []


def test_no_mt_gloss_survives_the_import(tmp_path):
    # The upsert alone is not enough: it overwrites only the words Tasnim
    # reaches, leaving mt rows behind on every word it does not -- a silent
    # mixture of two sources under one language code, with `source` the only
    # thing distinguishing them and nothing reading it.
    corpus = tmp_path / "c.db"
    _corpus(corpus, {(1, 1): ["لَا", "رَيْبَ"], (1, 2): ["قُلْ"]})
    con = sqlite3.connect(corpus)
    con.execute(
        "INSERT INTO word_glosses (word_id, language_code, gloss_text, source)"
        " SELECT id, 'uz', 'eski', 'mt' FROM words"
    )
    con.commit()
    con.close()
    # Tasnim covers ayah 1 only; ayah 2's word is exactly the case above.
    _tasnim(tmp_path / "t.db", [(1, 1, "لَا رَيْبَ", "shubha yo'q")])
    summary = import_tasnim(
        corpus,
        tmp_path / "t.db",
        export_path=tmp_path / "mt.jsonl",
        rejects_path=tmp_path / "rejects.tsv",
    )
    assert summary.mt_exported == 3
    con = sqlite3.connect(corpus)
    assert (
        con.execute("SELECT COUNT(*) FROM word_glosses WHERE source = 'mt'").fetchone()[
            0
        ]
        == 0
    )
    con.close()


def test_the_cyrillic_e_homoglyph_is_repaired():
    # 181 occurrences in Tasnim's Latin column: Cyrillic е inside Latin words,
    # identical on screen, different to every machine that reads it.
    assert clean_gloss("k\u0435yingilar") == "keyingilar"
    assert "\u0435" not in clean_gloss("b\u0435huda")


def test_a_stray_arabic_diacritic_does_not_cost_a_good_gloss():
    # "bu yerda" with a maddah glued to the end is a usable gloss; the Arabic
    # LETTERS that validate_gloss refuses are a different thing.
    assert clean_gloss("bu yerda\u0653") == "bu yerda"
    assert validate_gloss(clean_gloss("bu yerda\u0653")) is None
    # Still refused, because these are letters, not marks.
    assert validate_gloss(clean_gloss("nimaiki\u0670\u0628\u064b\u0627")) is not None


def test_cleaning_leaves_an_ordinary_gloss_alone():
    # The mutation partner: a cleaner that mangled good text would pass above.
    assert clean_gloss("shubha yo\u2019q") == "shubha yo\u2019q"
    assert clean_gloss("bo\u02bblgan") == "bo\u02bblgan"


def test_only_arabic_marks_are_stripped_not_every_combining_mark():
    # Cyrillic й is и + U+0306 when decomposed, and ғ/ў likewise. An
    # unconditional strip of combining marks would silently rewrite those into
    # different letters -- so the strip is scoped to the Arabic ranges.
    assert clean_gloss("\u0438\u0306\u045e\u0493") == "\u0438\u0306\u045e\u0493"


def test_a_hand_reviewed_gloss_is_exported_before_it_is_deleted(tmp_path):
    # review_glosses.py writes source='mt-reviewed'. Those rows are the only
    # hand-corrected data in the table and exist nowhere else, so an import
    # that deletes them without carrying them out destroys them for good -- and
    # a guard counting only 'mt' compares 0 against 0 and calls that success.
    corpus = tmp_path / "c.db"
    _corpus(corpus, {(1, 1): ["لَا", "رَيْبَ"], (1, 2): ["قُلْ"]})
    con = sqlite3.connect(corpus)
    con.execute(
        "INSERT INTO word_glosses (word_id, language_code, gloss_text, source)"
        " SELECT id, 'uz', 'qoʻlda tuzatilgan', 'mt-reviewed' FROM words"
    )
    con.commit()
    con.close()
    # Ayah 2 is outside Tasnim's coverage: its row is deleted, never upserted.
    _tasnim(tmp_path / "t.db", [(1, 1, "لَا رَيْبَ", "shubha yo'q")])
    export = tmp_path / "mt.jsonl"
    summary = import_tasnim(
        corpus,
        tmp_path / "t.db",
        export_path=export,
        rejects_path=tmp_path / "rejects.tsv",
    )

    assert summary.mt_exported == 3
    exported = [json.loads(line) for line in export.read_text("utf-8").splitlines()]
    assert len(exported) == 3
    assert {row["gloss_text"] for row in exported} == {"qoʻlda tuzatilgan"}
    # Every one of them, including the word Tasnim never reached.
    assert (1, 2, 1) in {
        (r["surah_id"], r["ayah_number"], r["position"]) for r in exported
    }

    con = sqlite3.connect(corpus)
    assert (
        con.execute(
            "SELECT COUNT(*) FROM word_glosses WHERE source = 'mt-reviewed'"
        ).fetchone()[0]
        == 0
    )
    con.close()
