from __future__ import annotations

from scraper.hamza_seat import fix_seatless_hamza

# Built from numeric codepoints, not hand-typed literals -- combining-mark
# order (tatweel, then hamza-above, then fatha) is easy to transpose by eye
# when typing Arabic diacritics directly in source.
_TATWEEL, _HAMZA_ABOVE, _FATHA = chr(0x0640), chr(0x0654), chr(0x064E)
_SEAT = _TATWEEL + _HAMZA_ABOVE


def test_28_alakhiri_gets_tatweel_seat() -> None:
    """Baqara 2:8 word 8 -- the bug word. Definite article + hamza-initial root."""
    given = "ٱلْءَاخِرِ"
    expected = "ٱلْ" + _SEAT + _FATHA + "اخِرِ"
    assert fix_seatless_hamza(given) == expected


def test_assimilated_lam_form_gets_tatweel_seat() -> None:
    """'لِّلْءَاكِلِينَ' -- assimilated lam (لِّ) still IS the definite article."""
    given = "لِّلْءَاكِلِينَ"
    expected = "لِّلْ" + _SEAT + _FATHA + "اكِلِينَ"
    assert fix_seatless_hamza(given) == expected


def test_la_prefix_assimilated_form_gets_tatweel_seat() -> None:
    """'وَلَلْءَاخِرَةُ' -- لَ prefix + assimilated ال, still the definite article."""
    given = "وَلَلْءَاخِرَةُ"
    expected = "وَلَلْ" + _SEAT + _FATHA + "اخِرَةُ"
    assert fix_seatless_hamza(given) == expected


def test_root_internal_lam_sukun_hamza_untouched() -> None:
    """3:91 'مِّلْءُ' (root م-ل-ء) -- hamza is the 3rd root letter, not a
    definite-article seatless-hamza. Must NOT be rewritten (verified against
    quran.com QPC Uthmani text: QPC keeps this as bare hamza too)."""
    assert fix_seatless_hamza("مِّلْءُ") == "مِّلْءُ"


def test_no_match_passthrough() -> None:
    assert fix_seatless_hamza("ءَامَنَّا") == "ءَامَنَّا"


def test_idempotent() -> None:
    once = fix_seatless_hamza("ٱلْءَاخِرِ")
    assert fix_seatless_hamza(once) == once


def test_empty_string() -> None:
    assert fix_seatless_hamza("") == ""
