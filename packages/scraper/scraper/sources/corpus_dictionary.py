"""Parse a corpus.quran.com qurandictionary.jsp root page.

Pure ``str -> ParsedRoot``. Network-free (fixture-tested).

Page shape (root ك ت ب):
  "The triliteral root <i class="ab">kāf tā bā</i> (<span class="at">ك ت ب</span>)
   occurs 319 times in the Quran, in seven derived forms:"
  <ul class="also">
    <li>49 times as the form I verb <i class="ab">kataba</i>
        (<span class="at">كَتَبَ</span>)</li>
    ...
  </ul>
Lane's Lexicon appears under "See Also" as an <a href> to lexicon.quranic-research.net.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from bs4 import BeautifulSoup, Tag

_TOTAL_RE = re.compile(r"occurs\s+([\d,]+)\s+times")
# "49 times as the form I verb", "once as the noun", "six times as the ..."
_FORM_RE = re.compile(r"^\s*(.+?)\s+as the\s+(.+?)\s*$")
_NUMBER_WORDS = {
    "once": 1, "twice": 2, "thrice": 3,
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
}


@dataclass
class ParsedRootForm:
    sort_order: int
    pos_label: str
    form_arabic: str | None
    form_translit: str | None
    gloss: str | None
    occurrence_count: int


@dataclass
class ParsedRoot:
    root_arabic: str
    occurrence_count: int
    forms: list[ParsedRootForm]
    lane_url: str | None


def _parse_count(phrase: str) -> int:
    """'49 times' -> 49, 'once' -> 1, 'six times' -> 6."""
    phrase = phrase.strip().lower()
    m = re.match(r"(\d+)", phrase)
    if m:
        return int(m.group(1))
    first = phrase.split()[0] if phrase.split() else ""
    return _NUMBER_WORDS.get(first, 0)


def _cap_first(s: str) -> str:
    return s[0].upper() + s[1:] if s else s


def _extract_forms(soup: BeautifulSoup) -> list[ParsedRootForm]:
    ul = soup.find("ul", class_="also")
    if not isinstance(ul, Tag):
        return []
    forms: list[ParsedRootForm] = []
    for i, li in enumerate(ul.find_all("li")):
        translit_el = li.find("i", class_="ab")
        arabic_el = li.find("span", class_="at")
        form_translit = translit_el.get_text(strip=True) if translit_el else None
        form_arabic = arabic_el.get_text(strip=True) if arabic_el else None
        # Text before the translit tag: "49 times as the form I verb"
        lead = li.get_text(" ", strip=True)
        if form_translit:
            lead = lead.split(form_translit)[0]
        m = _FORM_RE.match(lead)
        if m:
            count = _parse_count(m.group(1))
            pos_label = _cap_first(m.group(2).strip())
        else:
            count, pos_label = 0, lead.strip()
        forms.append(
            ParsedRootForm(
                sort_order=i,
                pos_label=pos_label,
                form_arabic=form_arabic,
                form_translit=form_translit,
                gloss=None,
                occurrence_count=count,
            )
        )
    return forms


def _extract_lane_url(soup: BeautifulSoup) -> str | None:
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if isinstance(href, str) and "lexicon" in href.lower():
            return href
    return None


def parse_root_page(html: str) -> ParsedRoot | None:
    soup = BeautifulSoup(html, "lxml")
    text = soup.get_text(" ", strip=True)
    m = _TOTAL_RE.search(text)
    if m is None:
        return None
    total = int(m.group(1).replace(",", ""))

    # Root Arabic = first <span class="at"> (the header's "( ك ت ب )").
    root_el = soup.find("span", class_="at")
    if root_el is None:
        return None
    root_arabic = root_el.get_text(strip=True)

    return ParsedRoot(
        root_arabic=root_arabic,
        occurrence_count=total,
        forms=_extract_forms(soup),
        lane_url=_extract_lane_url(soup),
    )
