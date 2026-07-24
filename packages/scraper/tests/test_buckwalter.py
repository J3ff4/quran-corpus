"""Tests for scraper/buckwalter.py."""

from __future__ import annotations

import unicodedata

from scraper.buckwalter import buckwalter_to_arabic


def test_none_returns_none() -> None:
    assert buckwalter_to_arabic(None) is None


def test_empty_string() -> None:
    assert buckwalter_to_arabic("") == ""


def test_root_smw() -> None:
    """Root of ism/Allah's-name 'smw' -> Arabic letters seen-meem-waw."""
    assert buckwalter_to_arabic("smw") == "سمو"


def test_root_hmd_hamd() -> None:
    """Root of al-hamdu 'Hmd' -> hah-meem-dal."""
    assert buckwalter_to_arabic("Hmd") == "حمد"


def test_root_rhm_rahman() -> None:
    """Root of ar-rahman 'rHm' -> reh-hah-meem."""
    assert buckwalter_to_arabic("rHm") == "رحم"


def test_lemma_with_alef_wasla() -> None:
    """'{som' uses alef-wasla ({) + seen + sukun (o) + meem."""
    assert buckwalter_to_arabic("{som") == "ٱسْم"


def test_hamza_forms() -> None:
    assert buckwalter_to_arabic(">") == "أ"
    assert buckwalter_to_arabic("<") == "إ"
    assert buckwalter_to_arabic("'") == "ء"
    assert buckwalter_to_arabic("}") == "ئ"


def test_tatweel_seats_a_seatless_hamza() -> None:
    """'_' is tatweel, the seat a free-standing hamza (here '#') sits on --
    regression: this fell through to passthrough and left a literal ASCII
    underscore in rendered Arabic (e.g. corpus 'ya_#uwdu').

    Expected is written as NFD (fully decomposed) and compared via NFC on
    both sides -- the combining marks' canonical order after NFC-normalizing
    the real output doesn't match simple concatenation order, but canonical
    ordering is defined to render identically regardless of sequence, so
    comparing under one consistent normalization is the correct assertion,
    not the literal char-by-char concatenation order."""
    tatweel = "ـ"
    hamza_above = "ٔ"
    fatha = "َ"
    dagger_alef = "ٰ"
    noon = "ن"
    expected = tatweel + hamza_above + fatha + dagger_alef + noon
    out = buckwalter_to_arabic("_#a`n")
    assert out is not None
    assert unicodedata.normalize("NFC", out) == unicodedata.normalize("NFC", expected)
    assert "_" not in out


def test_alef_madda_composes_regardless_of_source_spelling() -> None:
    """Corpus lemma text sometimes spells alef-madda as 'A' + '^' (base alef
    + combining maddah) rather than the single '|' token. Char-by-char
    mapping alone leaves the two spellings as different Unicode sequences
    (decomposed vs precomposed) even though they render identically --
    NFC-normalizing the output composes both to the same precomposed
    U+0622, matching root_forms.form_arabic's representation so
    word_segments.lemma stays joinable by exact string equality."""
    decomposed = buckwalter_to_arabic("A^")
    single_token = buckwalter_to_arabic("|")
    assert decomposed == single_token == "آ"
    assert decomposed is not None
    assert len(decomposed) == 1


def test_unknown_char_passthrough() -> None:
    """An unmapped character is preserved rather than dropped."""
    assert buckwalter_to_arabic("smw9") == "سمو9"


def test_roundtrip_known_letters_are_arabic() -> None:
    """Every output char for a known root is non-ASCII Arabic."""
    out = buckwalter_to_arabic("ktb")
    assert out is not None
    assert all(ord(c) > 0x600 for c in out)
