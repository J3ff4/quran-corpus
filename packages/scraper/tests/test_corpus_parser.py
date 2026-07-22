"""Tests for scraper/sources/corpus_parser.py.

Uses the real HTML fixture at tests/fixtures/corpus_1_1.html which contains
20 words from Al-Fatiha verses 1:1 through 1:6. Verse 1:7 is on a separate
page, linked by the navigation pane.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from scraper.sources.corpus_parser import (
    ParsedWord,
    parse_next_verse_url,
    parse_verse_words,
)

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="module")
def fixture_html() -> str:
    return (FIXTURES_DIR / "corpus_1_1.html").read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def parsed_words(fixture_html: str) -> list[ParsedWord]:
    return parse_verse_words(fixture_html)


# ---------------------------------------------------------------------------
# Basic count / structure
# ---------------------------------------------------------------------------


def test_total_word_count(parsed_words: list[ParsedWord]) -> None:
    """Fixture contains exactly 20 words (verses 1:1 through 1:6)."""
    assert len(parsed_words) == 20


def test_verse_1_has_four_words(parsed_words: list[ParsedWord]) -> None:
    """Al-Fatiha verse 1 (Basmala) has 4 words."""
    verse1_words = [w for w in parsed_words if w.verse_number == 1]
    assert len(verse1_words) == 4


def test_positions_sequential_verse_1(parsed_words: list[ParsedWord]) -> None:
    """Verse 1 word positions are 1, 2, 3, 4 in order."""
    verse1_positions = [w.position for w in parsed_words if w.verse_number == 1]
    assert verse1_positions == [1, 2, 3, 4]


def test_all_verses_present(parsed_words: list[ParsedWord]) -> None:
    """Verses 1 through 6 are all represented in the fixture."""
    verse_numbers = {w.verse_number for w in parsed_words}
    assert verse_numbers == {1, 2, 3, 4, 5, 6}


# ---------------------------------------------------------------------------
# First word (1:1:1) — transliteration via <a> tag
# ---------------------------------------------------------------------------


def test_first_word_verse_and_position(parsed_words: list[ParsedWord]) -> None:
    first = parsed_words[0]
    assert first.verse_number == 1
    assert first.position == 1


def test_first_word_transliteration(parsed_words: list[ParsedWord]) -> None:
    """Word 1:1:1 transliteration comes from the <a> element."""
    assert parsed_words[0].transliteration == "bis'mi"


def test_first_word_gloss(parsed_words: list[ParsedWord]) -> None:
    """Word 1:1:1 English gloss is the bare text node after the <br/>."""
    assert parsed_words[0].english_gloss == "In (the) name"


def test_first_word_pos_tag(parsed_words: list[ParsedWord]) -> None:
    """Word 1:1:1 has POS tag 'P' (prefixed preposition, first <b> in col3)."""
    assert parsed_words[0].pos_tag == "P"


# ---------------------------------------------------------------------------
# Morphology JSON
# ---------------------------------------------------------------------------


def test_morphology_json_valid(parsed_words: list[ParsedWord]) -> None:
    """All non-None morphology_json values are valid JSON arrays of strings."""
    for word in parsed_words:
        if word.morphology_json is not None:
            codes = json.loads(word.morphology_json)
            assert isinstance(codes, list)
            assert all(isinstance(c, str) for c in codes)


def test_first_word_morphology_json(parsed_words: list[ParsedWord]) -> None:
    """Word 1:1:1 has two POS codes: P (preposition prefix) and N (noun)."""
    codes = json.loads(parsed_words[0].morphology_json)  # type: ignore[arg-type]
    assert codes == ["P", "N"]


def test_pos_tag_is_first_morphology_code(parsed_words: list[ParsedWord]) -> None:
    """pos_tag must always equal the first element of morphology_json."""
    for word in parsed_words:
        if word.morphology_json is not None:
            codes = json.loads(word.morphology_json)
            assert word.pos_tag == codes[0]


# ---------------------------------------------------------------------------
# Phonetic span — verse 5 pronouns (no <a> tag, only <span class="phonetic">)
# ---------------------------------------------------------------------------


def test_phonetic_span_verse_5_word_1(parsed_words: list[ParsedWord]) -> None:
    """Word 1:5:1 uses <span class='phonetic'> instead of <a> for transliteration."""
    word = next(w for w in parsed_words if w.verse_number == 5 and w.position == 1)
    assert word.transliteration == "iyyāka"


def test_phonetic_span_verse_5_word_3(parsed_words: list[ParsedWord]) -> None:
    """Word 1:5:3 also uses <span class='phonetic'> (wa-iyyāka)."""
    word = next(w for w in parsed_words if w.verse_number == 5 and w.position == 3)
    assert word.transliteration == "wa-iyyāka"


def test_phonetic_gloss_verse_5_word_1(parsed_words: list[ParsedWord]) -> None:
    """Word 1:5:1 English gloss is correctly extracted despite phonetic span."""
    word = next(w for w in parsed_words if w.verse_number == 5 and w.position == 1)
    assert word.english_gloss == "You Alone"


# ---------------------------------------------------------------------------
# Specific POS tag spot-checks
# ---------------------------------------------------------------------------


def test_verse_2_word_1_pos_tag(parsed_words: list[ParsedWord]) -> None:
    """Word 1:2:1 (al-ḥamdu) is a noun — pos_tag should be 'N'."""
    word = next(w for w in parsed_words if w.verse_number == 2 and w.position == 1)
    assert word.pos_tag == "N"


def test_verse_5_word_2_pos_tag(parsed_words: list[ParsedWord]) -> None:
    """Word 1:5:2 (naʿbudu) is a verb — pos_tag should be 'V'."""
    word = next(w for w in parsed_words if w.verse_number == 5 and w.position == 2)
    assert word.pos_tag == "V"


def test_verse_6_word_1_has_three_pos_codes(parsed_words: list[ParsedWord]) -> None:
    """Word 1:6:1 (ih'dinā) has three POS codes: V, PRON, PRON."""
    word = next(w for w in parsed_words if w.verse_number == 6 and w.position == 1)
    codes = json.loads(word.morphology_json)  # type: ignore[arg-type]
    assert codes == ["V", "PRON", "PRON"]


# ---------------------------------------------------------------------------
# Arabic grammar note (arabicGrammar div)
# ---------------------------------------------------------------------------


def test_first_word_grammar_note(parsed_words: list[ParsedWord]) -> None:
    """Word 1:1:1 (bismi) grammar note is the single compact relation term."""
    assert parsed_words[0].grammar_note == "جار ومجرور"


def test_word_1_1_2_grammar_note(parsed_words: list[ParsedWord]) -> None:
    """Word 1:1:2 (Allah, genitive) grammar note names the proper-noun rule."""
    word = next(w for w in parsed_words if w.verse_number == 1 and w.position == 2)
    assert word.grammar_note == "لفظ الجلالة مجرور"


def test_multiline_grammar_note_splits_on_br(parsed_words: list[ParsedWord]) -> None:
    """Word 1:5:3 (wa-iyyaka) has two <br/>-separated clauses in the source div;
    they must be joined with '\\n', not collapsed into one line."""
    word = next(w for w in parsed_words if w.verse_number == 5 and w.position == 3)
    assert word.grammar_note == "الواو عاطفة\nضمير منفصل"


def test_grammar_note_absent_when_no_div() -> None:
    """A col3 cell with no arabicGrammar div yields grammar_note=None."""
    html = """
    <table class="morphologyTable">
      <tr><th>h</th></tr>
      <tr>
        <td><span class="location">(1:1:1)</span><a>bismi</a><br/>gloss</td>
        <td>arabic</td>
        <td><b>P</b> – prefixed preposition</td>
      </tr>
    </table>
    """
    words = parse_verse_words(html)
    assert len(words) == 1
    assert words[0].grammar_note is None


# ---------------------------------------------------------------------------
# Pagination — parse_next_verse_url
# ---------------------------------------------------------------------------


def test_parse_next_verse_url(fixture_html: str) -> None:
    """Navigation pane links to ?chapter=1&verse=7, so next verse is 7."""
    assert parse_next_verse_url(fixture_html, 1, 1) == 7


def test_parse_next_verse_url_no_nav() -> None:
    """HTML with no navigationPane div returns None."""
    assert parse_next_verse_url("<html><body></body></html>", 1, 1) is None


def test_parse_next_verse_url_last_page() -> None:
    """navigationPane with no verse= links (e.g. last page) returns None."""
    html = '<div class="navigationPane">Verse <b>7-7</b></div>'
    assert parse_next_verse_url(html, 1, 7) is None


def test_parse_next_verse_url_ignores_backward_link() -> None:
    """On the last page the first link points backward; must not be followed.

    Regression: corpus.quran.com's last-page nav lists the 'previous' link
    first (e.g. back to verse 1) plus a next-chapter link. Returning the first
    verse= link caused an infinite 7 -> 1 -> 7 loop.
    """
    html = (
        '<div class="navigationPane">'
        '<a href="?chapter=1&verse=1">prev</a>'
        '<a href="?chapter=1&verse=1">prev</a>'
        '<a href="?chapter=2&verse=1">next chapter</a>'
        "</div>"
    )
    assert parse_next_verse_url(html, 1, 7) is None


def test_parse_next_verse_url_picks_forward_same_chapter() -> None:
    """With both backward and forward same-chapter links, return the forward one."""
    html = (
        '<div class="navigationPane">'
        '<a href="?chapter=2&verse=1">prev</a>'
        '<a href="?chapter=2&verse=6">next</a>'
        '<a href="?chapter=3&verse=1">next chapter</a>'
        "</div>"
    )
    assert parse_next_verse_url(html, 2, 5) == 6


# ---------------------------------------------------------------------------
# Edge cases — empty / malformed HTML
# ---------------------------------------------------------------------------


def test_empty_html_returns_empty() -> None:
    assert parse_verse_words("") == []


def test_no_morphology_table_returns_empty() -> None:
    assert parse_verse_words("<html><body><p>No table here</p></body></html>") == []


def test_empty_html_next_url_returns_none() -> None:
    assert parse_next_verse_url("", 1, 1) is None
