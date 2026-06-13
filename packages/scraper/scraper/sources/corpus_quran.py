"""Scraper for corpus.quran.com — word-by-word morphology data.

Rate-limited to 1 req / 1.5s per robots.txt policy. Resumable via Checkpoint.
Full implementation in Phase 2.
"""

from ..checkpoint import Checkpoint
from ..db import ScraperDatabase

RATE_LIMIT_SECONDS = 1.5
BASE_URL = "https://corpus.quran.com"


async def scrape_surah(
    surah_id: int, db: ScraperDatabase, checkpoint: Checkpoint
) -> None:
    """Scrape all ayahs for a surah. No-op if already marked done in checkpoint."""
    key = f"corpus_surah_{surah_id}"
    if checkpoint.is_done(key):
        return
    raise NotImplementedError("corpus.quran.com scraping implemented in Phase 2")
