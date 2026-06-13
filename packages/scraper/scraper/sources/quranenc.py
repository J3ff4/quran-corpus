"""Importer for QuranEnc.com translations (flat JSON array format).

Download a translation JSON from QuranEnc.com. The format is:
  [{"sura": N, "aya": N, "text": "..."}, ...]

Pass language_code and translator as CLI arguments.
"""
import json
from pathlib import Path

from ..db import ScraperDatabase
from ..models import TranslationModel


def import_quranenc_translation(
    json_path: Path, language_code: str, translator: str, db: ScraperDatabase
) -> None:
    """Parse a QuranEnc JSON flat array and upsert into translations table."""
    verses: list[dict] = json.loads(json_path.read_text(encoding="utf-8"))

    # Build a lookup: (surah_id, ayah_number) -> ayah_id
    ayah_rows = db._conn.execute(
        "SELECT id, surah_id, ayah_number FROM ayahs"
    ).fetchall()
    ayah_map: dict[tuple[int, int], int] = {
        (int(r[1]), int(r[2])): int(r[0]) for r in ayah_rows
    }

    for verse in verses:
        surah_id = int(verse["sura"])
        ayah_number = int(verse["aya"])
        text = str(verse["text"])
        ayah_id = ayah_map.get((surah_id, ayah_number))
        if ayah_id is None:
            continue  # ayah not in DB yet; skip (run import-tanzil first)
        translation = TranslationModel(
            ayah_id=ayah_id,
            language_code=language_code,
            translator=translator,
            text=text,
        )
        db.upsert_translation(translation)
