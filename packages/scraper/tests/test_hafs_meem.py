"""The low-meem anchor repair, and a guard on the fonts we actually ship."""

from collections.abc import Callable
from pathlib import Path

import pytest
from fontTools.ttLib import TTFont

from scraper.hafs_meem import (
    LOW_MEEM,
    PATCHED,
    UNPATCHED,
    low_meem_anchors,
    mark_records,
    patch_low_meem,
)

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
    assert seen == {(375, 460), UNPATCHED}


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

    assert patch_low_meem(font) == 9
    assert set(low_meem_anchors(font)) == {PATCHED}


def test_patch_is_idempotent(tmp_path: Path) -> None:
    """Re-running after a font upgrade must not stack offsets."""
    font = _rewrite(tmp_path, lambda _: None)

    assert patch_low_meem(font) == 0  # the shipped copy is already patched
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
