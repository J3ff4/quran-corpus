from __future__ import annotations

import unicodedata
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
    # Compact is canonical: corpus renders the header as "ك ت ب" but roots
    # carry NO inter-letter whitespace in the DB.
    assert ktb.root_arabic == "كتب"


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


# Corpus omits <ul class="also"> when a root has exactly ONE derived form and
# states it inline instead. 712 roots (43.4%) hit this. Real sentences, 2026-07-27.
_ONE_FORM_ONCE_HTML = (
    '<html><body>The triliteral root shīn ʿayn lām '
    '(<span class="at">ش ع ل</span>) occurs only once in the Quran, as the '
    'form VIII verb <i class="ab">ish\'taʿala</i> '
    '(<span class="at">ٱشْتَعَلَ</span>).</body></html>'
)
_ONE_FORM_MANY_HTML = (
    '<html><body>The triliteral root hamza rā ḍād '
    '(<span class="at">أ ر ض</span>) occurs 461 times in the Quran as the '
    'noun <i class="ab">arḍ</i> (<span class="at">أَرْض</span>).</body></html>'
)


def test_single_form_root_once_is_parsed() -> None:
    parsed = parse_root_page(_ONE_FORM_ONCE_HTML)
    assert parsed is not None
    assert parsed.occurrence_count == 1
    assert len(parsed.forms) == 1
    f = parsed.forms[0]
    assert f.sort_order == 0
    assert f.pos_label == "Form VIII verb"
    assert f.form_translit == "ish'taʿala"
    assert f.form_arabic == "ٱشْتَعَلَ"
    # Only form, so it accounts for every occurrence of the root.
    assert f.occurrence_count == 1


def test_single_form_root_high_frequency_is_parsed() -> None:
    # Trigger is ONE form, not low frequency -- this root occurs 461 times.
    parsed = parse_root_page(_ONE_FORM_MANY_HTML)
    assert parsed is not None
    assert len(parsed.forms) == 1
    assert parsed.forms[0].pos_label == "Noun"
    assert parsed.forms[0].form_translit == "arḍ"
    assert parsed.forms[0].occurrence_count == 461


# A multi-word translit must stay whole. Reading it out of flattened text with
# a \S+ match kept only the last token and glued the rest onto the POS label
# ("Proper noun banī" / "isrāīl").
_MULTI_WORD_TRANSLIT_HTML = (
    '<html><body>The triliteral root bā nūn yā '
    '(<span class="at">ب ن ي</span>) occurs 5 times in the Quran as the '
    'proper noun <i class="ab">banī isrāīl</i> '
    '(<span class="at">بَنِىٓ إِسْرَٰٓءِيل</span>).</body></html>'
)


def test_single_form_multi_word_translit_stays_whole() -> None:
    parsed = parse_root_page(_MULTI_WORD_TRANSLIT_HTML)
    assert parsed is not None
    assert len(parsed.forms) == 1
    f = parsed.forms[0]
    assert f.form_translit == "banī isrāīl"
    assert f.pos_label == "Proper noun"
    assert f.form_arabic == "بَنِىٓ إِسْرَٰٓءِيل"


# The inline sentence names no Arabic, so there is no form to record. Matching
# forward through flattened text used to fabricate one from the next
# parenthesis anywhere on the page ("Lane Lexicon (page 42)").
_NO_ARABIC_INLINE_HTML = (
    '<html><body><p>The triliteral root kāf tā bā '
    '(<span class="at">ك ت ب</span>) occurs 319 times in the Quran, as the '
    "noun kitab.</p>"
    '<p>See Also: <i class="ab">Lane Lexicon</i> (page 42).</p>'
    "</body></html>"
)


def test_single_form_without_arabic_fabricates_nothing() -> None:
    parsed = parse_root_page(_NO_ARABIC_INLINE_HTML)
    assert parsed is not None
    assert parsed.occurrence_count == 319
    assert parsed.forms == []


# Root nwn: the form's translit ("nūn") also occurs inside the root header
# ("nūn wāw nūn"). Deriving the lead text by splitting the sentence on the
# translit cuts at the header and drops the whole "as the noun" clause.
_TRANSLIT_REPEATS_IN_HEADER_HTML = (
    '<html><body><p>The triliteral root nūn wāw nūn '
    '(<span class="at">ن و ن</span>) occurs only once in the Quran, as the '
    'noun <i class="ab">nūn</i> (<span class="at">نُّون</span>).</p>'
    "</body></html>"
)


def test_single_form_translit_repeated_in_header_still_parses() -> None:
    parsed = parse_root_page(_TRANSLIT_REPEATS_IN_HEADER_HTML)
    assert parsed is not None
    assert len(parsed.forms) == 1
    assert parsed.forms[0].pos_label == "Noun"
    assert parsed.forms[0].form_translit == "nūn"
    assert parsed.forms[0].form_arabic == "نُّون"


def test_multi_form_page_ignores_the_prose_fallback(ktb: ParsedRoot) -> None:
    # The fallback must never fire when the list parsed; guards against a
    # stray sentence match overwriting real per-form counts.
    # ktb: 319 occurrences across 7 forms counting [49,1,1,260,1,6,1] --
    # none equals the total, so a fallback form would stand out immediately.
    assert len(ktb.forms) == 7
    assert all(f.occurrence_count != ktb.occurrence_count for f in ktb.forms)


# The root header is HTML, so the separator between letters may be any
# whitespace -- a plain space, a newline, or a non-breaking space. All of it
# must go; `get_text(strip=True)` only trims the ends.
def test_root_arabic_strips_every_whitespace_form() -> None:
    html = _WORD_TOTAL_HTML.replace(
        '<span class="at">ش أ م</span>', '<span class="at">ش\nط\u00a0ن</span>'
    )
    parsed = parse_root_page(html)
    assert parsed is not None
    assert parsed.root_arabic == "شطن"


def test_root_arabic_keeps_corpus_hamza() -> None:
    # Whitespace-only normalization: corpus's hamza spelling is the correct
    # orthography and must survive (>rD -> أرض, never ارض).
    parsed = parse_root_page(_ONE_FORM_MANY_HTML)
    assert parsed is not None
    assert parsed.root_arabic == "أرض"


def test_form_arabic_is_nfc_normalized() -> None:
    """The page writes a shadda ahead of the vowel it shares a letter with;
    NFC orders them the other way (fatha is combining class 30, shadda 33).

    The morphology import on the other side of the derived-form filter's join
    already normalizes (buckwalter.py, PR #50), so an un-normalized form here
    renders identically to its lemma and compares unequal: root Hqq's
    حَآقَّة counted three occurrences and filtered to none.
    """
    scraped = "حَآقَّة"  # shadda before fatha
    html = (
        "<p>The triliteral root <i class='ab'>ha qaf qaf</i> "
        "(<span class='at'>ح ق ق</span>) occurs 287 times in the Quran, "
        "in seven derived forms:</p>"
        "<ul class='also'><li>3 times as the noun "
        f"<i class='ab'>haqqat</i> (<span class='at'>{scraped}</span>)</li></ul>"
    )
    parsed = parse_root_page(html)
    assert parsed is not None
    form = parsed.forms[0].form_arabic
    assert form is not None
    assert form == unicodedata.normalize("NFC", scraped)
    assert form != scraped
