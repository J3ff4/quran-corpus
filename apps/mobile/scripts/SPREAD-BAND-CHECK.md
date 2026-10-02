# Spread band check

Generated for phase S4b, 2026-10-01, from `src/mushaf/pageMetrics.generated.ts`
(the same 604 `widestEm` values the app scales from) and the formula in
`src/mushaf/pageScale.ts`. The assertions below are also a test --
`mushafLeafFontSize > keeps every leaf inside the cap at both shipping
half-boxes` -- so this file is the readable evidence, not the gate.

## What the band actually is

The plan called for every half-box scale to land inside "the 11.91-18.17em
render band". Those two numbers are the minimum and maximum of
`MUSHAF_PAGE_WIDEST_EM`: each page's widest line measured in em. They are
constants of the page's own content and do not move when the box does, so a
computed scale can neither enter nor leave that range -- asserting against it
would have passed for any implementation (ruling R-X3).

The real ceiling is `MUSHAF_MAX_FONT_SIZE = 40`. Above roughly 44px Android
drops pieces of these whole-word QCF outlines, which looks like a missing font
rather than an oversized one (M7b device run). Halving the box *lowers* the type
size, so a spread moves away from that ceiling rather than toward it. The risk a
spread actually carries is the opposite one -- type too small to read -- so the
floor below is the phone's own measured range, 18-28dp at 328dp of text width.

## Every leaf, both shipping boxes

`available` is half the box, less `MushafPage`'s 16dp margins either side. A
leaf's size is the smaller of its two pages' fits (ruling R-X4), which is the
number both halves draw at.

| Box | available (dp) | min | median | max | leaves at the 40dp cap | leaves over the cap |
|---|---|---|---|---|---|---|
| Tab S10+ landscape (1400dp box) | 668 | 36.2 | 40.0 | 40.0 | 298 / 302 | **0** |
| Fold outer landscape (939dp box) | 437 | 23.7 | 27.3 | 35.8 | 0 / 302 | **0** |
| phone portrait, for reference (360dp box) | 328 | 17.8 | 20.5 | 26.9 | 0 / 302 | **0** |

No leaf exceeds the cap at either shipping box, and none falls below 23.7dp —
comfortably above the 17.8-26.9dp the phone has always drawn at. The spread is
therefore strictly inside the band, with room at both ends.

For contrast, the phone row is a single page in a 360dp box, not a half-box: it
is there so the landscape numbers can be read against what the owner has been
reading on all along. A tablet half-page is larger type than a phone page.

## Where the shared leaf size bites

4 of 302 leaves have two pages whose own fits differ at the Tab S10+ half-box,
so on those the shared size is doing visible work: without it the two halves of
one leaf would draw at different sizes in identical boxes. Four is few, and it
is exactly why the mechanism needs a test rather than an eyeball — at this box
298 of 302 leaves have both pages clamped at the cap, so a spot check almost
anywhere in the book would show no difference at all. Their rectos: 27, 177, 399, 443.

## What this file cannot see

Nothing here proves a glyph rendered. The metrics are the source layout's
measurements, and a dropped whole-word outline is a device observation —
check 606 on the device run, over 20 sampled pages including the 54 that carry
header or bismillah line gaps.
