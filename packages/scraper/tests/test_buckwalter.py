"""Tests for scraper/buckwalter.py."""

from __future__ import annotations

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
    underscore in rendered Arabic (e.g. corpus 'ya_#uwdu')."""
    tatweel = "ـ"
    hamza_above = "ٔ"
    fatha = "َ"
    dagger_alef = "ٰ"
    noon = "ن"
    expected = tatweel + hamza_above + fatha + dagger_alef + noon
    out = buckwalter_to_arabic("_#a`n")
    assert out == expected
    assert "_" not in out


def test_unknown_char_passthrough() -> None:
    """An unmapped character is preserved rather than dropped."""
    assert buckwalter_to_arabic("smw9") == "سمو9"


def test_roundtrip_known_letters_are_arabic() -> None:
    """Every output char for a known root is non-ASCII Arabic."""
    out = buckwalter_to_arabic("ktb")
    assert out is not None
    assert all(ord(c) > 0x600 for c in out)
