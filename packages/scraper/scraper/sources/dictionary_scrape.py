"""Checkpointed scrape drivers for dictionary + word-detail pages.

Rate-limited; resumable via Checkpoint. The HTTP client is injected (a factory)
so tests can pass a fake and the real runs use httpx.
"""

from __future__ import annotations

import time
from collections.abc import Callable

import httpx

from ..buckwalter import buckwalter_to_arabic
from ..checkpoint import Checkpoint
from ..db import ScraperDatabase
from ..models import ConceptTagModel, RootFormModel, RootModel
from .corpus_dictionary import parse_root_page
from .corpus_word_detail import parse_word_detail

_DICT_URL = "https://corpus.quran.com/qurandictionary.jsp?q={bw}"
_WORD_URL = "https://corpus.quran.com/wordmorphology.jsp?location=({s}:{a}:{p})"

ClientFactory = Callable[[], httpx.Client]


def _default_factory() -> httpx.Client:
    return httpx.Client(
        timeout=30.0,
        headers={"User-Agent": "quran-corpus-pwa/0.1 (+dictionary scrape)"},
    )


def scrape_dictionary(
    db: ScraperDatabase,
    checkpoint: Checkpoint,
    *,
    client_factory: ClientFactory = _default_factory,
    rate_limit: float = 1.5,
) -> int:
    """Scrape each distinct root's dictionary page. Returns #roots stored."""
    stored = 0
    roots = db.get_distinct_roots()
    with client_factory() as client:
        for bw in roots:
            key = f"root_{bw}"
            if checkpoint.is_done(key):
                continue
            resp = client.get(_DICT_URL.format(bw=bw))
            resp.raise_for_status()
            parsed = parse_root_page(resp.text)
            if parsed is not None:
                rid = db.upsert_root(
                    RootModel(
                        root_buckwalter=bw,
                        root_arabic=parsed.root_arabic
                        or buckwalter_to_arabic(bw)
                        or bw,
                        occurrence_count=parsed.occurrence_count,
                    )
                )
                for form in parsed.forms:
                    db.upsert_root_form(
                        RootFormModel(
                            root_id=rid,
                            sort_order=form.sort_order,
                            pos_label=form.pos_label,
                            form_arabic=form.form_arabic,
                            form_translit=form.form_translit,
                            gloss=form.gloss,
                            occurrence_count=form.occurrence_count,
                        )
                    )
                stored += 1
            checkpoint.mark_done(key)
            if rate_limit:
                time.sleep(rate_limit)
    return stored


def scrape_word_details(
    db: ScraperDatabase,
    checkpoint: Checkpoint,
    *,
    client_factory: ClientFactory = _default_factory,
    rate_limit: float = 1.5,
) -> int:
    """Scrape each word's morphology detail page (verbatim strings). Returns #stored.

    Only the site-unique data is stored here (description + Arabic grammar label
    + concept tags). Structured segments come from the GPL file (corpus_import).
    """
    stored = 0
    with client_factory() as client:
        for row in db.get_all_words_with_location():
            wid = int(row["word_id"])
            key = f"word_{wid}"
            if checkpoint.is_done(key):
                continue
            resp = client.get(
                _WORD_URL.format(
                    s=row["surah_id"], a=row["ayah_number"], p=row["position"]
                )
            )
            resp.raise_for_status()
            detail = parse_word_detail(resp.text)
            if detail is not None:
                db.update_word_detail(
                    wid,
                    detail.description,
                    " ".join(detail.grammar_arabic) or None,
                )
                for tag in detail.concept_tags:
                    db.upsert_concept_tag(
                        ConceptTagModel(word_id=wid, tag_label=tag)
                    )
                stored += 1
            checkpoint.mark_done(key)
            if rate_limit:
                time.sleep(rate_limit)
    return stored
