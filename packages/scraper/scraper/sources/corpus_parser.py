"""Parse word-by-word morphology HTML from corpus.quran.com/wordbyword.jsp.

The page is server-rendered static HTML (no JS execution required). A single
request returns a paginated group of verses (e.g. verses 1-6 for chapter 1).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse

from bs4 import BeautifulSoup, NavigableString


@dataclass
class ParsedWord:
    verse_number: int  # ayah number within the chapter (from location span)
    position: int  # word position within verse (from location span)
    transliteration: str | None  # from <a> or <span class="phonetic">
    pos_tag: str | None  # first <b> text in col3 cell
    english_gloss: str | None  # bare text node in cell 0 (not inside spans/links)
    morphology_json: str | None  # JSON array of all POS codes from <b> tags in col3


def parse_verse_words(html: str) -> list[ParsedWord]:
    """Parse all words from a corpus.quran.com wordbyword.jsp page.

    Returns an empty list when the HTML contains no morphologyTable.
    """
    soup = BeautifulSoup(html, "lxml")
    tbl = soup.find("table", class_="morphologyTable")
    if tbl is None:
        return []

    words: list[ParsedWord] = []
    for row in tbl.find_all("tr")[1:]:  # skip the header row
        cells = row.find_all("td")
        if len(cells) < 2:
            continue

        # --- Cell 0: location span, transliteration, English gloss ---
        cell0 = cells[0]
        loc_el = cell0.find("span", class_="location")
        if not loc_el:
            continue
        try:
            ch_str, v_str, pos_str = loc_el.get_text(strip=True).strip("()").split(":")
            verse_number = int(v_str)
            position = int(pos_str)
        except (ValueError, AttributeError):
            continue

        # Transliteration: prefer <a>, fall back to <span class="phonetic">
        translit_el = cell0.find("a") or cell0.find("span", class_="phonetic")
        transliteration = translit_el.get_text(strip=True) if translit_el else None

        # English gloss: bare NavigableString children only (strips nested tags)
        gloss_parts = [
            str(c).strip()
            for c in cell0.children
            if isinstance(c, NavigableString) and str(c).strip()
        ]
        english_gloss = gloss_parts[-1] if gloss_parts else None

        # --- Cell 2 (col3): POS codes from <b> tags ---
        pos_codes: list[str] = []
        if len(cells) > 2:
            col3 = cells[2]
            for b_tag in col3.find_all("b"):
                code = b_tag.get_text(strip=True)
                if code:
                    pos_codes.append(code)

        pos_tag = pos_codes[0] if pos_codes else None
        morphology_json = (
            json.dumps(pos_codes, ensure_ascii=False) if pos_codes else None
        )

        words.append(
            ParsedWord(
                verse_number=verse_number,
                position=position,
                transliteration=transliteration,
                pos_tag=pos_tag,
                english_gloss=english_gloss,
                morphology_json=morphology_json,
            )
        )

    return words


def parse_next_verse_url(
    html: str, current_chapter: int, current_verse: int
) -> int | None:
    """Return the next page's starting verse in this chapter, or None if last.

    The ``.navigationPane`` contains both backward and forward links (e.g. on
    the last page of chapter 1 the first ``verse=`` link points *back* to
    verse 1, and another points to the *next chapter*). Selecting the first
    link blindly causes the scraper to oscillate forever (1 -> 7 -> 1 -> ...).

    To advance reliably we consider only links that stay within
    ``current_chapter`` and target a verse strictly greater than
    ``current_verse``, and return the smallest such verse. ``None`` means
    there is no forward link for this chapter — i.e. the current page is the
    last one.
    """
    soup = BeautifulSoup(html, "lxml")
    nav = soup.find("div", class_="navigationPane")
    if nav is None:
        return None

    forward_verses: list[int] = []
    for link in nav.find_all("a", href=True):
        href = link["href"]
        if not isinstance(href, str) or "verse=" not in href:
            continue
        qs = parse_qs(urlparse(href).query)
        verses = qs.get("verse", [])
        # A link without an explicit chapter stays in the current chapter.
        chapters = qs.get("chapter", [str(current_chapter)])
        if not verses:
            continue
        try:
            link_chapter = int(chapters[0])
            link_verse = int(verses[0])
        except ValueError:
            continue
        if link_chapter == current_chapter and link_verse > current_verse:
            forward_verses.append(link_verse)

    return min(forward_verses) if forward_verses else None
