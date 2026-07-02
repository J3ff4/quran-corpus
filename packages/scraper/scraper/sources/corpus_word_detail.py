"""Parse a corpus.quran.com wordmorphology.jsp detail page.

Pure ``str -> ParsedWordDetail``. Network-free (fixture-tested).

Extracts only what the site uniquely exposes as text: the verbatim grammar
description sentence, the Arabic grammar label(s), and any concept/named-entity
tags. Structured per-segment data (forms/POS/features) comes from the GPL
morphology file (see corpus_import / word_segments), because corpus renders the
segment glyphs only as bitmaps — never as page text (PRD §3.2).
"""

from __future__ import annotations

from dataclasses import dataclass

from bs4 import BeautifulSoup, Tag


@dataclass
class ParsedWordDetail:
    description: str
    grammar_arabic: list[str]
    concept_tags: list[str]


def _find_description_cell(soup: BeautifulSoup) -> Tag | None:
    for cell in soup.find_all(["td", "p", "div"]):
        if "morphological segment" in cell.get_text(" ", strip=True):
            return cell
    return None


def parse_word_detail(html: str) -> ParsedWordDetail | None:
    soup = BeautifulSoup(html, "lxml")
    cell = _find_description_cell(soup)
    if cell is None:
        return None

    description = cell.get_text(" ", strip=True)
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
