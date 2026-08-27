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

Single-form roots carry no <ul class="also">; the form is stated inline:
  "... occurs 461 times in the Quran as the noun <i class="ab">arḍ</i>
   (<span class="at">أَرْض</span>)."
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from bs4 import BeautifulSoup, Tag

# Totals appear as digits ("occurs 319 times") or number-words for low
# frequencies ("occurs three times", "occurs only once"). An optional "only"
# precedes rare counts. once/twice/thrice take no trailing "times"; everything
# else does. Both feed _parse_count.
_TOTAL_RE = re.compile(r"occurs\s+(?:only\s+)?([\w,]+)\s+times?\b", re.IGNORECASE)
_TOTAL_ONCE_RE = re.compile(
    r"occurs\s+(?:only\s+)?(once|twice|thrice)\b", re.IGNORECASE
)
# "49 times as the form I verb", "once as the noun", "six times as the ..."
_FORM_RE = re.compile(r"^\s*(.+?)\s+as the\s+(.+?)\s*$")

# When a root has exactly ONE derived form, corpus emits no <ul class="also">
# and names the form inline: "... in the Quran, as the noun <i>arḍ</i>
# (<span>أَرْض</span>)". The comma is optional. Only the POS is read from text
# -- translit and Arabic come from the tags, as in _extract_forms. Matching
# them out of flattened text loses the tag boundary: a multi-word translit
# ("banī isrāīl") would leave "banī" glued to the POS label.
# pos excludes "." "(" ")" so it cannot swallow a preceding sentence, and $
# anchors it to the text immediately before the <i>.
_SINGLE_FORM_LEAD_RE = re.compile(
    r"in the Quran,?\s+as the\s+(?P<pos>[^.()]+?)\s*$",
    re.IGNORECASE,
)
_ARABIC_RE = re.compile(r"[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]")
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
    phrase = phrase.strip().lower().replace(",", "")
    m = re.match(r"(\d+)", phrase)
    if m:
        return int(m.group(1))
    first = phrase.split()[0] if phrase.split() else ""
    return _NUMBER_WORDS.get(first, 0)


def _cap_first(s: str) -> str:
    return s[0].upper() + s[1:] if s else s


def _form_arabic(el: Tag) -> str:
    """The form's Arabic as the page writes it, NFC-normalized.

    The page orders a shadda ahead of the vowel it shares a letter with, where
    NFC orders them the other way (fatha is combining class 30, shadda 33).
    The morphology import on the other side of the derived-form filter's join
    already normalizes (buckwalter.py, PR #50), so leaving this side raw meant
    two strings that render identically and compare unequal -- root Hqq's form
    حَآقَّة counted three occurrences and filtered to none. NFC never changes
    how a string renders, only which of several equal encodings it is stored
    as, so nothing on screen moves.
    """
    return unicodedata.normalize("NFC", el.get_text(strip=True))


def _extract_forms(soup: BeautifulSoup) -> list[ParsedRootForm]:
    forms: list[ParsedRootForm] = []
    # The page reuses class="also" for both the derived-forms list and the
    # "See Also" box. Real derived-form <li>s carry a <span class="at"> (the
    # form's Arabic); See-Also <li>s (external dictionary links) do not. Scan
    # every ul.also and keep only Arabic-bearing entries — this drops the
    # See-Also junk whether or not a forms list is present.
    for ul in soup.find_all("ul", class_="also"):
        if not isinstance(ul, Tag):
            continue
        for li in ul.find_all("li"):
            arabic_el = li.find("span", class_="at")
            if arabic_el is None:
                continue
            translit_el = li.find("i", class_="ab")
            form_translit = translit_el.get_text(strip=True) if translit_el else None
            form_arabic = _form_arabic(arabic_el)
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
                    sort_order=len(forms),
                    pos_label=pos_label,
                    form_arabic=form_arabic,
                    form_translit=form_translit,
                    gloss=None,
                    occurrence_count=count,
                )
            )
    return forms


def _extract_single_form(soup: BeautifulSoup, total: int) -> list[ParsedRootForm]:
    """Fallback for roots with one derived form and therefore no forms list.

    The form accounts for every occurrence of the root, so its count is the
    root total. Returns [] when no sentence matches, which is the normal case
    for multi-form roots.
    """
    for translit_el in soup.find_all("i", class_="ab"):
        translit = translit_el.get_text(strip=True)
        if not translit:
            continue
        sentence = translit_el.parent
        arabic_el = translit_el.find_next("span", class_="at")
        # Same-parent keeps the pair inside one sentence: a page whose prose
        # names no Arabic must not borrow a span from further down.
        if sentence is None or arabic_el is None or arabic_el.parent is not sentence:
            continue
        arabic = _form_arabic(arabic_el)
        if not _ARABIC_RE.search(arabic):
            continue
        # Text ahead of the translit tag: "... in the Quran, as the noun".
        # Walk the DOM rather than splitting the sentence on the translit --
        # root nwn reads "root nūn wāw nūn (ن و ن) ... as the noun nūn", where
        # splitting on "nūn" cuts at the header and loses the whole clause.
        # The root header's own <i class="ab"> fails this match, so the loop
        # skips past it without a special case.
        lead = " ".join(
            " ".join(
                (s.get_text(" ") if isinstance(s, Tag) else str(s)).split()
            )
            for s in reversed(list(translit_el.previous_siblings))
        )
        m = _SINGLE_FORM_LEAD_RE.search(lead)
        if m is None:
            continue
        return [
            ParsedRootForm(
                sort_order=0,
                pos_label=_cap_first(m.group("pos").strip()),
                form_arabic=arabic,
                form_translit=translit,
                gloss=None,
                occurrence_count=total,
            )
        ]
    return []


def _extract_lane_url(soup: BeautifulSoup) -> str | None:
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if isinstance(href, str) and "lexicon" in href.lower():
            return href
    return None


def parse_root_page(html: str) -> ParsedRoot | None:
    soup = BeautifulSoup(html, "lxml")
    text = soup.get_text(" ", strip=True)
    m = _TOTAL_RE.search(text) or _TOTAL_ONCE_RE.search(text)
    if m is None:
        return None
    total = _parse_count(m.group(1))

    # Root Arabic = first <span class="at"> (the header's "( ك ت ب )").
    root_el = soup.find("span", class_="at")
    if root_el is None:
        return None
    # Corpus renders the header letter-spaced ("ك ت ب"); roots are stored
    # compact. strip=True only trims the ends, and the separator is HTML so it
    # may be a newline or nbsp — split()/join drops every whitespace form.
    root_arabic = "".join(root_el.get_text().split())

    forms = _extract_forms(soup) or _extract_single_form(soup, total)

    return ParsedRoot(
        root_arabic=root_arabic,
        occurrence_count=total,
        forms=forms,
        lane_url=_extract_lane_url(soup),
    )
