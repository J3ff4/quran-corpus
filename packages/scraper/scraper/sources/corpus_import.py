"""Import the Quranic Arabic Corpus morphology file into the database.

Unlike the HTML scraper (corpus_quran.py), this consumes the single official
download file (quranic-corpus-morphology-0.4.txt) and captures root + lemma in
addition to POS tags. Ayah text must already be present (e.g. via the Tanzil
import); text_arabic is derived from text_uthmani by word position, matching
the HTML scraper's behaviour.
"""

from __future__ import annotations

from pathlib import Path

from ..db import ScraperDatabase
from ..models import WordModel
from .corpus_morphology import parse_corpus_morphology


def import_corpus_morphology(path: Path, db: ScraperDatabase) -> int:
    """Parse the corpus morphology file and upsert words. Returns words imported.

    Words whose ayah is not yet in the database are skipped (ayah text must be
    imported first). text_arabic is derived from the ayah's text_uthmani.
    """
    imported = 0
    for pw in parse_corpus_morphology(path):
        ayah_row = db.get_ayah(pw.surah, pw.ayah)
        if ayah_row is None:
            continue
        ayah_id: int = ayah_row["id"]
        text_uthmani: str | None = ayah_row["text_uthmani"]

        word_texts = text_uthmani.split() if text_uthmani else []
        text_arabic = (
            word_texts[pw.position - 1]
            if 0 < pw.position <= len(word_texts)
            else ""
        )

        db.upsert_word(
            WordModel(
                ayah_id=ayah_id,
                position=pw.position,
                text_arabic=text_arabic,
                root=pw.root,
                lemma=pw.lemma,
                root_buckwalter=pw.root_buckwalter,
                lemma_buckwalter=pw.lemma_buckwalter,
                pos_tag=pw.pos_tag,
                morphology_json=pw.morphology_json,
            )
        )
        imported += 1
    return imported
