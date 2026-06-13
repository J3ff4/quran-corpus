import pytest
from pydantic import ValidationError

from scraper.models import AyahModel, SurahModel, TranslationModel, WordModel


def test_surah_model_valid():
    s = SurahModel(
        id=1,
        name_arabic="الفاتحة",
        name_translit="Al-Fatihah",
        name_translation="The Opening",
        revelation_type="meccan",
        ayah_count=7,
        order_number=1,
    )
    assert s.revelation_type == "meccan"
    assert s.ayah_count == 7


def test_surah_model_rejects_invalid_revelation_type():
    with pytest.raises(ValidationError):
        SurahModel(
            id=1,
            name_arabic="x",
            name_translit="x",
            name_translation="x",
            revelation_type="unknown",
            ayah_count=1,
            order_number=1,
        )


def test_word_model_nullable_fields_default_to_none():
    w = WordModel(id=1, ayah_id=1, position=1, text_arabic="بِسْمِ")
    assert w.root is None
    assert w.pos_tag is None
    assert w.morphology_json is None


def test_translation_model_valid():
    t = TranslationModel(
        id=1,
        ayah_id=1,
        language_code="en",
        translator="Sahih International",
        text="In the name of Allah",
    )
    assert t.language_code == "en"
