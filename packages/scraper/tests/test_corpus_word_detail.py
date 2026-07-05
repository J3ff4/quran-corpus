from __future__ import annotations

from pathlib import Path

import pytest

from scraper.sources.corpus_word_detail import (
    ParsedWordDetail,
    parse_word_detail,
    trim_description,
)

FIX = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="module")
def w111() -> ParsedWordDetail:
    html = (FIX / "corpus_word_detail_1_1_1.html").read_text(encoding="utf-8")
    d = parse_word_detail(html)
    assert d is not None
    return d


@pytest.fixture(scope="module")
def w121() -> ParsedWordDetail:
    """Single-segment word (1:2:1 al-ḥamdu) — corpus omits the phrase
    "morphological segment" for these, so the old parser dropped every one."""
    html = (FIX / "corpus_word_detail_1_2_1.html").read_text(encoding="utf-8")
    d = parse_word_detail(html)
    assert d is not None
    return d


@pytest.fixture(scope="module")
def w211_inl() -> ParsedWordDetail:
    """Quranic initials (2:1:1 alif-lām-mīm, POS=INL) use a third phrasing —
    "Verse N of chapter M begins with the Quranic initials …" — with no
    "word of verse" anchor, so they need the dedicated INL anchor."""
    html = (FIX / "corpus_word_detail_2_1_1_inl.html").read_text(encoding="utf-8")
    d = parse_word_detail(html)
    assert d is not None
    return d


def test_description_verbatim(w111: ParsedWordDetail) -> None:
    assert "morphological segment" in w111.description
    assert len(w111.description) > 20


def test_description_mentions_segments(w111: ParsedWordDetail) -> None:
    assert "2 morphological segments" in w111.description


def test_grammar_arabic_present(w111: ParsedWordDetail) -> None:
    joined = " ".join(w111.grammar_arabic)
    assert "جار" in joined  # جار ومجرور


def test_concept_tags_is_list(w111: ParsedWordDetail) -> None:
    assert isinstance(w111.concept_tags, list)


def test_non_detail_page_returns_none() -> None:
    assert parse_word_detail("<html><body>x</body></html>") is None


def test_single_segment_word_is_parsed(w121: ParsedWordDetail) -> None:
    # The single-segment page has no "morphological segment" phrase; parse via
    # the "word of verse" anchor instead.
    assert "word of verse (1:2)" in w121.description
    assert "morphological segment" not in w121.description
    assert "مرفوع" in " ".join(w121.grammar_arabic)  # nominative case label


def test_quranic_initials_are_parsed(w211_inl: ParsedWordDetail) -> None:
    # muqaṭṭaʿāt page has neither "morphological segment" nor "word of verse".
    assert "begins with the Quranic initials" in w211_inl.description
    assert "Chapter (" not in w211_inl.description  # chrome trimmed


def test_description_is_trimmed_of_page_chrome(
    w111: ParsedWordDetail, w121: ParsedWordDetail
) -> None:
    # Both fixtures contain the trailing contextual block on-page; the parser
    # must cut it so only the grammar prose is stored.
    for d in (w111, w121):
        assert "Chapter (" not in d.description
        assert "Sahih International" not in d.description
        assert "Recitation" not in d.description


def test_trim_description_cuts_at_context_boundary() -> None:
    raw = "The first word of verse (1:2) is a noun. Chapter (1) sūrat l-fātiḥah ..."
    assert trim_description(raw) == "The first word of verse (1:2) is a noun."


def test_trim_description_noop_without_boundary() -> None:
    assert trim_description("  grammar prose only  ") == "grammar prose only"
