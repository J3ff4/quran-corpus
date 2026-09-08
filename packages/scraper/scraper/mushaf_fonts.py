"""Fetch the 604 KFGQPC V2 page fonts and subset each to its own page.

Never committed: the subset output is ~120 MB in-APK (CLAUDE.md §9). This
command is how any machine reproduces them.
"""

import sqlite3
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

FONT_URL = "https://verses.quran.foundation/fonts/quran/hafs/v2/ttf/p{page}.ttf"
PAGE_MIN, PAGE_MAX = 1, 604


def font_family(page: int) -> str:
    """The family each page registers under -- matches the font's own name
    table (`QCF2106`), so a mismatch is visible in a font dump."""
    return f"QCF2{page:03d}"


def page_glyphs(con: sqlite3.Connection, page: int) -> set[int]:
    """Every codepoint the page's layout rows actually use."""
    codepoints: set[int] = set()
    for (glyph,) in con.execute(
        "SELECT glyph FROM mushaf_layout WHERE page = ?", (page,)
    ):
        codepoints.update(ord(c) for c in glyph)
    return codepoints


def subset_page_font(src: Path, dest: Path, codepoints: set[int]) -> tuple[int, int]:
    """Subset one page font to `codepoints`. Returns (raw bytes, subset bytes).

    `layout_features="*"` keeps every OpenType feature: these fonts position
    marks, and a page font that lost its GPOS would render subtly wrong rather
    than visibly broken. fontTools reports `Unknown ClassDef format: 0` on 15 of
    the 604 -- a malformed class table upstream, which is why Task 8 compares a
    rendered subset page against its unsubset original on the device.
    """
    if not codepoints:
        raise ValueError(f"no codepoints for {src.name}: was the layout imported?")

    raw = src.stat().st_size
    font = TTFont(str(src))
    options = subset.Options(layout_features="*", notdef_outline=True)
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=codepoints)
    subsetter.subset(font)
    dest.parent.mkdir(parents=True, exist_ok=True)
    font.save(str(dest))
    return raw, dest.stat().st_size
