# packages/scraper/scraper/word_arabic.py
"""Derive words.text_arabic from word_segments — the corpus-aligned source of
truth. Fixes misalignment left by any positional guess; idempotent."""

from __future__ import annotations

from .db import ScraperDatabase


def derive_word_arabic(db: ScraperDatabase) -> int:
    """Rebuild every word's text_arabic from its segments. Returns rows changed.
    Raises ValueError if any word has no segments (cannot derive its Arabic)."""
    missing = db.count_words_without_segments()
    if missing:
        raise ValueError(f"{missing} words lack segments; cannot derive text_arabic")
    return db.rebuild_text_arabic_from_segments()
