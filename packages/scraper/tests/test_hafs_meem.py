"""The low-meem anchor repair, and a guard on the fonts we actually ship."""

import os
import tempfile
from collections.abc import Callable
from functools import cache
from pathlib import Path

import pytest
from fontTools.ttLib import TTFont

from scraper.hafs_meem import (
    HIGH_MEEM,
    KASRATAN,
    LOW_MEEM,
    PATCHED,
    STAGGER_FLAGS,
    UNPATCHED,
    low_meem_anchors,
    mark_records,
    patch_low_meem,
    stagger_ligatures,
    suppress_stagger_flags,
)

WAQF_LAZIM = 0x06D8

REPO = Path(__file__).resolve().parents[3]
SHIPPED = [
    REPO / "apps/mobile/assets/fonts/hafs.ttf",
    REPO / "apps/web/src/app/fonts/hafs.18.woff2",
]


@pytest.mark.parametrize("path", SHIPPED, ids=lambda p: p.name)
def test_shipped_font_has_the_low_meem_below_the_baseline(path: Path) -> None:
    """The defect draws a small meem *through* the letter on 46% of ayahs, and
    nothing else catches it: the glyph is present, the text is correct, and no
    vitest or type-check can see a mark anchor. Every KFGQPC release to date --
    v0.18 and v2.2 both -- ships the null anchor, so a font bump reintroduces it
    silently unless this test fails."""
    anchors = low_meem_anchors(path)
    assert anchors, f"{path.name}: U+06ED positions no marks"
    assert set(anchors) == {PATCHED}, (
        f"{path.name}: U+06ED anchors {sorted(set(anchors))}; "
        f"run `uv run scraper hafs-low-meem`"
    )


@pytest.mark.parametrize("path", SHIPPED, ids=lambda p: p.name)
def test_shipped_font_leaves_the_high_meem_exactly_as_upstream_set_it(
    path: Path,
) -> None:
    """U+06E2 (the same meem, after a plain noon) was never the reported defect
    and the patch must not drift into it: it is a different mark class, and it
    renders correctly on device. Upstream gives it (375, 460) in eight of the
    nine lookups and a null anchor in the ninth -- odd, but upstream's, and left
    alone. Pinned exactly so a patch that widened its reach fails here."""
    font = TTFont(str(path))
    glyph = font.getBestCmap()[0x06E2]
    seen = set()
    for lookup in font["GPOS"].table.LookupList.Lookup:
        if lookup.LookupType != 4:
            continue
        for subtable in lookup.SubTable:
            glyphs = subtable.MarkCoverage.glyphs
            if glyph in glyphs:
                record = subtable.MarkArray.MarkRecord[glyphs.index(glyph)]
                seen.add((record.MarkAnchor.XCoordinate, record.MarkAnchor.YCoordinate))
    # (0, 0) literal, not UNPATCHED: that constant means "the low meem's
    # shipped defect value". Upstream's null anchor on the *high* meem in
    # its ninth lookup is an unrelated fact that happens to share the value,
    # and reusing the name would silently re-pin this to whatever a future
    # KFGQPC release makes UNPATCHED.
    assert seen == {(375, 460), (0, 0)}


def _rewrite(tmp_path: Path, edit: Callable[[TTFont], None]) -> Path:
    """A private copy of the shipped font with `edit` applied and saved."""
    dest = tmp_path / "hafs.ttf"
    dest.write_bytes(SHIPPED[0].read_bytes())
    font = TTFont(str(dest))
    edit(font)
    font.save(str(dest))
    return dest


def _unpatch(font: TTFont) -> None:
    for record in mark_records(font, "test"):
        record.MarkAnchor.XCoordinate, record.MarkAnchor.YCoordinate = UNPATCHED


def test_patch_moves_every_lookup(tmp_path: Path) -> None:
    """The font repeats its mark array per base-coverage group. Patching one
    lookup would fix the meem on some bases and leave it broken on the rest."""
    font = _rewrite(tmp_path, _unpatch)

    assert patch_low_meem(font).anchors == 9
    assert set(low_meem_anchors(font)) == {PATCHED}


def test_patch_is_idempotent(tmp_path: Path) -> None:
    """Re-running after a font upgrade must not stack offsets."""
    font = _rewrite(tmp_path, lambda _: None)

    result = patch_low_meem(font)  # the shipped copy is already patched
    assert (result.anchors, result.ligatures) == (0, 0)
    assert not result.changed
    assert set(low_meem_anchors(font)) == {PATCHED}


def test_patch_refuses_an_anchor_it_was_never_measured_against(
    tmp_path: Path,
) -> None:
    """A third anchor means the font was swapped for one this patch has not been
    looked at. Re-aiming a mark in an unknown font is how you ship a new defect."""

    def stray(font: TTFont) -> None:
        record = mark_records(font, "test")[0]
        record.MarkAnchor.XCoordinate, record.MarkAnchor.YCoordinate = (50, 50)

    font = _rewrite(tmp_path, stray)

    with pytest.raises(ValueError, match=r"unexpected U\+06ED anchor"):
        patch_low_meem(font)


def test_patch_refuses_a_font_without_the_glyph(tmp_path: Path) -> None:
    def drop(font: TTFont) -> None:
        for table in font["cmap"].tables:
            table.cmap.pop(LOW_MEEM, None)

    font = _rewrite(tmp_path, drop)

    with pytest.raises(ValueError, match=r"no glyph for U\+06ED"):
        patch_low_meem(font)


# --- the staggering flags -------------------------------------------------
#
# 6,643 of the 6,982 tanween+meem pairs in the corpus are not meems: they flag
# a staggered tanween, and the mushaf draws no mark for them. These assert the
# ligature that swallows them, and -- just as important -- that it swallows
# nothing else.


@pytest.mark.parametrize("path", SHIPPED, ids=lambda p: p.name)
def test_shipped_font_ligates_every_staggering_flag_to_the_bare_tanween(
    path: Path,
) -> None:
    """Each flag pair must collapse to the tanween alone. Asserting the exact
    result glyph matters: a ligature to anything else would silently swap one
    wrong mark for another, and the font has 40 `gly0NN` composites that are
    plausible-looking wrong answers."""
    font = TTFont(str(path))
    cmap = font.getBestCmap()
    expected = {
        (cmap[tanween], cmap[meem], cmap[tanween]) for tanween, meem in STAGGER_FLAGS
    }
    assert stagger_ligatures(path) == expected, (
        f"{path.name}: staggering-flag ligatures are "
        f"{sorted(stagger_ligatures(path))}; run `uv run scraper hafs-low-meem`"
    )


@pytest.mark.parametrize("path", SHIPPED, ids=lambda p: p.name)
def test_the_flag_lookup_is_registered_in_rlig(path: Path) -> None:
    """A ligature in the lookup list that no feature references never fires, and
    looks identical to a working one from the table alone. `rlig` is the right
    home: it is on by default for Arabic and runs before GPOS, so the flag is
    gone before any mark anchor is consulted."""
    font = TTFont(str(path))
    cmap = font.getBestCmap()
    firsts = {cmap[tanween] for tanween, _ in STAGGER_FLAGS}
    gsub = font["GSUB"].table

    carrying = {
        index
        for index, lookup in enumerate(gsub.LookupList.Lookup)
        if lookup.LookupType == 4
        for subtable in lookup.SubTable
        if firsts & set(getattr(subtable, "ligatures", {}))
    }
    assert carrying, f"{path.name}: no lookup ligates a tanween"

    rlig = {
        index
        for record in gsub.FeatureList.FeatureRecord
        if record.FeatureTag == "rlig"
        for index in record.Feature.LookupListIndex
    }
    assert carrying & rlig, (
        f"{path.name}: the flag ligatures live in lookup(s) {sorted(carrying)}, "
        f"none of which rlig references {sorted(rlig)} -- they would never fire"
    )


@pytest.mark.parametrize("path", SHIPPED, ids=lambda p: p.name)
def test_shipped_font_never_ligates_a_meem_that_has_to_render(path: Path) -> None:
    """The three marks that must survive, and the reason each is at risk:

    * kasratan + U+06ED -- the 99 genuine iqlab meems. Same characters as a
      flag pair, opposite side, so a rule keyed on "tanween next to a meem"
      rather than on the exact pair would eat them.
    * U+06D8 -- the waqf lazim sign, 22 of them. A *different* codepoint that
      merely shares the name "small high meem"; always follows a space.
    * noon + U+06E2 -- 270 iqlab meems on a plain noon sakinah, including
      19:4, the control case in the device checklist. Not a tanween pair, so
      "strip U+06E2" would have killed them.
    """
    font = TTFont(str(path))
    cmap = font.getBestCmap()
    must_render = {
        (cmap[KASRATAN], cmap[LOW_MEEM]),
        (cmap[0x0646], cmap[HIGH_MEEM]),
    }
    waqf = cmap[WAQF_LAZIM]

    for lookup in font["GSUB"].table.LookupList.Lookup:
        if lookup.LookupType != 4:
            continue
        for subtable in lookup.SubTable:
            for first, ligatures in getattr(subtable, "ligatures", {}).items():
                for ligature in ligatures:
                    if not ligature.Component:
                        continue
                    pair = (first, ligature.Component[0])
                    assert pair not in must_render, (
                        f"{path.name}: {pair} is ligated away, but that mark "
                        f"renders in the mushaf"
                    )
                    assert waqf != first and waqf not in ligature.Component, (
                        f"{path.name}: the waqf lazim sign U+06D8 is consumed by "
                        f"a ligature ({first} + {ligature.Component})"
                    )


def test_suppress_is_idempotent_and_adds_nothing_twice(tmp_path: Path) -> None:
    """The command is re-run after every font upgrade, so a second pass must not
    stack a duplicate lookup -- two ligatures on the same pair is a font that
    fails to build in some toolchains and silently wins-first in others."""
    dest = tmp_path / "hafs.ttf"
    dest.write_bytes(SHIPPED[0].read_bytes())
    font = TTFont(str(dest))
    before = len(font["GSUB"].table.LookupList.Lookup)

    assert suppress_stagger_flags(font, "test") == 0
    assert len(font["GSUB"].table.LookupList.Lookup) == before


def test_a_font_missing_the_ligature_is_detected(tmp_path: Path) -> None:
    """The mutation check for the two tests above: strip the lookup back out and
    both must fail. Without this, a patch that quietly stopped emitting the
    ligature would leave 6,643 spurious meems and a green suite."""
    dest = _rewrite(tmp_path, _drop_flag_ligatures)
    assert stagger_ligatures(dest) == set()

    font = TTFont(str(dest))
    assert suppress_stagger_flags(font, "test") == len(STAGGER_FLAGS)


def _drop_flag_ligatures(font: TTFont) -> None:
    cmap = font.getBestCmap()
    pairs = {(cmap[tanween], cmap[meem]) for tanween, meem in STAGGER_FLAGS}
    for lookup in font["GSUB"].table.LookupList.Lookup:
        if lookup.LookupType != 4:
            continue
        for subtable in lookup.SubTable:
            ligatures = getattr(subtable, "ligatures", None)
            if not ligatures:
                continue
            for first in list(ligatures):
                kept = [
                    lig
                    for lig in ligatures[first]
                    if not lig.Component or (first, lig.Component[0]) not in pairs
                ]
                if kept:
                    ligatures[first] = kept
                else:
                    del ligatures[first]


# --- what a shaper actually draws ----------------------------------------
#
# Everything above reads the GSUB table. A ligature can be present, resolve to
# the right glyph and be referenced by rlig, and still never fire -- so these
# run the real shaper over real words and assert the glyphs that come out.

WAQF_SIGN = "\u06d8"

#: (label, text, codepoint, must the glyph be in the shaped output?)
SHAPED_CASES = [
    (
        "18:2 tanziilan, fathatan flag",
        "\u062a\u064e\u0646\u0632\u0650\u064a\u0644\u064b\u06ed\u0627",
        LOW_MEEM,
        False,
    ),
    (
        "2:41 musaddiqan, fathatan flag",
        "\u0645\u064f\u0635\u064e\u062f\u0651\u0650\u0642\u064b\u06ed\u0627",
        LOW_MEEM,
        False,
    ),
    (
        "2:2 hudan, fathatan flag",
        "\u0647\u064f\u062f\u064b\u06ed\u0649",
        LOW_MEEM,
        False,
    ),
    (
        "2:17 zulumaatin, kasratan flag",
        "\u0638\u064f\u0644\u064f\u0645\u064e\u0670\u062a\u064d\u06e2",
        HIGH_MEEM,
        False,
    ),
    (
        "2:41 kaafirin, kasratan IQLAB",
        "\u0643\u064e\u0627\u0641\u0650\u0631\u064d\u06ed",
        LOW_MEEM,
        True,
    ),
    (
        "18:15 bisultaanin, kasratan IQLAB",
        "\u0628\u0650\u0633\u064f\u0644\u0652\u0637\u064e\u0670\u0646\u064d\u06ed",
        LOW_MEEM,
        True,
    ),
    ("19:4 akun, noon IQLAB", "\u0623\u064e\u0643\u064f\u0646\u06e2", HIGH_MEEM, True),
    (
        "2:26 waqf lazim",
        "\u0645\u064e\u062b\u064e\u0644\u064b\u06ed\u0627 " + WAQF_SIGN,
        WAQF_LAZIM,
        True,
    ),
]


@cache
def _sfnt(path: Path) -> str:
    """A path HarfBuzz can open.

    It cannot read a compressed woff2, so the web font is decompressed to a
    plain sfnt first -- which is what a browser does before shaping it too.
    The tables under test are carried through untouched, so this still
    exercises the bytes we ship rather than a rebuilt font.
    """
    font = TTFont(str(path))
    if font.flavor is None:
        return str(path)
    font.flavor = None
    handle, plain = tempfile.mkstemp(suffix=".ttf")
    os.close(handle)
    font.save(plain)
    return plain


def _shaped_glyph_names(path: Path, text: str) -> list[str]:
    import uharfbuzz as hb

    font = TTFont(str(path))
    order = font.getGlyphOrder()
    shaper = hb.Font(hb.Face(hb.Blob.from_file_path(_sfnt(path))))
    buffer = hb.Buffer()
    buffer.add_str(text)
    # Script, direction and language from the text itself, exactly as a real
    # text engine does -- pinning them by hand here could assert a pass under
    # a configuration the apps never use.
    buffer.guess_segment_properties()
    hb.shape(shaper, buffer, {})
    return [order[info.codepoint] for info in buffer.glyph_infos]


@pytest.mark.parametrize("path", SHIPPED, ids=lambda p: p.name)
@pytest.mark.parametrize(
    ("label", "text", "codepoint", "present"),
    SHAPED_CASES,
    ids=[case[0] for case in SHAPED_CASES],
)
def test_the_shaper_draws_a_meem_only_where_the_mushaf_draws_one(
    path: Path, label: str, text: str, codepoint: int, present: bool
) -> None:
    """The flags must leave no glyph, the iqlab meems and the waqf sign must.

    The two populations use the same characters and differ only by which side
    the meem sits on, so each case is named for the ayah it came from and what
    the KFGQPC mushaf page font draws there -- checked by rendering those
    pages' own glyphs, not by reading the rule back off our own constant.
    """
    font = TTFont(str(path))
    glyph = font.getBestCmap()[codepoint]
    names = _shaped_glyph_names(path, text)
    assert (glyph in names) is present, (
        f"{path.name}: {label}: U+{codepoint:04X} ({glyph}) "
        f"{'missing from' if present else 'still in'} {names}"
    )


@pytest.mark.parametrize("path", SHIPPED, ids=lambda p: p.name)
def test_the_shaped_iqlab_meem_clears_the_kasratan(path: Path) -> None:
    """Both marks hang off the base's one below anchor and the font has no mkmk
    entry for either, so nothing but this anchor keeps them apart. At the old
    y820 they overlapped by 44.5% of the meem's ink; the bounding boxes have to
    be disjoint, or the fix renders two marks as one blob."""
    import uharfbuzz as hb
    from fontTools.pens.boundsPen import BoundsPen

    font = TTFont(str(path))
    glyphs = font.getGlyphSet()
    order = font.getGlyphOrder()
    cmap = font.getBestCmap()
    meem, kasratan = cmap[LOW_MEEM], cmap[KASRATAN]

    shaper = hb.Font(hb.Face(hb.Blob.from_file_path(_sfnt(path))))
    buffer = hb.Buffer()
    buffer.add_str("\u0643\u064e\u0627\u0641\u0650\u0631\u064d\u06ed")  # 2:41 kaafirin
    buffer.guess_segment_properties()
    hb.shape(shaper, buffer, {})

    boxes: dict[str, tuple[float, float]] = {}
    x = y = 0
    for info, position in zip(buffer.glyph_infos, buffer.glyph_positions, strict=True):
        name = order[info.codepoint]
        pen = BoundsPen(glyphs)
        glyphs[name].draw(pen)
        if pen.bounds and name in (meem, kasratan):
            boxes[name] = (
                pen.bounds[1] + y + position.y_offset,
                pen.bounds[3] + y + position.y_offset,
            )
        x += position.x_advance
        y += position.y_advance

    assert set(boxes) == {meem, kasratan}, f"{path.name}: shaped {sorted(boxes)}"
    meem_top, kasratan_bottom = boxes[meem][1], boxes[kasratan][0]
    assert meem_top < kasratan_bottom, (
        f"{path.name}: the meem's top ({meem_top:.0f}) is not below the "
        f"kasratan's bottom ({kasratan_bottom:.0f}) -- the two marks collide"
    )
