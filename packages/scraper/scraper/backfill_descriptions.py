"""One-off backfill: trim page chrome from already-stored word descriptions.

Rows scraped before ``trim_description`` existed keep the whole analysis block
(verse translation, recitation credit, word nav). Re-apply the same trim to
stored rows so old and newly-scraped rows are consistent. Idempotent — trimming
an already-trimmed string is a no-op, so re-running changes nothing.
"""

from __future__ import annotations

from .db import ScraperDatabase
from .sources.corpus_word_detail import trim_description


def trim_stored_descriptions(db: ScraperDatabase) -> int:
    """Trim every stored description; return how many rows changed.

    Collects all changes and writes them in a single transaction — the table
    has ~35k dirty rows, so per-row commits would mean tens of thousands of
    disk syncs.
    """
    updates: list[tuple[str, int]] = []
    for row in db.get_words_with_description():
        original = row["morphology_description"]
        trimmed = trim_description(original)
        if trimmed != original:
            updates.append((trimmed, int(row["id"])))
    if updates:
        db.update_word_descriptions_bulk(updates)
    return len(updates)
