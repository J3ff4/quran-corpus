import pytest

from scraper.qul_ru_import import (
    AlignError,
    Row,
    align_ayah,
    clean_ru_gloss,
    parse_cards,
    same_word,
    validate_ru_gloss,
)
from scraper.tasnim_align import base_form


def _page(*cards: tuple[str, str]) -> str:
    return "".join(
        f'<div class="qpc-hafs text-3xl" dir="rtl">{ar}</div>\n'
        f'  <div class="text-sm text-gray-600 russian">{ru}</div>'
        for ar, ru in cards
    )


def test_parse_cards_strips_markup_entities_and_html_whitespace():
    page = _page(("<span>بِسْمِ</span>", "<b>во</b>\n  имя &amp; слово"), ("ٱللَّهِ", "тест"))
    assert parse_cards(page) == [("بِسْمِ", "во имя & слово"), ("ٱللَّهِ", "тест")]


def test_same_word_accepts_qul_doubled_kaanna_only():
    assert same_word(base_form("كَأَنأَن"), base_form("كَأَن"))
    assert same_word("كتب", "كتب")
    assert not same_word("كتاب", "كتب")
    assert not same_word("كانا", "كان")  # tail is not ours' suffix


def test_align_one_to_one():
    assert align_ayah([("بِسْمِ", "а"), ("ٱللَّهِ", "б")], [(1, "بِسْمِ"), (2, "ٱللَّهِ")]) == [
        Row(1, "а", 1),
        Row(2, "б", 2),
    ]


def test_word_without_a_card_joins_the_previous_card():
    assert align_ayah([("مِن", "из того, что до")], [(7, "مِن"), (8, "قَبْلِكَ")]) == [
        Row(7, "из того, что до", 7),
        Row(8, "из того, что до", 7),
    ]


def test_first_word_without_a_card_aborts():
    with pytest.raises(AlignError, match="word 1"):
        align_ayah([("ٱللَّهِ", "б")], [(1, "بِسْمِ"), (2, "ٱللَّهِ")])


def test_leftover_card_aborts():
    with pytest.raises(AlignError, match="1 cards unused"):
        align_ayah([("بِسْمِ", "а"), ("ٱللَّهِ", "б")], [(1, "بِسْمِ")])


@pytest.mark.parametrize(
    "raw, want",
    [
        ("слово,", "слово"),
        ("слово.", "слово"),
        ("слово:", "слово"),
        ("слово;", "слово"),
        ("слово –", "слово"),
        ("слово —", "слово"),
        ("слово, –", "слово"),
        ("[слово] –", "[слово]"),
        ("слово!", "слово!"),
        ("слово?", "слово?"),
        ("«слово!».", "«слово!»"),
        ("(досл. слово)", "(досл. слово)"),
        ("Слово – другое", "Слово – другое"),
        ("Cлово", "Слово"),
        ("c другим", "с другим"),
        ("A", "А"),
        ("Kлятва", "Клятва"),
        ("(некое) слово/", "(некое) слово"),
        ("/Нет", "Нет"),
    ],
)
def test_clean_ru_gloss(raw, want):
    assert clean_ru_gloss(raw) == want


def test_homoglyph_fix_skipped_when_a_real_latin_letter_is_present():
    assert clean_ru_gloss("Cлово Q") == "Cлово Q"  # left for validate to refuse
    assert validate_ru_gloss("Cлово Q") == "latin character 'C'"


@pytest.mark.parametrize(
    "text, reason",
    [
        ("", "empty"),
        ("я" * 121, "too long (121 > 120)"),
        ("слово ب", "arabic character 'ب'"),
        ("слово\x07", "control character"),
    ],
)
def test_validate_ru_gloss_refuses(text, reason):
    assert validate_ru_gloss(text) == reason


def test_validate_rejects_a_gloss_cleaned_to_empty():
    for raw in ("–", ",", "/", ", –"):
        assert validate_ru_gloss(clean_ru_gloss(raw)) == "empty"


def test_validate_accepts_kept_punctuation():
    assert validate_ru_gloss("«(досл. слово) [другое]!»") is None
