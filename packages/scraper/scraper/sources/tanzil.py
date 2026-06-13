"""Importer for Tanzil.net Quran text and translations (XML format).

Download the dataset from tanzil.net once; do not re-scrape. Full implementation in Phase 2.
"""
from pathlib import Path

from ..db import ScraperDatabase


def import_tanzil_text(xml_path: Path, db: ScraperDatabase) -> None:
    """Parse Tanzil Uthmani XML and upsert into ayahs table."""
    raise NotImplementedError("Tanzil import implemented in Phase 2")
