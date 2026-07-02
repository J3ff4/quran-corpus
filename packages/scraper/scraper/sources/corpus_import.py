"""Import the Quranic Arabic Corpus morphology file into the database.

Unlike the HTML scraper (corpus_quran.py), this consumes the single official
download file (quranic-corpus-morphology-0.4.txt) and captures root + lemma in
addition to POS tags. Ayah text must already be present (e.g. via the Tanzil
import); text_arabic is derived from text_uthmani by word position, matching
the HTML scraper's behaviour.
"""

from __future__ import annotations

from pathlib import Path

from ..buckwalter import buckwalter_to_arabic
from ..db import ScraperDatabase
from ..models import WordModel, WordSegmentModel
from .corpus_morphology import parse_corpus_morphology, parse_corpus_segments


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

    # Second pass: populate structured per-segment rows (forms/POS/features).
    # corpus renders segment glyphs only as bitmaps, so the GPL file is the
    # segment-glyph source (PRD §3.2). Requires the words to exist (pass one).
    for seg in parse_corpus_segments(path):
        word_id = db.get_word_id(seg.surah, seg.ayah, seg.word)
        if word_id is None:
            continue
        db.upsert_word_segment(
            WordSegmentModel(
                word_id=word_id,
                segment_index=seg.segment_index,
                segment_type=seg.segment_type,
                pos_tag=seg.tag,
                form_buckwalter=seg.form_buckwalter,
                form_arabic=buckwalter_to_arabic(seg.form_buckwalter.rstrip("+")),
                features_json=seg.features_json,
                lemma=buckwalter_to_arabic(seg.lemma_buckwalter)
                if seg.lemma_buckwalter
                else None,
                root=seg.root_buckwalter,
            )
        )
    return imported
