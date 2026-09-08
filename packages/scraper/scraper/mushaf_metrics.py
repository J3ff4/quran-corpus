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
