"""Repeatable fix for alef-madda encoding mismatch (idempotent).

The corpus morphology file sometimes spells alef-madda as two Buckwalter
chars (base alef + combining maddah), which scraper.buckwalter previously
converted to a decomposed Unicode sequence -- while root_forms.form_arabic
(a separate import pipeline, Lane's Lexicon via qurandev/roots) always uses
the precomposed form. The two never matched by exact string equality,
breaking the root/dictionary concordance's derived-form filter for every
form containing that letter. scraper.buckwalter now NFC-normalizes new
conversions at the source; this backfills already-imported words.lemma and
word_segments.lemma. See scraper.db.apply_lemma_madda_fix for the SQL.
"""

from __future__ import annotations

from .db import ScraperDatabase


def fix_lemma_madda(db: ScraperDatabase) -> tuple[int, int]:
    """Return (words changed, word_segments changed)."""
    return db.apply_lemma_madda_fix()
