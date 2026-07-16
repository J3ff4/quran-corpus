"""Repeatable fix for seatless-hamza encoding (idempotent).

Rewrites bare hamza -> tatweel+combining-hamza-above wherever it's a
definite-article seatless-hamza (e.g. 2:8 al-akhir), matching the KFGQPC
Hafs Uthmanic Script's attachment rules. See scraper.hamza_seat for the
character-level rule and scraper.db.apply_hamza_seat_fix for the SQL.

Back up the DB (.bak) before running against the canonical DB.
"""

from __future__ import annotations

from .db import ScraperDatabase


def fix_hamza_seat(db: ScraperDatabase) -> tuple[int, int]:
    """Return (ayahs changed, words changed)."""
    return db.apply_hamza_seat_fix()
