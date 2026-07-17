"""Fetch and import word morphology from corpus.quran.com.

Rate-limited to respect robots.txt. Resumable via Checkpoint.
"""

from __future__ import annotations

import time

import httpx

from ..checkpoint import Checkpoint
from ..db import ScraperDatabase
from ..http_retry import get_with_retry
from ..models import WordGlossModel, WordModel
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
    Word text_arabic is filled later from word_segments (see derive-word-arabic).
    """
    ck_key = f"chapter_{chapter_id}"
    if checkpoint.is_done(ck_key):
        return

    current_verse: int | None = 1

    with httpx.Client(timeout=30.0) as client:
        while current_verse is not None:
            url = f"{_BASE_URL}?chapter={chapter_id}&verse={current_verse}"
            response = get_with_retry(client, url)
            html = response.text

            _process_page(html, chapter_id, db)

            next_verse = parse_next_verse_url(html, chapter_id, current_verse)
            if next_verse is not None:
                time.sleep(rate_limit)
            current_verse = next_verse

    checkpoint.mark_done(ck_key)


def _process_page(html: str, chapter_id: int, db: ScraperDatabase) -> None:
    """Parse one page of words and upsert into the database.

    text_arabic is intentionally left empty here — it is derived from
    word_segments (the corpus-aligned source of truth) by the
    derive-word-arabic step. Deriving it from text_uthmani.split() misaligns
    with corpus word positions (Basmala + pause-mark tokens shift the index).
    """
    for pw in parse_verse_words(html):
        ayah_row = db.get_ayah(chapter_id, pw.verse_number)
        if ayah_row is None:
            continue
        ayah_id: int = ayah_row["id"]

        word_id = db.upsert_word(
            WordModel(
                ayah_id=ayah_id,
                position=pw.position,
                text_arabic="",
                transliteration=pw.transliteration,
                pos_tag=pw.pos_tag,
                morphology_json=pw.morphology_json,
            )
        )

        if pw.english_gloss:
            db.upsert_word_gloss(
                WordGlossModel(
                    word_id=word_id,
                    language_code="en",
                    gloss_text=pw.english_gloss,
                )
            )
