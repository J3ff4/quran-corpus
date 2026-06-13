"""Importer for Tanzil.net Quran text (Uthmani XML format).

Download the Uthmani XML from tanzil.net/trans/ once; do not re-scrape.
"""

from pathlib import Path

from defusedxml import ElementTree

from ..db import ScraperDatabase
from ..models import AyahModel


def import_tanzil_text(xml_path: Path, db: ScraperDatabase) -> None:
    """Parse Tanzil Uthmani XML and upsert into ayahs table (text_uthmani field)."""
    tree = ElementTree.parse(xml_path)
    root = tree.getroot()
    for sura in root.findall("sura"):
        surah_id = int(sura.attrib["index"])
        for aya in sura.findall("aya"):
            ayah_number = int(aya.attrib["index"])
            text_uthmani = aya.attrib["text"]
            ayah = AyahModel(
                surah_id=surah_id,
                ayah_number=ayah_number,
                text_uthmani=text_uthmani,
            )
            db.upsert_ayah(ayah)
