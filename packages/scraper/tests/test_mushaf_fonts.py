import sqlite3

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

from scraper.mushaf_fonts import page_glyphs, subset_page_font


def _font(path, chars: str) -> None:
    fb = FontBuilder(1000, isTTF=True)
    names = [".notdef"] + [f"g{ord(c)}" for c in chars]
    fb.setupGlyphOrder(names)
    fb.setupCharacterMap({ord(c): f"g{ord(c)}" for c in chars})

    glyphs = {}
    for name in names:
        pen = TTGlyphPen(None)
        pen.moveTo((0, 0))
        pen.lineTo((0, 500))
        pen.lineTo((500, 500))
        pen.closePath()
        glyphs[name] = pen.glyph()
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics({n: (600, 0) for n in names})
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable({"familyName": "T", "styleName": "R"})
    fb.setupOS2()
    fb.setupPost()
    fb.save(str(path))


def test_page_glyphs_reads_only_that_page(tmp_path):
    db = tmp_path / "q.db"
    con = sqlite3.connect(db)
    con.execute(
        """CREATE TABLE mushaf_layout (page INT, line INT, seq INT, surah_id INT,
             ayah_number INT, position INT, char_type TEXT, glyph TEXT)"""
    )
    con.executemany(
        "INSERT INTO mushaf_layout VALUES (?,1,1,1,1,1,'word',?)",
        [(1, "AB"), (2, "C")],
    )
    con.commit()
    assert page_glyphs(con, 1) == {ord("A"), ord("B")}
    assert page_glyphs(con, 2) == {ord("C")}


def test_subset_keeps_the_pages_glyphs_and_drops_the_rest(tmp_path):
    src, dest = tmp_path / "src.ttf", tmp_path / "out.ttf"
    _font(src, "ABCDEFGH")
    raw, sub = subset_page_font(src, dest, {ord("A"), ord("B")})

    cmap = TTFont(dest).getBestCmap()
    assert set(cmap) == {ord("A"), ord("B")}  # kept exactly what the page uses
    assert sub < raw  # and actually got smaller


def test_subset_refuses_an_empty_codepoint_set(tmp_path):
    """A page with no glyphs means the layout import did not run. Subsetting to
    nothing would produce 604 valid, empty fonts and a mushaf of blank pages."""
    src, dest = tmp_path / "src.ttf", tmp_path / "out.ttf"
    _font(src, "AB")
    try:
        subset_page_font(src, dest, set())
    except ValueError:
        pass
    else:
        raise AssertionError("expected ValueError")


def test_font_family_matches_the_typescript_side():
    """apps/mobile/src/mushaf/pageFont.ts computes this name independently, and
    a family the app registers under but the font does not carry renders as
    nothing. Both sides are pinned to the font's own name table (`QCF2106`)."""
    from scraper.mushaf_fonts import font_family

    assert font_family(1) == "QCF2001"
    assert font_family(106) == "QCF2106"
    assert font_family(604) == "QCF2604"
