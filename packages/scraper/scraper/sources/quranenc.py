"""Importer for QuranEnc.com translations (JSON format).

Supports Uzbek, Russian, and other QuranEnc languages. Full implementation in Phase 2.
"""

from pathlib import Path

from ..db import ScraperDatabase


def import_quranenc_translation(
    json_path: Path, language_code: str, translator: str, db: ScraperDatabase
) -> None:
    """Parse a QuranEnc JSON export and upsert into translations table."""
    raise NotImplementedError("QuranEnc import implemented in Phase 2")
