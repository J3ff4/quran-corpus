"""Uzbek Latin -> Cyrillic.

Both scripts are in daily use in Uzbekistan, so a reader picks one; Tasnim
ships only Latin (its Cyrillic column is filled for 30 rows of surah 1), and
this is where the other script comes from.
"""

from __future__ import annotations

from scraper.translit_uz_cyrl import to_cyrillic


def test_digraph_beats_singles():
    # Longest match first, or `sh` transliterates as с + ҳ and every word
    # carrying it comes out unreadable.
    assert to_cyrillic("shubha") == "шубҳа"


def test_x_and_h_do_not_collapse():
    # Two distinct Cyrillic letters. Folding them together is the single most
    # visible error available here -- хайр and ҳамд are unrelated words.
    assert to_cyrillic("xayr") == "хайр"
    assert to_cyrillic("hamd") == "ҳамд"


def test_apostrophe_variants_all_map():
    # o' is a letter, not an o followed by punctuation, and the four
    # apostrophes below are indistinguishable on screen. Tasnim uses U+2019.
    for apostrophe in ("o'", "oʻ", "oʼ", "o’"):
        assert to_cyrillic(apostrophe + "zi") == "ўзи"


def test_gain_takes_its_apostrophe_too():
    assert to_cyrillic("yo’l") == "йўл"
    assert to_cyrillic("g’am") == "ғам"


def test_initial_e_is_e_oborotnoye():
    assert to_cyrillic("ertaga") == "эртага"
    assert to_cyrillic("kel") == "кел"


def test_case_survives():
    assert to_cyrillic("Alloh") == "Аллоҳ"
    assert to_cyrillic("Shubha") == "Шубҳа"


def test_ye_yo_yu_ya_are_single_letters():
    assert to_cyrillic("yaxshi") == "яхши"
    assert to_cyrillic("yurak") == "юрак"


def test_punctuation_and_parentheses_pass_through():
    # Real glosses carry them: "musulmonlar (holida)", "ko’rmadingizmi?".
    assert to_cyrillic("musulmonlar (holida)") == "мусулмонлар (ҳолида)"


def test_word_boundaries_are_per_word_not_per_string():
    # The initial-e rule keys off the start of a WORD. A gloss is a phrase.
    assert to_cyrillic("va endi") == "ва энди"


def test_a_lone_apostrophe_is_the_glottal_stop():
    # Same character as the one inside o’ and g’, different letter: after a
    # consonant or a vowel it is tutuq belgisi. Tasnim's glosses are full of
    # it -- Ya’qub, ta’vil, ma’no.
    assert to_cyrillic("Ya’qub") == "Яъқуб"
    assert to_cyrillic("ma’no") == "маъно"


def test_o_apostrophe_beats_the_yo_digraph():
    # Both start at overlapping offsets. Read left to right with `yo` first,
    # "yo’l" becomes ёл -- a different word.
    assert to_cyrillic("yo’l") == "йўл"


def test_a_trailing_o_or_g_is_not_an_apostrophe_letter():
    # The end of the string is not an apostrophe. "" is a substring of every
    # string, so a bare membership test on the lookahead turns "no" into нў.
    assert to_cyrillic("no") == "но"
    assert to_cyrillic("bog") == "бог"


def test_t_plus_s_is_not_the_cyrillic_ts():
    # ц belongs to Russian loanwords, but t + s is ordinary Uzbek morphology --
    # the conditional -sa and the privative -siz. Every one of the 46 `ts`
    # tokens in the Tasnim glosses is this, not a ц word.
    assert to_cyrillic("aytsa") == "айтса"
    assert to_cyrillic("baxtsiz") == "бахтсиз"
    assert to_cyrillic("qaytsangiz") == "қайтсангиз"
