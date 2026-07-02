from __future__ import annotations

from pathlib import Path

import pytest

from scraper.sources.corpus_word_detail import ParsedWordDetail, parse_word_detail

FIX = Path(__file__).parent / "fixtures"


@pytest.fixture(scope="module")
def w111() -> ParsedWordDetail:
    html = (FIX / "corpus_word_detail_1_1_1.html").read_text(encoding="utf-8")
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
