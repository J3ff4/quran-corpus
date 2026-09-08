from scraper.mushaf_metrics import widest_line_em

# The layout's glyph strings are private-use codepoints. They are written here
# as escapes on purpose: pasted literally they are invisible, and an empty
# string would make every assertion below pass against a zero.
G1, G2, G3 = "", "", ""


def test_widest_line_is_the_sum_of_advances_of_its_widest_line():
    """One line of two glyphs at 1000 and 500 units on a 2500 upm font is
    0.6 em; a second line of one 2000-unit glyph is 0.8 em and wins."""
    advances = {"g1": 1000, "g2": 500, "g3": 2000}
    lines = {1: [G1, G2], 2: [G3]}
    cmap = {0xE000: "g1", 0xE001: "g2", 0xE002: "g3"}
    assert widest_line_em(lines, cmap, advances, upm=2500) == 0.8


def test_a_glyph_missing_from_the_cmap_is_not_silently_zero():
    """A missing glyph would otherwise make a line look narrow, which scales
    that page's text UP and overflows it -- the loud failure is the point."""
    import pytest

    with pytest.raises(KeyError):
        widest_line_em({1: [G1]}, {}, {}, upm=2500)


def test_the_separator_space_costs_nothing_and_does_not_raise():
    """198 layout rows split a word's two glyph codes with a space, and these
    fonts have no space glyph. Charging it a width would shrink those pages;
    raising on it would refuse to measure 197 of the 604."""
    advances = {"g1": 1000, "g2": 500}
    cmap = {0xE000: "g1", 0xE001: "g2"}
    assert widest_line_em({1: [f"{G1} {G2}"]}, cmap, advances, upm=2500) == 0.6
