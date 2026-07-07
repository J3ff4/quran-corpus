from __future__ import annotations

from pathlib import Path

import pytest

from scraper.sources.corpus_dictionary import ParsedRoot, parse_root_page

FIX = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="module")
def ktb() -> ParsedRoot:
    html = (FIX / "corpus_dict_ktb.html").read_text(encoding="utf-8")
    parsed = parse_root_page(html)
    assert parsed is not None
    return parsed


def test_root_arabic(ktb: ParsedRoot) -> None:
    assert ktb.root_arabic.replace(" ", "") == "كتب"


def test_total_occurrence(ktb: ParsedRoot) -> None:
    assert ktb.occurrence_count == 319


def test_has_forms(ktb: ParsedRoot) -> None:
    assert len(ktb.forms) >= 5


def test_noun_form_count(ktb: ParsedRoot) -> None:
    noun = next(
        f
        for f in ktb.forms
        if f.pos_label == "Noun" and (f.form_translit or "").startswith("kit")
    )
    assert noun.occurrence_count == 260


def test_form_i_verb_count(ktb: ParsedRoot) -> None:
    verb = next(f for f in ktb.forms if f.form_translit == "kataba")
    assert verb.occurrence_count == 49
    assert verb.pos_label == "Form I verb"


def test_once_parses_to_one(ktb: ParsedRoot) -> None:
    once = next(f for f in ktb.forms if f.form_translit == "kātibu")
    assert once.occurrence_count == 1


def test_forms_sorted(ktb: ParsedRoot) -> None:
    assert [f.sort_order for f in ktb.forms] == list(range(len(ktb.forms)))


def test_lane_link(ktb: ParsedRoot) -> None:
    assert ktb.lane_url is None or "lexicon" in ktb.lane_url.lower()


def test_non_root_page_returns_none() -> None:
    assert parse_root_page("<html><body>404</body></html>") is None


# Low-frequency roots spell the total as a number-word ("occurs three times",
# "occurs once") instead of digits — these must still parse (regression: the
# digit-only total regex silently dropped ~1000 roots).
_WORD_TOTAL_HTML = (
    '<html><body>The triliteral root shīn hamza mīm '
    '(<span class="at">ش أ م</span>) occurs three times in the Quran as the noun '
    '<i class="ab">mashamat</i> (<span class="at">مَشْـَٔمَة</span>).'
    '<ul class="also"><li>three times as the noun '
    '<i class="ab">mashamat</i> (<span class="at">مَشْـَٔمَة</span>)</li></ul>'
    "</body></html>"
)


def test_word_number_total_parses() -> None:
    parsed = parse_root_page(_WORD_TOTAL_HTML)
    assert parsed is not None
    assert parsed.occurrence_count == 3
    assert len(parsed.forms) == 1


def test_occurs_once_parses() -> None:
    html = _WORD_TOTAL_HTML.replace("occurs three times", "occurs once")
    parsed = parse_root_page(html)
    assert parsed is not None
    assert parsed.occurrence_count == 1


def test_thousands_comma_total_parses() -> None:
    html = _WORD_TOTAL_HTML.replace("occurs three times", "occurs 1,722 times")
    parsed = parse_root_page(html)
    assert parsed is not None
    assert parsed.occurrence_count == 1722


def test_occurs_only_once_parses() -> None:
    # Hapax roots read "occurs only once in the Quran" — the "only" must not
    # break total detection (regression: dropped ~395 roots).
    html = _WORD_TOTAL_HTML.replace("occurs three times", "occurs only once")
    parsed = parse_root_page(html)
    assert parsed is not None
    assert parsed.occurrence_count == 1


# A root with NO derived forms: its only <ul class="also"> is the See-Also box.
# Its <li> (a Lane's Lexicon link, no <span class="at">) must NOT become a form.
_SEE_ALSO_ONLY_HTML = (
    '<html><body>The triliteral root hamza bā dāl '
    '(<span class="at">أ ب د</span>) occurs 28 times in the Quran.'
    '<h4>See Also</h4><ul class="also"><li>'
    '<a href="https://lexicon.quranic-research.net/">Lane\'s Lexicon</a>'
    " - Classical Arabic dictionary</li></ul>"
    "</body></html>"
)


def test_see_also_only_page_has_no_forms() -> None:
    parsed = parse_root_page(_SEE_ALSO_ONLY_HTML)
    assert parsed is not None
    assert parsed.occurrence_count == 28
    assert parsed.forms == []
