"""The Tasnim -> corpus aligner.

Every literal here is real text from the two databases, not invented: the
normalizer's whole job is to survive the specific ways these two sources spell
the same word, and a synthetic string cannot fail in those ways.
"""

from __future__ import annotations

from scraper.tasnim_align import Group, align_ayah, base_form, skeleton


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
