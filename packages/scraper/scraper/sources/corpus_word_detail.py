"""Parse a corpus.quran.com wordmorphology.jsp detail page.

Pure ``str -> ParsedWordDetail``. Network-free (fixture-tested).

Extracts only what the site uniquely exposes as text: the verbatim grammar
description sentence, the Arabic grammar label(s), and any concept/named-entity
tags. Structured per-segment data (forms/POS/features) comes from the GPL
morphology file (see corpus_import / word_segments), because corpus renders the
segment glyphs only as bitmaps — never as page text (PRD §3.2).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from bs4 import BeautifulSoup, Tag

# The grammar prose is followed on-page by a contextual block that always opens
# "Chapter (N) sūrat …" (verse translation, recitation credit, word nav). The
# description cell's get_text() swallows all of it, so cut at that boundary to
# keep only the grammar sentence(s). Reused by the one-off backfill that cleans
# rows scraped before this trim existed.
_CONTEXT_BOUNDARY = re.compile(r"\s*Chapter\s*\(\d+\)\s+sūrat")


def trim_description(text: str) -> str:
    """Strip trailing page chrome, keeping only the grammar prose."""
    return _CONTEXT_BOUNDARY.split(text, maxsplit=1)[0].strip()


@dataclass
class ParsedWordDetail:
    description: str
    grammar_arabic: list[str]
    concept_tags: list[str]


# Three prose phrasings open the grammar cell:
#  - multi-segment word:  "The Nth word of verse (S:A) is divided into ..."
#  - single-segment word: "The Nth word of verse (S:A) is a masculine noun ..."
#  - Quranic initials (muqaṭṭaʿāt, POS=INL): "Verse N of chapter M begins with
#    the Quranic initials ..." — no "word of verse" phrase at all.
# Anchor on whichever opener is present; matching only "morphological segment"
# dropped every single-segment word, and "word of verse" alone still drops INL.
_CELL_ANCHORS = ("word of verse", "begins with the Quranic initials")


def _find_description_cell(soup: BeautifulSoup) -> Tag | None:
    for cell in soup.find_all(["td", "p", "div"]):
        text = cell.get_text(" ", strip=True)
        if any(anchor in text for anchor in _CELL_ANCHORS):
            return cell
    return None


def parse_word_detail(html: str) -> ParsedWordDetail | None:
    soup = BeautifulSoup(html, "lxml")
    cell = _find_description_cell(soup)
    if cell is None:
        return None

    description = trim_description(cell.get_text(" ", strip=True))
    grammar_arabic = [
        span.get_text(strip=True)
        for span in cell.find_all("span", class_="at")
        if span.get_text(strip=True)
    ]
    # Concept / named-entity tags are not present on most word pages; capture any
    # explicit "special reference" labels when they appear (none here).
    concept_tags: list[str] = []

    return ParsedWordDetail(
        description=description,
        grammar_arabic=grammar_arabic,
        concept_tags=concept_tags,
    )
