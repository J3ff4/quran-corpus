"""Fetch and import word morphology from corpus.quran.com.

Rate-limited to respect robots.txt. Resumable via Checkpoint.
"""

from __future__ import annotations

import time

import httpx

from ..checkpoint import Checkpoint
from ..db import ScraperDatabase
from ..models import WordModel
from .corpus_parser import parse_next_verse_url, parse_verse_words

_BASE_URL = "https://corpus.quran.com/wordbyword.jsp"


def scrape_chapter(
    chapter_id: int,
    db: ScraperDatabase,
    checkpoint: Checkpoint,
    rate_limit: float = 1.5,
) -> None:
    """Scrape all words for a chapter, following pagination, with checkpoint resumption.

    Skips chapters already marked complete in the checkpoint.
    Derives text_arabic from text_uthmani stored in DB (split by whitespace,
    1-indexed by position).
    """
    ck_key = f"chapter_{chapter_id}"
    if checkpoint.is_done(ck_key):
        return

    next_verse: int | None = 1

    with httpx.Client(timeout=30.0) as client:
        while next_verse is not None:
            url = f"{_BASE_URL}?chapter={chapter_id}&verse={next_verse}"
            response = client.get(url)
            response.raise_for_status()
            html = response.text

            _process_page(html, chapter_id, db)

            next_verse = parse_next_verse_url(html)
            if next_verse is not None:
                time.sleep(rate_limit)

    checkpoint.mark_done(ck_key)


def _process_page(html: str, chapter_id: int, db: ScraperDatabase) -> None:
    """Parse one page of words and upsert into the database."""
    for pw in parse_verse_words(html):
        ayah_row = db._conn.execute(
            "SELECT id, text_uthmani FROM ayahs WHERE surah_id = ? AND ayah_number = ?",
            (chapter_id, pw.verse_number),
        ).fetchone()
        if ayah_row is None:
            continue
        ayah_id: int = ayah_row[0]
        text_uthmani: str | None = ayah_row[1]

        word_texts = text_uthmani.split() if text_uthmani else []
        text_arabic = (
            word_texts[pw.position - 1] if 0 < pw.position <= len(word_texts) else ""
        )

        db.upsert_word(
            WordModel(
                ayah_id=ayah_id,
                position=pw.position,
                text_arabic=text_arabic,
                transliteration=pw.transliteration,
                pos_tag=pw.pos_tag,
                morphology_json=pw.morphology_json,
            )
        )
