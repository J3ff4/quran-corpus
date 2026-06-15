"""Tests for scraper/sources/corpus_morphology.py."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from scraper.sources.corpus_morphology import (
    ParsedCorpusWord,
    parse_corpus_morphology,
)

FIXTURE = Path(__file__).parent / "fixtures" / "corpus_morphology_sample.txt"


@pytest.fixture(scope="module")
def words() -> list[ParsedCorpusWord]:
    return list(parse_corpus_morphology(FIXTURE))


def test_word_count(words: list[ParsedCorpusWord]) -> None:
    """4 distinct words: 1:1:1, 1:1:2, 1:1:3, 1:2:1."""
    assert len(words) == 4


def test_locations_in_order(words: list[ParsedCorpusWord]) -> None:
    locs = [(w.surah, w.ayah, w.position) for w in words]
    assert locs == [(1, 1, 1), (1, 1, 2), (1, 1, 3), (1, 2, 1)]


def test_two_segments_merge_into_one_word(words: list[ParsedCorpusWord]) -> None:
    """1:1:1 is prefix 'bi' + stem 'somi' -> one word, two POS tags."""
    w = words[0]
    assert w.pos_tags == ["P", "N"]
    assert w.pos_tag == "P"


def test_root_from_stem_segment_buckwalter(words: list[ParsedCorpusWord]) -> None:
    """Root comes from the stem segment, not the prefix."""
    assert words[0].root_buckwalter == "smw"


def test_root_converted_to_arabic(words: list[ParsedCorpusWord]) -> None:
    assert words[0].root == "سمو"


def test_lemma_buckwalter_and_arabic(words: list[ParsedCorpusWord]) -> None:
    w = words[0]
    assert w.lemma_buckwalter == "{som"
    assert w.lemma == "ٱسْم"


def test_rahman_root(words: list[ParsedCorpusWord]) -> None:
    """1:1:3 (ar-rahman): DET prefix + ADJ stem, root rHm."""
    w = words[2]
    assert w.pos_tags == ["DET", "ADJ"]
    assert w.root_buckwalter == "rHm"
    assert w.root == "رحم"


def test_hamd_root(words: list[ParsedCorpusWord]) -> None:
    """1:2:1 (al-hamdu): root Hmd."""
    w = words[3]
    assert w.root == "حمد"
    assert w.pos_tag == "DET"


def test_morphology_json_is_valid_array(words: list[ParsedCorpusWord]) -> None:
    for w in words:
        codes = json.loads(w.morphology_json)  # type: ignore[arg-type]
        assert codes == w.pos_tags


def test_word_with_no_root_has_none(tmp_path: Path) -> None:
    """A word whose segments carry no ROOT yields None root, not empty string."""
    f = tmp_path / "m.txt"
    f.write_text(
        "LOCATION\tFORM\tTAG\tFEATURES\n(2:1:1:1)\t>alif\tINL\tSTEM|POS:INL\n",
        encoding="utf-8",
    )
    out = list(parse_corpus_morphology(f))
    assert len(out) == 1
    assert out[0].root is None
    assert out[0].root_buckwalter is None
    assert out[0].pos_tag == "INL"


def test_empty_file(tmp_path: Path) -> None:
    f = tmp_path / "empty.txt"
    f.write_text("# only comments\n", encoding="utf-8")
    assert list(parse_corpus_morphology(f)) == []
