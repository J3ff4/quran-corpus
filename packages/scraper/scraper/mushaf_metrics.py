"""Per-page type metrics, read off the fonts we actually ship."""

from collections.abc import Mapping, Sequence


def widest_line_em(
    lines: Mapping[int, Sequence[str]],
    cmap: Mapping[int, str],
    advances: Mapping[str, int],
    *,
    upm: int,
) -> float:
    """The widest line's total advance, in em.

    A page's font size is `text width / this`, so a value that is too SMALL
    scales the page up and overflows it. A glyph missing from the font is
    therefore a KeyError, never a zero -- see the test that pins it.

    U+0020 is the one deliberate exception. 198 layout rows hold a word whose
    two glyph codes are separated by a space, on 197 different pages; every
    non-space code in them is present in that page's own font, and the QCF
    fonts carry no space glyph at all. The space is a separator in the source
    data, not something print draws, so it costs nothing here -- and the line
    renderer strips it for the same reason.
    """
    widest = 0
    for glyphs in lines.values():
        total = 0
        for glyph in glyphs:
            for char in glyph:
                if char == " ":
                    continue
                total += advances[cmap[ord(char)]]
        widest = max(widest, total)
    return round(widest / upm, 4)


def tallest_line_em(
    lines: Mapping[int, Sequence[str]],
    cmap: Mapping[int, str],
    bounds: Mapping[str, tuple[int, int] | None],
    *,
    upm: int,
) -> float:
    """The tallest line's ink, top to bottom, in em.

    A page's type is capped at `line height / this`, because Android cuts what
    does not fit. React Native's CustomLineHeightSpan honours an explicit
    lineHeight by keeping the font's descent and squeezing the ASCENT to fit,
    so everything the box cannot hold comes off the top of the glyph -- which
    on this script is the harakat. Measured on the tablet in landscape
    (2026-10-02): pages set at the 40dp cap in a 49.9dp line box showed a hard
    horizontal cut at every line's top edge.

    Per line, not per font: `head.yMax - head.yMin` is the extreme of every
    glyph in the page's font, and the tallest glyph and the deepest one are
    often on different lines. Taking the extremes together costs ~10% of type
    size for a clash that never happens -- page 109 needs 1.852em by line
    against 2.056em by font, which is 26.9dp against 24.3dp.

    Blank glyphs (no contours, so no bounds) contribute nothing. A glyph the
    font does not carry is a KeyError, exactly as in `widest_line_em`, and for
    the same reason: a silent zero here would scale the page UP.
    """
    tallest = 0
    for glyphs in lines.values():
        above = below = 0
        for glyph in glyphs:
            for char in glyph:
                if char == " ":
                    continue
                extent = bounds[cmap[ord(char)]]
                if extent is None:
                    continue
                y_min, y_max = extent
                above = max(above, y_max)
                below = max(below, -y_min)
        tallest = max(tallest, above + below)
    return round(tallest / upm, 4)
