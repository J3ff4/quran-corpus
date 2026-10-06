"""Repair the small low meem in KFGQPC HAFS Uthmanic Script.

`uni06ED` (ARABIC SMALL LOW MEEM) ships with the *high* meem's outline --
bbox y 49..760, identical to `uni06E2` -- assigned to the below-mark class
but carrying a null MarkAnchor of (0, 0). HarfBuzz therefore lands the
glyph's origin on the base's below anchor and draws 760 units straight up
through the letter. That is the stray meem the reader showed on 2,875 of
the 6,236 ayahs: every tanween in the Uthmani text that carries this mark.

KFGQPC v2.2 carries the identical defect in the identical nine lookups, so
there is no upgrade out of it, and RN cannot fall back per-character inside
one `Text` run without splitting the run and breaking Arabic shaping on
Android. Giving the mark a real anchor is the whole fix: outlines, cmap and
mark classes are untouched.

The font's EULA forbids modification; shipping a patched copy is an
explicit owner decision (2026-10-06), recorded in the About credits.

The pre-patch files, for anyone checking our copies against upstream:

    4dc526f256acaf448436574e6d8904e994d868c51c9cd9e02b02bb751c001098
        apps/mobile/assets/fonts/hafs.ttf       (KFGQPC v0.18, 237,120 bytes)
    8c00e7a7d5f773bcfb1642fdcfba505dbd81975fef39f14718827a32d075020c
        apps/web/src/app/fonts/hafs.18.woff2    (the same font, subsetted)

Both re-save byte-for-byte identical outlines, cmap, glyph order and name
table; exactly 9 of the 361 mark records move, all of them U+06ED's.
"""

from pathlib import Path

from fontTools.ttLib import TTFont

LOW_MEEM = 0x06ED

#: What the font ships with -- a null anchor, which is the defect.
UNPATCHED = (0, 0)

#: Where the mark belongs. x191 is the glyph's own horizontal centre
#: ((14 + 369) / 2); y820 sits above the glyph's top (760) so the whole
#: outline hangs *below* the base's anchor. Tuned against the hardest case,
#: kasratan + meem (99 ayahs): `uni06ED` is absent from the mkmk lookup, so
#: two below-marks on one base cannot separate themselves. At y773 -- the
#: value that aligns the meem's top with kasra's -- the two collide; y820
#: clears them by the same gap an independent font (me_quran) leaves.
PATCHED = (191, 820)

_MARK_TO_BASE = 4


def mark_records(font: TTFont, label: str) -> list:
    """Every MarkBasePos record that positions the low meem.

    Nine of them in both v0.18 and v2.2: the font repeats the mark array per
    base-coverage group, so patching one lookup fixes only the bases in that
    group and leaves the mark broken everywhere else.

    `label` names the font in the error messages -- a path, not the reader's
    internals, so this works on a font that was built rather than opened.
    """
    glyph = font.getBestCmap().get(LOW_MEEM)
    if glyph is None:
        raise ValueError(f"{label}: no glyph for U+06ED")

    records = []
    for lookup in font["GPOS"].table.LookupList.Lookup:
        if lookup.LookupType != _MARK_TO_BASE:
            continue
        for subtable in lookup.SubTable:
            glyphs = subtable.MarkCoverage.glyphs
            if glyph in glyphs:
                records.append(subtable.MarkArray.MarkRecord[glyphs.index(glyph)])
    if not records:
        raise ValueError(f"{label}: U+06ED attaches to no base")
    return records


def low_meem_anchors(path: Path) -> list[tuple[int, int]]:
    """The low meem's mark anchor in every lookup that positions it."""
    font = TTFont(str(path))
    return [
        (r.MarkAnchor.XCoordinate, r.MarkAnchor.YCoordinate)
        for r in mark_records(font, path.name)
    ]


def patch_low_meem(path: Path) -> int:
    """Move the low meem's anchor to `PATCHED`, in place. Returns lookups changed.

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

    changed = 0
    for record in records:
        if (record.MarkAnchor.XCoordinate, record.MarkAnchor.YCoordinate) == PATCHED:
            continue
        record.MarkAnchor.XCoordinate, record.MarkAnchor.YCoordinate = PATCHED
        changed += 1
    if changed:
        font.save(str(path))
    return changed
