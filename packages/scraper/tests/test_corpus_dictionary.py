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
