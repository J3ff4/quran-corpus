"""Importer for Tarteel AI's Quranic Universal Library (QUL) "simple" translation format.

Format is a dict keyed by "surah:ayah", e.g.:
  {"1:1": {"t": "..."}, "1:2": {"t": "...", "f": {...}}, ...}

Pass language_code and translator as CLI arguments.
"""

import json
from pathlib import Path

from ..db import ScraperDatabase
from ..models import TranslationModel


def import_qul_translation(
    json_path: Path, language_code: str, translator: str, db: ScraperDatabase
) -> None:
    """Parse a QUL "simple" JSON translation file and upsert into translations table."""
    verses: dict[str, dict] = json.loads(json_path.read_text(encoding="utf-8"))

    ayah_map: dict[tuple[int, int], int] = {
        (int(r["surah_id"]), int(r["ayah_number"])): int(r["id"])
        for r in db.get_all_ayahs()
    }

    for key, verse in verses.items():
        surah_str, ayah_str = key.split(":")
        surah_id, ayah_number = int(surah_str), int(ayah_str)
        text = verse["t"]
        if not isinstance(text, str):
            continue  # skip chunked/footnoted entries; simple format is plain text
        ayah_id = ayah_map.get((surah_id, ayah_number))
        if ayah_id is None:
            continue
        translation = TranslationModel(
            ayah_id=ayah_id,
            language_code=language_code,
            translator=translator,
            text=text,
        )
        db.upsert_translation(translation)
