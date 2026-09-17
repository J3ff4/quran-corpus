"""The Tasnim -> corpus aligner.

Every literal here is real text from the two databases, not invented: the
normalizer's whole job is to survive the specific ways these two sources spell
the same word, and a synthetic string cannot fail in those ways.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest

from scraper.tasnim_align import (
    OVERRIDES_PATH,
    Group,
    align_all,
    align_ayah,
    base_form,
    load_overrides,
    resolve_override,
    skeleton,
)


def test_base_form_keeps_letters():
    # The trap that cost an hour: the obvious "strip Arabic marks" character
    # class spans LETTERS, so it empties every string -- and two empty strings
    # compare equal, which reports a perfect 100% alignment. Assert that a real
    # word SURVIVES, not merely that the marks died.
    assert base_form("بِسْمِ") == "بسم"
    assert base_form("ٱلرَّحْمَٰنِ") == "الرحمن"


def test_tatweel_is_stripped():
    # U+0640 is a letter by category and sits inside the kept Arabic range, so
    # combining-mark removal does not touch it. 428 ayahs failed on this alone.
    assert "ـ" not in base_form("بِٱلْـَٔاخِرَةِ")


def test_skeleton_drops_the_matres_lectionis():
    # Tier 2's entire content: our Uthmani الصرط against Tasnim's imlai الصراط.
    assert skeleton("الصراط") == skeleton("الصرط")
    assert skeleton("مالك") == skeleton("ملك")


def test_tier_one_aligns_one_to_one():
    corpus = [(1, "بِسْمِ"), (2, "ٱللَّهِ")]
    tasnim = [("بِسْمِ", "nomi bilan"), ("ٱللَّهِ", "Allohning")]
    assert align_ayah(corpus, tasnim) == [
        Group((1,), "nomi bilan"),
        Group((2,), "Allohning"),
    ]


def test_tier_two_rescues_uthmani_vs_imlai():
    corpus = [(1, "ٱلصِّرَٰطَ")]
    tasnim = [("الصِّرَاطَ", "yo'lga")]
    assert align_ayah(corpus, tasnim) == [Group((1,), "yo'lga")]


def test_grouping_maps_one_gloss_to_two_words():
    corpus = [(1, "لَا"), (2, "رَيْبَ")]
    tasnim = [("لَا رَيْبَ", "shubha yo'q")]
    assert align_ayah(corpus, tasnim) == [Group((1, 2), "shubha yo'q")]


def test_no_alignment_returns_none_never_a_guess():
    # The failure mode worth guarding: a partial or best-effort result writes
    # the wrong Uzbek under the wrong Arabic and nothing downstream can tell.
    corpus = [(1, "بِسْمِ")]
    tasnim = [("ٱللَّهِ", "Allohning")]
    assert align_ayah(corpus, tasnim) is None


def test_leftover_corpus_words_are_not_an_alignment():
    # Tasnim runs out first. Both cursors have to land at the end, or the tail
    # of the ayah silently carries no gloss while the call reports success.
    corpus = [(1, "بِسْمِ"), (2, "ٱللَّهِ")]
    tasnim = [("بِسْمِ", "nomi bilan")]
    assert align_ayah(corpus, tasnim) is None


def test_leftover_tasnim_rows_are_not_an_alignment():
    corpus = [(1, "بِسْمِ")]
    tasnim = [("بِسْمِ", "nomi bilan"), ("ٱللَّهِ", "Allohning")]
    assert align_ayah(corpus, tasnim) is None


def test_one_tier_for_the_whole_ayah_never_a_mix():
    # Tier 2 throws away the long vowels, so it matches strings tier 1 would
    # keep apart. Mixing the two within one ayah would let a loose match in
    # position 3 paper over a real disagreement in position 1.
    corpus = [(1, "قَالَ"), (2, "ٱلصِّرَٰطَ")]
    tasnim = [("قال", "dedi"), ("الصراط", "yo'lga")]
    groups = align_ayah(corpus, tasnim)
    assert groups == [Group((1,), "dedi"), Group((2,), "yo'lga")]


def test_tasnim_may_split_a_word_we_hold_whole():
    # The other direction, and the one that cost 166 ayahs when it was missing:
    # our corpus holds the vocative يٰقَوْمِ as one word, Tasnim glosses يا and
    # قوم separately. Several rows landing on one word join in source order.
    corpus = [(1, "يَٰقَوْمِ")]
    tasnim = [("يا", "ey"), ("قوم", "qavmim")]
    assert align_ayah(corpus, tasnim) == [Group((1,), "ey qavmim")]


def test_equal_length_disagreement_is_not_walked_past():
    # Two normalized runs the same length and different: a genuine mismatch. A
    # walk that kept consuming could re-synchronize by luck and hand back a
    # mapping nothing downstream can tell is wrong.
    corpus = [(1, "قَالَ"), (2, "رَبِّ")]
    tasnim = [("كَانَ", "edi"), ("رَبِّ", "Robbim")]
    assert align_ayah(corpus, tasnim) is None


# --- overrides -------------------------------------------------------------


def test_an_override_wins_over_both_tiers(tmp_path):
    # Consulted BEFORE tier 1, never after: a hand mapping exists because the
    # automatic ones are wrong here, so a lucky match must not overrule it.
    path = tmp_path / "o.json"
    path.write_text(
        json.dumps({"1:1": [{"words": [1, 2], "gloss": "qo'lda"}]}), encoding="utf-8"
    )
    overrides = load_overrides(path)
    assert resolve_override(overrides["1:1"], [(11, "بِسْمِ"), (12, "ٱللَّهِ")]) == [
        Group((11, 12), "qo'lda")
    ]


def test_a_position_may_not_appear_twice(tmp_path):
    # Two groups over one word cannot both be written: word_glosses is
    # UNIQUE(word_id, language_code), so the second silently replaces the first.
    path = tmp_path / "o.json"
    path.write_text(
        json.dumps(
            {"1:1": [{"words": [1], "gloss": "a"}, {"words": [1, 2], "gloss": "b"}]}
        ),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="1:1"):
        load_overrides(path)


def test_a_position_past_the_end_of_the_ayah_is_refused(tmp_path):
    path = tmp_path / "o.json"
    path.write_text(
        json.dumps({"1:1": [{"words": [3], "gloss": "a"}]}), encoding="utf-8"
    )
    with pytest.raises(ValueError, match="position"):
        resolve_override(load_overrides(path)["1:1"], [(11, "بِسْمِ")])


def test_a_run_with_no_letters_is_not_a_match():
    # A word that empties under tier 2 is all matres and hamza, so a pair that
    # disagrees only on the count of alefs is tier 2 working as intended --
    # ءَاوَوا۟ against اٰوَوْا is the same word, and five live ayahs turn on it.
    assert align_ayah(
        [(1, "ءَاوَوا۟"), (2, "رَيْبَ")],
        [("اٰوَوْا", "boshpana berdi"), ("رَيْبَ", "shubha")],
    ) == [Group((1,), "boshpana berdi"), Group((2,), "shubha")]
    # A run with no letters at all, though, is evidence in no reading -- and
    # taking it would let the walk carry on past an ayah that should have been
    # handed back for a human to map.
    assert (
        align_ayah(
            [(1, "وَ"), (2, "رَيْبَ")],
            [("ءَ", "WRONG"), ("رَيْبَ", "shubha")],
        )
        is None
    )


def test_a_whitespace_only_gloss_is_dropped_not_stored_blank(tmp_path):
    # Truthy before stripping, empty after: it would be written as a blank row
    # reading "this word has no meaning" instead of falling back to the English.
    corpus, tasnim = tmp_path / "c.db", tmp_path / "t.db"
    _seed_corpus(corpus, [(1, 1, 1, "رَيْبَ")])
    _seed_tasnim(tasnim, [(1, 1, "رَيْبَ", "   ")])
    assert align_all(corpus, tasnim) == ([], [(1, 1)])


def test_an_override_must_reach_the_end_of_the_ayah(tmp_path):
    # A typo shortening a hand mapping drops the ayah's tail silently; the
    # automatic path already refuses exactly this shape.
    path = tmp_path / "o.json"
    path.write_text(
        json.dumps({"1:1": [{"words": [1], "gloss": "a"}]}), encoding="utf-8"
    )
    with pytest.raises(ValueError, match="stops at position 1"):
        resolve_override(load_overrides(path)["1:1"], [(11, "بِسْمِ"), (12, "ٱللَّهِ")])


def test_an_override_key_naming_no_ayah_is_refused(tmp_path):
    # Otherwise it never fires and never reports: the ayah just lands in
    # `unaligned`, which reads as "Tasnim has no data here".
    corpus, tasnim = tmp_path / "c.db", tmp_path / "t.db"
    _seed_corpus(corpus, [(1, 1, 1, "رَيْبَ")])
    _seed_tasnim(tasnim, [(1, 1, "رَيْبَ", "shubha")])
    path = tmp_path / "o.json"
    path.write_text(
        json.dumps({"4:360": [{"words": [1], "gloss": "a"}]}), encoding="utf-8"
    )
    with pytest.raises(ValueError, match="4:360"):
        align_all(corpus, tasnim, load_overrides(path))


def _seed_corpus(path, rows):
    con = sqlite3.connect(path)
    con.executescript(
        "CREATE TABLE ayahs (id INTEGER PRIMARY KEY, surah_id INT, ayah_number INT);"
        "CREATE TABLE words (id INTEGER PRIMARY KEY, ayah_id INT, position INT,"
        " text_arabic TEXT);"
    )
    for surah, ayah, position, text in rows:
        con.execute("INSERT OR IGNORE INTO ayahs VALUES (?,?,?)", (ayah, surah, ayah))
        con.execute(
            "INSERT INTO words (ayah_id, position, text_arabic) VALUES (?,?,?)",
            (ayah, position, text),
        )
    con.commit()
    con.close()


def _seed_tasnim(path, rows):
    con = sqlite3.connect(path)
    con.execute(
        "CREATE TABLE bywords (id INTEGER PRIMARY KEY, surahId INT, verseId INT,"
        " wordsAr TEXT, translateUzlat TEXT)"
    )
    con.executemany(
        "INSERT INTO bywords (surahId, verseId, wordsAr, translateUzlat)"
        " VALUES (?,?,?,?)",
        rows,
    )
    con.commit()
    con.close()


def test_every_residue_ayah_is_covered_by_the_shipped_overrides():
    # The file's whole job. Run against the live databases; skipped where they
    # are absent (CI has neither), which is the only reason this is not the
    # gate on its own.
    corpus = Path(__file__).resolve().parents[3] / "apps/web/quran.db"
    tasnim = Path.home() / "quran-data/refdata/TasnimDatabase.db"
    if not corpus.exists() or not tasnim.exists():
        pytest.skip("live corpus or Tasnim reference database not present")

    overrides = load_overrides(OVERRIDES_PATH)
    _, unaligned = align_all(corpus, tasnim, overrides)
    assert unaligned == []
    # And the residue WITHOUT them is exactly the set the file claims to fix --
    # an override for an ayah that aligns on its own is dead weight nobody
    # would notice.
    _, bare = align_all(corpus, tasnim)
    assert {f"{s}:{a}" for s, a in bare} == set(overrides)
