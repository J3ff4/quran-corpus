"""Repair the two meem defects in KFGQPC HAFS Uthmanic Script.

The Uthmani text uses a small meem next to a tanween for two unrelated jobs,
and this font renders neither correctly.

**The staggering flag (6,643 marks, not meems at all).** The Madani mushaf
draws a tanween *staggered* (mutarakkib) when the next word begins with an
idgham or ikhfa letter, and *stacked* (mutatabiq) otherwise. Unicode has no
staggered tanween, so the source encodes the distinction by appending the
meem from the side the tanween does not occupy -- U+06ED below a fathatan or
dammatan, U+06E2 above a kasratan. It is a presentation flag, and a font is
meant to swallow it into a staggered glyph. This font has no staggered
tanween glyph and no ligature for the sequence, so the flag falls through
and draws a literal meem that the mushaf does not have. Verified against the
KFGQPC page fonts we already ship for the mushaf tab: 2:2 `hudan` and 2:17
`zulumaatin` both carry the flag and neither draws a meem.

**The iqlab meem (609 marks, genuine).** Before a beh the noon sound becomes
a meem, and the mushaf marks it with a real small meem on the tanween's *own*
side -- U+06ED below a kasratan, U+06E2 above a fathatan or dammatan, and
U+06E2 above a plain noon. These must render. U+06E2's anchors are sound;
U+06ED ships with the *high* meem's outline (bbox y 49..760, identical to
U+06E2), assigned to the below-mark class but carrying a null MarkAnchor of
(0, 0). HarfBuzz lands the origin on the base's below anchor and draws the
glyph 760 units straight up through the letter. That is the stray meem the
reader showed.

So the repair is two edits, and the side a meem sits on is the whole rule:

* a GSUB `rlig` ligature consumes each flag pair back to the bare tanween;
* U+06ED gets a real anchor, tuned for the one case that survives the
  ligature -- kasratan + meem, which has to clear the kasratan's own strokes.

Nothing else moves. U+06D8 (SMALL HIGH MEEM INITIAL FORM, the waqf lazim
sign, 22 of them) is a different codepoint that always follows a space, and
the 270 iqlab meems after a plain noon are not a tanween pair, so neither can
match a ligature keyed on exact tanween+meem pairs.

KFGQPC v2.2 carries the identical anchor defect in the identical nine
lookups, so there is no upgrade out of it, and RN cannot fall back
per-character inside one `Text` run without splitting the run and breaking
Arabic shaping on Android.

The font's EULA forbids modification; shipping a patched copy is an explicit
owner decision (2026-10-06), recorded in the About credits.

The pre-patch files, for anyone checking our copies against upstream:

    4dc526f256acaf448436574e6d8904e994d868c51c9cd9e02b02bb751c001098
        apps/mobile/assets/fonts/hafs.ttf       (KFGQPC v0.18, 237,120 bytes)
    8c00e7a7d5f773bcfb1642fdcfba505dbd81975fef39f14718827a32d075020c
        apps/web/src/app/fonts/hafs.18.woff2    (the same font, subsetted)

Both re-save byte-for-byte identical `glyf`, `name`, `post` and glyph order,
and an identical cmap *mapping*; exactly 10 of the 402 mark-attachment
records move, all of them U+06ED's, and one lookup is appended to GSUB.
The cmap, head, GSUB and GPOS tables do re-serialize (cmap 668 -> 556
bytes, because fontTools shares one offset between the two identical
format-4 subtables; head's `modified` and `checkSumAdjustment` always
change), so a licence audit should diff the mapping and the outlines, not
the table bytes.
"""

from pathlib import Path
from typing import NamedTuple

from fontTools.ttLib import TTFont
from fontTools.ttLib.tables import otTables

LOW_MEEM = 0x06ED
HIGH_MEEM = 0x06E2

FATHATAN = 0x064B
DAMMATAN = 0x064C
KASRATAN = 0x064D

#: Tanween + the meem from the side the tanween does *not* occupy. Never a
#: meem: the mushaf draws a staggered tanween here and no mark at all. Keyed
#: as exact codepoint pairs so nothing else can match -- in particular not
#: U+06D8 (waqf lazim, always after a space) and not U+06E2 after a plain
#: noon (iqlab, 270 of them), both of which must keep rendering.
STAGGER_FLAGS = (
    (FATHATAN, LOW_MEEM),
    (DAMMATAN, LOW_MEEM),
    (KASRATAN, HIGH_MEEM),
)

#: What the font ships with -- a null anchor, which is the defect.
UNPATCHED = (0, 0)

#: Where the mark belongs. x191 is the glyph's own horizontal centre
#: ((14 + 369) / 2). y is measured against the *only* sequence that still
#: reaches this anchor once the flags are ligated away: kasratan + meem, the
#: 99 iqlab words. Both marks hang off the base's single below anchor, so the
#: meem has to clear the kasratan's strokes on its own -- the kasratan ends
#: 413 units below that anchor and the meem's outline tops out at 760, so the
#: gap is `y - 1173` and the two touch at anything below y1173. y1320 leaves
#: 147 units, the same order of gap the mushaf's own page glyphs show, and is
#: the shallowest value measured collision-free (0% rasterised ink overlap
#: against every other glyph in the word) across all five tanween contexts.
PATCHED = (191, 1320)

#: MarkBasePos and MarkLigPos. U+06ED sits in both: nine mark-to-base
#: lookups and one mark-to-ligature lookup over the `Allah` ligature. No
#: corpus word puts a low meem on that ligature today, but a null anchor left
#: there is the same defect waiting for one.
_MARK_ATTACH = (4, 5)
_LIGATURE = 4
_RLIG = "rlig"


class PatchResult(NamedTuple):
    """What a run actually changed, so a re-run can report "already patched"."""

    anchors: int
    ligatures: int

    @property
    def changed(self) -> bool:
        return bool(self.anchors or self.ligatures)


def mark_records(font: TTFont, label: str, codepoint: int = LOW_MEEM) -> list:
    """Every mark-attachment record that positions `codepoint`.

    Ten for the low meem in both v0.18 and v2.2: the font repeats the mark
    array per base-coverage group (nine MarkBasePos lookups) and once more for
    the ligature (one MarkLigPos), so patching one lookup fixes only the bases
    in that group and leaves the mark broken everywhere else.

    `label` names the font in the error messages -- a path, not the reader's
    internals, so this works on a font that was built rather than opened.
    """
    glyph = font.getBestCmap().get(codepoint)
    if glyph is None:
        raise ValueError(f"{label}: no glyph for U+{codepoint:04X}")

    records = []
    for lookup in font["GPOS"].table.LookupList.Lookup:
        if lookup.LookupType not in _MARK_ATTACH:
            continue
        for subtable in lookup.SubTable:
            glyphs = subtable.MarkCoverage.glyphs
            if glyph in glyphs:
                records.append(subtable.MarkArray.MarkRecord[glyphs.index(glyph)])
    if not records:
        raise ValueError(f"{label}: U+{codepoint:04X} attaches to no base")
    return records


def low_meem_anchors(path: Path) -> list[tuple[int, int]]:
    """The low meem's mark anchor in every lookup that positions it."""
    font = TTFont(str(path))
    return [
        (r.MarkAnchor.XCoordinate, r.MarkAnchor.YCoordinate)
        for r in mark_records(font, path.name)
    ]


def _flag_pairs(font: TTFont, label: str) -> list[tuple[str, str]]:
    """`STAGGER_FLAGS` as glyph names, or a clear error naming what is absent."""
    cmap = font.getBestCmap()
    pairs = []
    for tanween, meem in STAGGER_FLAGS:
        for codepoint in (tanween, meem):
            if codepoint not in cmap:
                raise ValueError(f"{label}: no glyph for U+{codepoint:04X}")
        pairs.append((cmap[tanween], cmap[meem]))
    return pairs


def ligatures(font: TTFont):
    """Every two-glyph GSUB ligature, as (lookup index, first, second, result)."""
    for index, lookup in enumerate(font["GSUB"].table.LookupList.Lookup):
        if lookup.LookupType != _LIGATURE:
            continue
        for subtable in lookup.SubTable:
            for first, entries in getattr(subtable, "ligatures", {}).items():
                for ligature in entries:
                    if len(ligature.Component) == 1:
                        yield index, first, ligature.Component[0], ligature.LigGlyph


def rlig_lookups(font: TTFont) -> set[int]:
    """Lookup indices some `rlig` feature record references -- the ones that fire."""
    return {
        index
        for record in font["GSUB"].table.FeatureList.FeatureRecord
        if record.FeatureTag == _RLIG
        for index in record.Feature.LookupListIndex
    }


def stagger_ligatures(path: Path) -> set[tuple[str, str, str]]:
    """Every (first, component, result) our flag-suppressing lookup provides.

    Read back from the saved font rather than from `STAGGER_FLAGS`, so a test
    asserting the font carries them is not just re-reading the constant it is
    supposed to be checking.
    """
    font = TTFont(str(path))
    wanted = {first for first, _ in _flag_pairs(font, path.name)}
    return {
        (first, second, result)
        for _, first, second, result in ligatures(font)
        if first in wanted
    }


def suppress_stagger_flags(font: TTFont, label: str) -> int:
    """Ligate each tanween+flag pair back to the bare tanween. Returns pairs added.

    Idempotent: a font that already carries all three is left alone. "Carries"
    means the pair resolves to the bare tanween *in a lookup rlig fires* -- a
    ligature to some other glyph, or one no feature references, is not ours
    and does not count as done. The lookup goes into `rlig`, which is on by
    default for Arabic and runs before GPOS, so the flag is gone before any
    mark anchor is consulted.
    """
    pairs = _flag_pairs(font, label)
    firing = rlig_lookups(font)
    have = {
        (first, second)
        for index, first, second, result in ligatures(font)
        if result == first and index in firing
    }
    missing = [(first, meem) for first, meem in pairs if (first, meem) not in have]
    if not missing:
        return 0

    subtable = otTables.LigatureSubst()
    subtable.ligatures = {}
    for first, meem in missing:
        ligature = otTables.Ligature()
        ligature.Component = [meem]
        ligature.CompCount = 2
        # The tanween alone: the flag is consumed and nothing is drawn for it.
        ligature.LigGlyph = first
        subtable.ligatures.setdefault(first, []).append(ligature)

    lookup = otTables.Lookup()
    lookup.LookupType = _LIGATURE
    lookup.LookupFlag = 0
    lookup.SubTable = [subtable]
    lookup.SubTableCount = 1

    gsub = font["GSUB"].table
    gsub.LookupList.Lookup.append(lookup)
    index = len(gsub.LookupList.Lookup) - 1
    gsub.LookupList.LookupCount = len(gsub.LookupList.Lookup)

    registered = 0
    for record in gsub.FeatureList.FeatureRecord:
        if record.FeatureTag != _RLIG:
            continue
        record.Feature.LookupListIndex.append(index)
        record.Feature.LookupCount = len(record.Feature.LookupListIndex)
        registered += 1
    if not registered:
        raise ValueError(f"{label}: no {_RLIG} feature to hang the lookup on")
    return len(missing)


def patch_low_meem(path: Path) -> PatchResult:
    """Apply both repairs in place. Returns what changed.

    Idempotent: re-running on an already-patched font is a no-op, so the
    command can be re-run after a font upgrade without stacking offsets. An
    anchor that is neither the shipped defect nor our fix means the font was
    replaced by something this patch was never measured against -- refuse,
    rather than silently re-aim a mark in a font we have not looked at.
    """
    font = TTFont(str(path))
    records = mark_records(font, path.name)
    anchors = {(r.MarkAnchor.XCoordinate, r.MarkAnchor.YCoordinate) for r in records}
    unknown = anchors - {UNPATCHED, PATCHED}
    if unknown:
        raise ValueError(
            f"{path.name}: unexpected U+06ED anchor(s) {sorted(unknown)}; "
            f"expected {UNPATCHED} (unpatched) or {PATCHED} (already patched)"
        )

    moved = 0
    for record in records:
        if (record.MarkAnchor.XCoordinate, record.MarkAnchor.YCoordinate) == PATCHED:
            continue
        record.MarkAnchor.XCoordinate, record.MarkAnchor.YCoordinate = PATCHED
        moved += 1

    added = suppress_stagger_flags(font, path.name)
    result = PatchResult(anchors=moved, ligatures=added)
    if result.changed:
        font.save(str(path))
    return result
