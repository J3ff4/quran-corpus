"""Tests for deriving per-root gloss lists from the word-by-word glosses."""

from __future__ import annotations

from pathlib import Path

import pytest

from scraper.db import ScraperDatabase
from scraper.root_glosses import TOP_N, derive_root_glosses, rank_glosses


def test_ranks_by_frequency_descending():
    assert rank_glosses(["kitob", "kitob", "yozdi"]) == [("kitob", 2), ("yozdi", 1)]


def test_ties_break_alphabetically():
    # Insertion order is deliberately anti-alphabetical: a rank that merely
    # preserved dict order would pass on "yozdi" first.
    assert rank_glosses(["yozdi", "kitob", "olim"]) == [
        ("kitob", 1),
        ("olim", 1),
        ("yozdi", 1),
    ]


def test_cap_holds_at_top_n():
    glosses = [f"gloss{i}" for i in range(TOP_N + 5)]
    assert len(rank_glosses(glosses)) == TOP_N


def test_cap_keeps_the_most_frequent_not_the_first():
    # The rare ones come first; the cap must drop them, not the frequent tail.
    glosses = [f"rare{i}" for i in range(TOP_N)] + ["keng", "keng"]
    assert rank_glosses(glosses)[0] == ("keng", 2)


def test_counting_folds_case_and_whitespace():
    assert rank_glosses(["Kitob", "  kitob ", "kitob"]) == [("kitob", 3)]


def test_stores_the_most_frequent_surface_spelling():
    # Two spellings of one gloss: the count is joint, the stored form is the
    # one Tasnim actually wrote most often.
    assert rank_glosses(["Kitob", "kitob", "kitob"]) == [("kitob", 3)]
    assert rank_glosses(["Kitob", "Kitob", "kitob"]) == [("Kitob", 3)]


def test_surface_spelling_ties_break_alphabetically():
    assert rank_glosses(["Kitob", "kitob"]) == [("Kitob", 2)]


def test_punctuation_only_glosses_are_skipped():
    assert rank_glosses(["kitob", "-", "...", "،"]) == [("kitob", 1)]


def test_empty_input_yields_nothing():
    assert rank_glosses([]) == []


@pytest.fixture()
def db(tmp_path: Path):
    """A real corpus DB via ScraperDatabase, so the schema is schema.sql's."""
    con = ScraperDatabase(str(tmp_path / "t.db")).connection
    con.executescript("""
        INSERT INTO languages (code, name_native, name_english, direction)
          VALUES ('uz', 'Ozbekcha', 'Uzbek', 'ltr'),
                 ('uz-Cyrl', 'Узбекча', 'Uzbek (Cyrillic)', 'ltr');
        INSERT INTO surahs (id, name_arabic, name_translit, name_translation,
                            revelation_type, ayah_count, order_number)
          VALUES (1, 'x', 'x', 'x', 'meccan', 1, 1);
        INSERT INTO ayahs (id, surah_id, ayah_number, text_uthmani)
          VALUES (1, 1, 1, 'x');
        INSERT INTO roots (id, root_buckwalter, root_arabic) VALUES (1, 'ktb', 'كتب');
        INSERT INTO words (id, ayah_id, position, text_arabic)
          VALUES (1, 1, 1, 'كتاب'), (2, 1, 2, 'كتب'), (3, 1, 3, 'كتب');
        INSERT INTO word_segments (word_id, segment_index, root)
          VALUES (1, 1, 'ktb'), (2, 1, 'ktb'), (3, 1, 'ktb');
        INSERT INTO word_glosses (word_id, language_code, gloss_text, source)
          VALUES (1, 'uz', 'kitob', 'tasnim'),
                 (2, 'uz', 'kitob', 'tasnim'),
                 (3, 'uz', 'yozdi', 'tasnim'),
                 (1, 'uz-Cyrl', 'китоб', 'tasnim-cyrl');
    """)
    con.commit()
    return con


def test_derive_writes_ranked_rows(db):
    assert derive_root_glosses(db, "uz") == 1
    rows = db.execute(
        "SELECT rank, gloss, occurrence_count FROM root_glosses"
        " WHERE language_code = 'uz' ORDER BY rank"
    ).fetchall()
    assert [tuple(r) for r in rows] == [(1, "kitob", 2), (2, "yozdi", 1)]


def test_derive_is_scoped_to_one_language(db):
    derive_root_glosses(db, "uz")
    derive_root_glosses(db, "uz-Cyrl")
    cyrl = db.execute(
        "SELECT gloss FROM root_glosses WHERE language_code = 'uz-Cyrl'"
    ).fetchall()
    assert [r["gloss"] for r in cyrl] == ["китоб"]
    assert (
        db.execute(
            "SELECT COUNT(*) FROM root_glosses WHERE language_code = 'uz'"
        ).fetchone()[0]
        == 2
    )


def test_derive_is_idempotent(db):
    derive_root_glosses(db, "uz")
    first = db.execute("SELECT COUNT(*) FROM root_glosses").fetchone()[0]
    derive_root_glosses(db, "uz")
    assert db.execute("SELECT COUNT(*) FROM root_glosses").fetchone()[0] == first


def test_a_word_glossed_twice_under_one_root_counts_once(db):
    # A word can carry the same root on two segments (a doubled form). The
    # gloss belongs to the word, so it must not be counted per segment.
    db.execute(
        "INSERT INTO word_segments (word_id, segment_index, root) VALUES (3, 2, 'ktb')"
    )
    derive_root_glosses(db, "uz")
    assert (
        db.execute(
            "SELECT occurrence_count FROM root_glosses WHERE gloss = 'yozdi'"
        ).fetchone()[0]
        == 1
    )


def test_a_root_with_no_glosses_writes_nothing(db):
    db.execute(
        "INSERT INTO roots (id, root_buckwalter, root_arabic) VALUES (2, 'qwl', 'قول')"
    )
    assert derive_root_glosses(db, "uz") == 1
