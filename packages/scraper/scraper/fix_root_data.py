"""Repeatable fix for dictionary root data (idempotent).

Two corrections, both safe to re-run:
  1. occurrence_count re-derived from word_segments (many roots kept the 0
     default because only ~243 roots ever got a scraped corpus total).
  2. Junk root_forms rows removed — the pre-fix parser turned each "See Also"
     external link into a fake derived form with form_arabic=None.

Back up the DB (.bak) before running against the canonical DB.
"""

from __future__ import annotations

from .db import ScraperDatabase


def fix_root_data(db: ScraperDatabase) -> tuple[int, int]:
    """Return (occurrence counts changed, junk form rows deleted)."""
    counts_changed = db.recompute_occurrence_counts()
    forms_deleted = db.delete_null_arabic_root_forms()
    return counts_changed, forms_deleted
