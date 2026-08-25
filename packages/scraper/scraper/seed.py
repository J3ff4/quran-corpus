from .db import ScraperDatabase
from .models import LanguageModel
from .surah_meta import get_all_surahs

_LANGUAGES: list[LanguageModel] = [
    LanguageModel(
        code="ar", name_native="العربية", name_english="Arabic", direction="rtl"
    ),
    LanguageModel(
        code="en", name_native="English", name_english="English", direction="ltr"
    ),
    LanguageModel(
        code="uz", name_native="Oʻzbekcha", name_english="Uzbek", direction="ltr"
    ),
    LanguageModel(
        code="ru", name_native="Русский", name_english="Russian", direction="ltr"
    ),
]


def seed_database(db: ScraperDatabase) -> None:
    """Seed languages and surah metadata. Call before any import pipeline."""
    for lang in _LANGUAGES:
        db.upsert_language(lang)
    # Before the loop, not inside it: order_number is UNIQUE and this rewrites
    # all 114 ranks as a permutation of the ones already stored.
    db.park_surah_order()
    for surah in get_all_surahs():
        db.upsert_surah(surah)
