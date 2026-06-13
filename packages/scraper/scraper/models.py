from typing import Literal

from pydantic import BaseModel


class SurahModel(BaseModel):
    id: int
    name_arabic: str
    name_translit: str
    name_translation: str
    revelation_type: Literal["meccan", "medinan"]
    ayah_count: int
    order_number: int


class AyahModel(BaseModel):
    id: int | None = None
    surah_id: int
    ayah_number: int
    text_uthmani: str
    text_simple: str | None = None
    juz: int | None = None
    page: int | None = None
    audio_url: str | None = None


class WordModel(BaseModel):
    id: int | None = None
    ayah_id: int
    position: int
    text_arabic: str
    transliteration: str | None = None
    root: str | None = None
    lemma: str | None = None
    pos_tag: str | None = None
    morphology_json: str | None = None


class TranslationModel(BaseModel):
    id: int | None = None
    ayah_id: int
    language_code: str
    translator: str
    text: str


class WordGlossModel(BaseModel):
    id: int | None = None
    word_id: int
    language_code: str
    gloss_text: str


class LanguageModel(BaseModel):
    code: str
    name_native: str
    name_english: str
    direction: Literal["ltr", "rtl"]
