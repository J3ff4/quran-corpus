# Phase M7c — Paged Mushaf UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn M7b's imported layout and 604 page fonts into the reader's mushaf mode — a 604-page RTL pager drawing real KFGQPC pages with their chrome — and make translation mode ayah-by-ayah with the translation toggleable.

**Architecture:** One horizontal `FlatList` over pages 1..604 (`pagingEnabled`, `inverted` for RTL). Each page is a pure composition: `mushaf_layout` rows → 15 line slots → glyph `Text` runs plus chrome (surah band, bismillah, footer). Per-page font size is derived from precomputed font metrics, not measured at runtime. Highlights are per-word `Text` colour, which M7a proved safe for pre-shaped glyphs.

**Tech Stack:** React Native 0.86 / Expo 57, `expo-font` runtime registration, `react-native-svg` for ornaments, `react-native-reanimated` 4.5 for the landing pulse, `fontTools` (already a `packages/scraper` dep) for the metric extraction. **No new dependency.** A horizontal `FlatList` is the pager — `react-native-pager-view` would be a §12 question and buys nothing here.

**Spec:** `docs/plans/phase-m7-paged-mushaf.md` (24 owner rulings), `docs/plans/phase-m7a-mushaf-spike.md` §6, `docs/plans/phase-m7b-mushaf-import.md`.

---

## Global Constraints

- **Model A navigation.** ONE 604-page pager. A surah is an entry point, not a boundary. 51 pages hold more than one surah. Settled — do not reopen (ruling 10).
- **Paged replaces scroll outright.** `MushafAyah.tsx` and its test are DELETED (ruling 6). `rowHeightModel.ts` SURVIVES — translation mode still uses it.
- **Page turn is RTL**: swipe right-to-left advances, like the book (ruling 7).
- **Chevrons jump to the previous/next surah's first page**, not the previous/next page (ruling 11).
- **No control chrome on the page.** Tap a word → the existing `WordSheet`; the sheet carries the ayah actions (ruling 4).
- **No POS colour on the page.** Print has no grammar colouring (ruling 13).
- **Three highlight states coexist**: bookmark = persistent faint warm wash; landing = stronger pulse that fades; audio = accent tint that moves and auto-turns the page (rulings 17, 18, 19, 20).
- **TalkBack is per ayah**, labelled with real Uthmani text + ayah number. Lines are hidden from the reader — glyph codes are private-use characters and read as gibberish (ruling 12).
- **Reduced motion keeps a shortened page-turn slide**, not a cut. Owner override of CLAUDE.md §8 and WCAG AA, page-turn only, not a precedent (ruling 24). Every OTHER animation in this phase still honours `useReducedMotion` normally.
- **Reading position stores the page**, displayed as the surah/ayah that page opens with (ruling 15). This is the fix for issue #59.
- **Page-number ornament is `medallion-1` as a marked stand-in** (ruling 23, re-confirmed by the owner 2026-09-08). The PR body must say so, so review does not read it as final.
- **Surah band is our own `Sura_border`**, the same arabesque web's `SurahFrame` draws — not KFGQPC's surah-name font (ruling 21).
- Font family per page is `QCF2{page:03d}`; `MUSHAF_PAGE_MIN`/`MAX` are 1/604 and come from `@quran-corpus/data/mobile`.
- Any `packages/data` query change, and the user-DB migration in Task 9, are **§5 `/code-review` triggers**. The user DB survives app updates: **every migration is additive only.**
- `apps/mobile` imports `@quran-corpus/data/mobile`, never the barrel (§2).

---

## Findings that shape the design

Derived from the live corpus (`apps/web/quran.db`) and the 604 bundled fonts before this plan was written. These are measurements, not assumptions; each has a task that re-asserts it as a test.

### 1. The layout has NO rows for surah headers or bismillah lines — and where they go is fully derivable

8,820 word lines exist across 604 pages. Missing line slots: **128 interior, 80 leading, 32 trailing.**

Every one of the 114 surah starts is preceded by a run of missing lines, and the run is **1 or 2 lines, never anything else**:

| Run before a surah start | Count | Meaning |
|---|---|---|
| 2 lines | 94 surahs | header band + bismillah, both on this page |
| 1 line | 20 surahs | see below |

The 20 one-line cases split cleanly:

- **18 of them** have the *previous* page's line 15 free. The header band sits at the bottom of the previous page and the single gap line on this page is the bismillah. Surahs 4, 10, 22, 23, 24, 26, 27, 32, 33, 37, 38, 45, 47, 53, 60, 64, 65, 80 — pages 76, 207, 331, 341, 349, 366, 376, 414, 417, 445, 452, 498, 506, 525, 548, 555, 557, 584 carry those bands.
- **Surah 9** (page 187) genuinely has no bismillah.
- **Surah 1** (page 1) — its bismillah *is* ayah 1, so it is a word line.

**Closure check, and this is what makes the rule trustworthy:** trailing gaps exist on exactly 20 pages. Two of them are pages 1 and 2 (the short opening panels, 7 free lines each). The other **18 are exactly the 18 pages that carry a next-page surah's header band.** Nothing is left over in either direction, and **0 gap slots anywhere are unexplained by a following surah start.**

### 2. QCF V2 lines are pre-justified, so centring every line is correct AND removes a heuristic

Per-line advance widths within a page (em, upm 2500):

```
page  46: 15.59 15.44 15.54 15.49 15.60 15.51 15.50 15.57 15.64 15.50 15.76 15.66 15.69 15.59 15.56   spread 0.32 em
page 300: 15.58 15.62 15.53 15.54 15.58 15.63 15.46 15.37 15.48 15.62 15.55 15.44 15.58 15.49 15.58   spread 0.26 em
page 604: 15.30  8.60 15.31 15.37  8.58 15.44 15.44 10.53  7.85                                       spread 7.59 em
```

Across all 8,820 lines, **8,732 (99.0%) sit within 5% of their page's widest line.** The 88 that do not are the last line of a surah, which print centres anyway.

So: **centre every line, always.** A full line is at most 2% narrower than the widest, which centred leaves ~3dp of slack per side — invisible. Short final lines are then correctly centred for free. There is no width threshold to tune and no class of line to misclassify. Do not add one.

### 3. The per-page scale is a precomputed number, and its range is safe

`widestLineEm` per page ranges **11.91 (page 2) to 18.17 (page 443)**, median **15.73**. On a 360dp phone with 16dp margins (328dp of text width) that is a font size of **18.1dp to 27.5dp**.

M7b found Android drops pieces of these whole-word glyphs at 44px on some pages. **Every size this formula produces is well under that**, which is the reason the cap in Task 3 is a guard rail rather than an active constraint — but it is still asserted, and Task 13 checks the two known-awkward pages on device.

`widestLineEm` cannot be measured at runtime (RN cannot measure text without rendering it) and must not be guessed. Task 2 extracts it from the shipped fonts.

### 4. Reading position is already ayah-shaped, and that is issue #59's bug

`reading_history` is `(id=1, surah_id, ayah_number)`. `src/data/readerPosition.ts` is an in-memory singleton that documents itself as deliberately *not* the durable value. The durable write hangs off `SurahReader`'s scroll handler, which in a pager never fires. Ruling 15 replaces the write point with the page turn, which is unambiguous.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `packages/scraper/scraper/mushaf_metrics.py` | Widest-line advance per page, from the subset TTFs + layout rows. Pure; no network. |
| `apps/mobile/src/mushaf/pageMetrics.generated.ts` | 604 numbers, committed. Generated by the CLI above. |
| `apps/mobile/src/mushaf/pageComposition.ts` | `MushafLine[]` → 15 typed slots (`header` \| `bismillah` \| `words` \| `blank`). Pure. The Finding-1 rule lives here and nowhere else. |
| `apps/mobile/src/mushaf/pageScale.ts` | `fontSize` from width + metrics + cap; `lineHeight` from height. Pure. |
| `apps/mobile/src/mushaf/highlights.ts` | The three highlight states → a colour per ayah. Pure. |
| `apps/mobile/src/mushaf/useMushafPage.ts` | Page rows + font readiness for one page. |
| `apps/mobile/src/components/mushaf/MushafLineRow.tsx` | One line: glyph words in one `Text`, per-word nested `Text` for highlight and tap. |
| `apps/mobile/src/components/mushaf/SurahBand.tsx` | The arabesque header band with the surah name. |
| `apps/mobile/src/components/mushaf/BismillahLine.tsx` | The centred bismillah line, in the page's own font. |
| `apps/mobile/src/components/mushaf/PageFooter.tsx` | Page-number ornament (stand-in) + juz. |
| `apps/mobile/src/components/mushaf/MushafPage.tsx` | Assembles composition + lines + chrome. Owns the per-ayah TalkBack grouping. |
| `apps/mobile/src/components/mushaf/MushafPager.tsx` | The 604-page RTL pager. |
| `packages/config/ornaments/surahBand.ts` | `Sura_border` geometry, shared with web (§3 DRY, ruling 21). |

**Modified**

| File | Change |
|---|---|
| `packages/scraper/scraper/cli.py` | New `mushaf-metrics` command. |
| `packages/data/src/userData.ts` | `reading_history.page` — additive migration + read/write. **§5 trigger.** |
| `apps/mobile/src/components/SurahReader.tsx` | Mushaf branch renders `MushafPager`. Translation branch gains the toggle. |
| `apps/mobile/src/components/ReaderHeader.tsx` | Translation toggle; fix for issue #58. |
| `apps/mobile/src/components/AyahCard.tsx` | Honours `showTranslation`. |
| `apps/mobile/src/settings/settingsStore.tsx` | `showTranslation: boolean`. |
| `apps/mobile/app/surah/[surahId].tsx` | Page-based position recording. |
| `apps/web/src/components/reader/ornaments/SurahFrame.tsx` | Consumes the extracted geometry instead of its inline path. |
| `apps/mobile/app/about.tsx` | KFGQPC + QUL attribution (ruling 9). |

**Deleted**

- `apps/mobile/src/components/MushafAyah.tsx` and `MushafAyah.test.tsx` (ruling 6).

---

## Task 1: Page composition

**Files:**
- Create: `apps/mobile/src/mushaf/pageComposition.ts`
- Test: `apps/mobile/src/mushaf/pageComposition.test.ts`

**Interfaces:**
- Consumes: `MushafLine`, `MushafWord` from `@quran-corpus/data/mobile`.
- Produces:
  ```ts
  export type PageSlot =
    | { kind: 'words'; line: number; words: MushafWord[] }
    | { kind: 'header'; line: number; surahId: number }
    | { kind: 'bismillah'; line: number }
    | { kind: 'blank'; line: number };
  export function composePage(page: number, lines: MushafLine[]): PageSlot[];
  ```

Pure, and the ONLY place Finding 1's rule exists. `composePage` returns exactly the slots for lines 1..maxLine, in order.

Rule, restated as code has to implement it: walk lines 1..15. A missing line is `blank` unless the next present line begins an ayah 1 position 1, in which case the run of missing lines before that start is chrome — 2 → `[header, bismillah]`, 1 → `bismillah` when the previous page ends early, else `header`. Trailing missing lines after the last present line are `blank`.

Two inputs cannot be derived from one page's own rows, and both are closed sets of 18 from Finding 1, so they are constants in this module rather than arguments the caller must know to pass:

- **`PAGES_WITH_HEADER_ON_PREVIOUS_PAGE`** — this page's single gap is a bismillah, because the band is on the previous page.
- **`TRAILING_BAND_SURAH`** — this page's line 15 carries the NEXT page's band, and names which surah. Without it a page ending early stops at its last word line and the band is never drawn at all.

- [x] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { composePage, PAGES_WITH_HEADER_ON_PREVIOUS_PAGE } from './pageComposition';

const w = (surahId: number, ayahNumber: number, position: number) => ({
  surahId, ayahNumber, position, charType: 'word' as const, glyph: '',
});

describe('composePage', () => {
  it('passes a full 15-line page through as words', () => {
    const lines = Array.from({ length: 15 }, (_, i) => ({ line: i + 1, words: [w(2, i + 1, 1)] }));
    const slots = composePage(50, lines);
    expect(slots).toHaveLength(15);
    expect(slots.every((s) => s.kind === 'words')).toBe(true);
  });

  it('fills a two-line gap before a surah start with a header and a bismillah', () => {
    // p106: lines 6-7 are missing, and line 8 starts surah 5.
    const lines = [
      { line: 5, words: [w(4, 176, 1)] },
      { line: 8, words: [w(5, 1, 1)] },
    ];
    const slots = composePage(106, lines);
    expect(slots.map((s) => `${s.line}:${s.kind}`)).toEqual([
      '1:blank', '2:blank', '3:blank', '4:blank',
      '5:words', '6:header', '7:bismillah', '8:words',
    ]);
    expect(slots[5]).toMatchObject({ kind: 'header', surahId: 5 });
  });

  it('gives surah 9 a header and no bismillah', () => {
    // p187 line 1 is the only gap, and 187 is not a header-on-previous-page page.
    const slots = composePage(187, [{ line: 2, words: [w(9, 1, 1)] }]);
    expect(slots.map((s) => s.kind)).toEqual(['header', 'words']);
  });

  it('gives a bismillah, not a header, when the band is on the previous page', () => {
    // p77 (surah 4): p76's line 15 carries the band, so p77's one gap is the
    // bismillah. Getting this backwards draws two headers and no bismillah.
    expect(PAGES_WITH_HEADER_ON_PREVIOUS_PAGE.has(77)).toBe(true);
    const slots = composePage(77, [{ line: 2, words: [w(4, 1, 1)] }]);
    expect(slots.map((s) => s.kind)).toEqual(['bismillah', 'words']);
  });

  it('leaves the tail of a short page blank', () => {
    const slots = composePage(1, [
      { line: 2, words: [w(1, 1, 1)] },
      { line: 3, words: [w(1, 2, 1)] },
    ]);
    expect(slots.map((s) => s.kind)).toEqual(['header', 'words', 'words']);
    // Nothing past the last word line: the page's own box centres what exists.
    expect(slots).toHaveLength(3);
  });

  it('draws the next page-s band on line 15 of a page that ends early', () => {
    // p76 ends at line 14; surah 4's band sits on its line 15, which is why
    // p77's own single gap is a bismillah. Without this the band vanishes.
    const lines = Array.from({ length: 14 }, (_, i) => ({ line: i + 1, words: [w(3, i + 1, 1)] }));
    const slots = composePage(76, lines);
    expect(slots).toHaveLength(15);
    expect(slots[14]).toMatchObject({ kind: 'header', line: 15, surahId: 4 });
  });

  it('never emits chrome for a gap that no surah start follows', () => {
    const slots = composePage(50, [
      { line: 1, words: [w(2, 5, 1)] },
      { line: 4, words: [w(2, 6, 1)] },
    ]);
    expect(slots.map((s) => s.kind)).toEqual(['words', 'blank', 'blank', 'words']);
  });
});
```

- [x] **Step 2: Run them and watch every one fail**

Run: `cd apps/mobile && npx vitest run src/mushaf/pageComposition.test.ts`
Expected: FAIL, "Failed to resolve import ./pageComposition".

- [x] **Step 3: Implement**

```ts
import type { MushafLine, MushafWord } from '@quran-corpus/data/mobile';

export const MUSHAF_LINES_PER_PAGE = 15;

export type PageSlot =
  | { kind: 'words'; line: number; words: MushafWord[] }
  | { kind: 'header'; line: number; surahId: number }
  | { kind: 'bismillah'; line: number }
  | { kind: 'blank'; line: number };

/**
 * The 18 pages whose NEXT page's surah band sits on their own line 15.
 *
 * Closed set, derived from the layout: trailing gaps exist on 20 pages, two of
 * which are the short opening panels (1 and 2); these are the other 18, and
 * they are exactly the pages preceding a surah whose own gap run is one line.
 * Without this, those 18 next-pages draw a header where the bismillah belongs
 * and lose the bismillah entirely.
 */
export const PAGES_WITH_HEADER_ON_PREVIOUS_PAGE: ReadonlySet<number> = new Set([
  77, 208, 332, 342, 350, 367, 377, 415, 418, 446, 453, 499, 507, 526, 549, 556, 558, 585,
]);

/**
 * Pages whose own line 15 carries the NEXT page's surah band, and which surah.
 *
 * The mirror of the set above, and the reason it is a Map: the band belongs to
 * a surah that has no words on this page at all, so nothing in this page's rows
 * can name it. A page here ends its words early -- without this entry the loop
 * would stop at that last word line and the band would simply never be drawn.
 */
export const TRAILING_BAND_SURAH: ReadonlyMap<number, number> = new Map([
  [76, 4], [207, 10], [331, 22], [341, 23], [349, 24], [366, 26], [376, 27],
  [414, 32], [417, 33], [445, 37], [452, 38], [498, 45], [506, 47], [525, 53],
  [548, 60], [555, 64], [557, 65], [584, 80],
]);

export function composePage(page: number, lines: MushafLine[]): PageSlot[] {
  const byLine = new Map(lines.map((l) => [l.line, l]));
  if (byLine.size === 0) return [];
  const trailingBandSurah = TRAILING_BAND_SURAH.get(page);
  // A trailing band sits past every word line, so the page runs to 15 here
  // even though its own rows stop earlier.
  const lastLine = trailingBandSurah === undefined
    ? Math.max(...byLine.keys())
    : MUSHAF_LINES_PER_PAGE;

  // Which line starts a surah, and which surah. A surah's first word is
  // ayah 1 position 1 -- position, not seq: seq is a place on a line.
  const startsSurah = new Map<number, number>();
  for (const line of lines) {
    const first = line.words.find((word) => word.ayahNumber === 1 && word.position === 1);
    if (first) startsSurah.set(line.line, first.surahId);
  }

  const slots: PageSlot[] = [];
  let line = 1;
  while (line <= lastLine) {
    const present = byLine.get(line);
    if (present) {
      slots.push({ kind: 'words', line, words: present.words });
      line += 1;
      continue;
    }

    // Walk to the end of THIS RUN of missing lines before deciding anything.
    // The run's length is what says whether the chrome is a band plus a
    // bismillah or a bismillah alone -- measuring from the current line
    // instead makes the second line of every two-line run look like a
    // one-line run, which draws two bands and no bismillah at all.
    let next = line + 1;
    while (next <= lastLine && !byLine.has(next)) next += 1;
    const runLength = next - line;
    const surahId = startsSurah.get(next);

    for (let offset = 0; offset < runLength; offset += 1) {
      const slotLine = line + offset;
      if (surahId === undefined) {
        // No surah starts after this run, so it is empty page -- except line
        // 15 of the 18 pages that carry the next page's band.
        slots.push(
          slotLine === MUSHAF_LINES_PER_PAGE && trailingBandSurah !== undefined
            ? { kind: 'header', line: slotLine, surahId: trailingBandSurah }
            : { kind: 'blank', line: slotLine },
        );
      } else if (runLength >= 2) {
        // Band then bismillah, both at the BOTTOM of the run: a longer run
        // (page 1 opens with one) keeps its extra lines blank above them.
        if (offset === runLength - 2) slots.push({ kind: 'header', line: slotLine, surahId });
        else if (offset === runLength - 1) slots.push({ kind: 'bismillah', line: slotLine });
        else slots.push({ kind: 'blank', line: slotLine });
      } else {
        slots.push(
          PAGES_WITH_HEADER_ON_PREVIOUS_PAGE.has(page)
            ? { kind: 'bismillah', line: slotLine }
            : { kind: 'header', line: slotLine, surahId },
        );
      }
    }
    line = next;
  }
  return slots;
}
```

- [x] **Step 4: Run the tests**

Run: `npx vitest run src/mushaf/pageComposition.test.ts`
Expected: PASS, 7 tests.

- [x] **Step 5: Assert the rule against the REAL layout, not just fixtures**

A fixture test proves the function does what the fixture says. It cannot prove the fixture matches 604 real pages. Write a script and run it once; paste its output into the plan's verification log.

```bash
cd packages/scraper && uv run python - <<'PY'
import sqlite3
from collections import defaultdict
con = sqlite3.connect("../../apps/web/quran.db")
present = defaultdict(set)
for p, l in con.execute("SELECT DISTINCT page, line FROM mushaf_layout"):
    present[p].add(l)
starts = {(p, l) for p, l in con.execute(
    "SELECT page, line FROM mushaf_layout WHERE ayah_number = 1 AND position = 1")}
bad = []
for p, ls in present.items():
    hi = max(ls)
    for l in range(1, hi + 1):
        if l in ls:
            continue
        nxt = l + 1
        while nxt <= hi and nxt not in ls:
            nxt += 1
        if (p, nxt) not in starts:
            bad.append((p, l))
print("interior/leading gap slots with no following surah start:", len(bad), bad[:10])
PY
```

Expected: `0 []`. Anything else means the rule is wrong for some page and Step 3 must change, not the test.

Then run `composePage` itself over all 604 pages and check the three totals it must produce. These numbers were verified against the live corpus while this plan was written, and an implementation that does not reproduce them is wrong no matter how many unit tests it passes:

| Total | Expected | What a miss means |
|---|---|---|
| Surahs with exactly one header band | **114** | A surah is unheaded, or headed twice |
| Bismillah lines | **112** | 114 minus surah 1 (its bismillah is ayah 1) and surah 9 (it has none) |
| Bands drawn on line 15 | **18** | The trailing-band set is not firing |

The first draft of this very function scored 114/**18**/18 — it measured the gap from the current line instead of from the start of the run, so the second line of every two-line gap looked like a one-line gap and drew a second band instead of the bismillah. The unit tests above all passed. **Run the totals.**

- [x] **Step 6: Mutation-check the header/bismillah swap**

Flip `PAGES_WITH_HEADER_ON_PREVIOUS_PAGE.has(page)` to `false` and re-run. The "band is on the previous page" test MUST fail. Restore by re-editing — **never `git checkout` a mutation edit.**

- [x] **Step 7: Commit**

```bash
git add apps/mobile/src/mushaf/pageComposition.ts apps/mobile/src/mushaf/pageComposition.test.ts
git commit -m "feat(mobile/mushaf): derive a page's header and bismillah lines from its gaps"
```

---

## Task 2: Per-page font metrics

**Files:**
- Create: `packages/scraper/scraper/mushaf_metrics.py`
- Create: `packages/scraper/tests/test_mushaf_metrics.py`
- Modify: `packages/scraper/scraper/cli.py` (new `mushaf-metrics` command)
- Create: `apps/mobile/src/mushaf/pageMetrics.generated.ts` (committed output)

**Interfaces:**
- Consumes: the bundled fonts at `apps/mobile/assets/fonts/mushaf/p{page:03d}.ttf`, `mushaf_layout` rows.
- Produces: `export const MUSHAF_PAGE_WIDEST_EM: readonly number[]` — index 0 is page 1.

Why generated and committed, not computed at runtime: RN cannot measure text without rendering it, and the value is a property of files we ship. 604 floats is ~7 KB.

- [x] **Step 1: Write the failing test**

```python
from scraper.mushaf_metrics import widest_line_em


def test_widest_line_is_the_sum_of_advances_of_its_widest_line():
    """One line of two glyphs at 1000 and 500 units on a 2500 upm font is
    0.6 em; a second line of one 2000-unit glyph is 0.8 em and wins."""
    advances = {"g1": 1000, "g2": 500, "g3": 2000}
    lines = {1: [""], 2: [""]}
    cmap = {0xE000: "g1", 0xE001: "g2", 0xE002: "g3"}
    assert widest_line_em(lines, cmap, advances, upm=2500) == 0.8


def test_a_glyph_missing_from_the_cmap_is_not_silently_zero():
    """A missing glyph would otherwise make a line look narrow, which scales
    that page's text UP and overflows it -- the loud failure is the point."""
    import pytest

    with pytest.raises(KeyError):
        widest_line_em({1: [""]}, {}, {}, upm=2500)
```

- [x] **Step 2: Run and watch it fail**

Run: `cd packages/scraper && uv run pytest tests/test_mushaf_metrics.py -q`
Expected: FAIL, `ModuleNotFoundError: No module named 'scraper.mushaf_metrics'`.

- [x] **Step 3: Implement the pure part**

```python
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
    """
    widest = 0
    for glyphs in lines.values():
        total = 0
        for glyph in glyphs:
            for char in glyph:
                total += advances[cmap[ord(char)]]
        widest = max(widest, total)
    return round(widest / upm, 4)
```

- [x] **Step 4: Run the tests**

Run: `uv run pytest tests/test_mushaf_metrics.py -q`
Expected: PASS, 2 tests.

- [x] **Step 5: Add the CLI command**

Append to `packages/scraper/scraper/cli.py` — **before** the `if __name__ == "__main__":` guard at the end of the file. (Three commands were once registered after it and were unreachable via `python -m`; see M7b's review log.)

```python
@main.command("mushaf-metrics")
@click.option("--db", default="quran.db", show_default=True)
@click.option("--fonts", default="../../apps/mobile/assets/fonts/mushaf", show_default=True)
@click.option("--out", default="../../apps/mobile/src/mushaf/pageMetrics.generated.ts",
              show_default=True)
def mushaf_metrics_cmd(db: str, fonts: str, out: str) -> None:
    """Extract each page's widest line width, for the reader's per-page scale."""
    import sqlite3
    from collections import defaultdict

    from fontTools.ttLib import TTFont

    from .mushaf_fonts import PAGE_MAX, PAGE_MIN
    from .mushaf_metrics import widest_line_em

    fonts_dir, out_path = Path(fonts), Path(out)
    con = sqlite3.connect(db)
    try:
        by_page: dict[int, dict[int, list[str]]] = defaultdict(lambda: defaultdict(list))
        for page, line, glyph in con.execute(
            "SELECT page, line, glyph FROM mushaf_layout ORDER BY page, line, seq"
        ):
            by_page[page][line].append(glyph)
    finally:
        con.close()

    values: list[float] = []
    for page in range(PAGE_MIN, PAGE_MAX + 1):
        path = fonts_dir / f"p{page:03d}.ttf"
        if not path.exists():
            raise click.ClickException(f"missing font {path}; run `scraper mushaf-fonts` first")
        font = TTFont(path)
        try:
            values.append(
                widest_line_em(
                    by_page[page],
                    font.getBestCmap(),
                    {name: font["hmtx"][name][0] for name in font.getGlyphOrder()},
                    upm=font["head"].unitsPerEm,
                )
            )
        finally:
            font.close()

    body = ",\n  ".join(f"{v}" for v in values)
    out_path.write_text(
        "// GENERATED by `uv run scraper mushaf-metrics`. Do not edit by hand.\n"
        "//\n"
        "// Each page's widest line, in em. The reader divides its text width by\n"
        "// this to get that page's font size -- see apps/mobile/src/mushaf/pageScale.ts.\n"
        "// Index 0 is page 1.\n"
        f"export const MUSHAF_PAGE_WIDEST_EM: readonly number[] = [\n  {body},\n];\n",
        encoding="utf-8",
    )
    click.echo(
        f"{len(values)} pages: {min(values)}..{max(values)} em -> {out_path}"
    )
```

- [x] **Step 6: Generate and sanity-check the output**

```bash
cd packages/scraper
uv run scraper mushaf-metrics --db ../../apps/web/quran.db
```

Expected: `604 pages: 11.91..18.17 em -> ...pageMetrics.generated.ts`. A min under 8 or a max over 20 means a glyph went missing — stop and find out which, do not ship it.

- [x] **Step 7: Run the full scraper gate**

Run: `uv run pytest -q && uv run ruff check scraper tests && uv run mypy scraper`
Expected: all pass.

- [x] **Step 8: Commit**

```bash
git add packages/scraper/scraper/mushaf_metrics.py packages/scraper/tests/test_mushaf_metrics.py \
        packages/scraper/scraper/cli.py apps/mobile/src/mushaf/pageMetrics.generated.ts
git commit -m "feat(scraper): extract each mushaf page's widest line for the reader's scale"
```

---

## Task 3: Per-page scale

**Files:**
- Create: `apps/mobile/src/mushaf/pageScale.ts`, `apps/mobile/src/mushaf/pageScale.test.ts`

**Interfaces:**
- Consumes: `MUSHAF_PAGE_WIDEST_EM` (Task 2).
- Produces:
  ```ts
  export const MUSHAF_MAX_FONT_SIZE = 40;
  export function mushafFontSize(page: number, textWidth: number): number;
  export function mushafLineHeight(textHeight: number, lineCount: number): number;
  ```

- [x] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { MUSHAF_MAX_FONT_SIZE, mushafFontSize, mushafLineHeight } from './pageScale';
import { MUSHAF_PAGE_WIDEST_EM } from './pageMetrics.generated';

describe('mushafFontSize', () => {
  it('fills the width with the page-s widest line', () => {
    const em = MUSHAF_PAGE_WIDEST_EM[45]!; // page 46
    expect(mushafFontSize(46, 328)).toBeCloseTo(328 / em, 5);
  });

  it('caps at the size where Android drops whole-word glyphs', () => {
    // M7b saw pieces of these outlines dropped at 44px. The cap is a guard
    // rail: on a phone every page lands 18-28dp, so it should never bind --
    // but a tablet-width text column would sail past it unnoticed.
    expect(mushafFontSize(2, 4000)).toBe(MUSHAF_MAX_FONT_SIZE);
  });

  it('rejects a page outside 1..604 rather than reading undefined metrics', () => {
    expect(() => mushafFontSize(605, 328)).toThrow(RangeError);
    expect(() => mushafFontSize(0, 328)).toThrow(RangeError);
  });

  it('keeps every real page under the cap at phone width', () => {
    // The claim Finding 3 makes, asserted rather than trusted.
    for (let page = 1; page <= 604; page += 1) {
      expect(mushafFontSize(page, 328)).toBeLessThan(MUSHAF_MAX_FONT_SIZE);
    }
  });
});

describe('mushafLineHeight', () => {
  it('divides the height evenly between the lines', () => {
    expect(mushafLineHeight(600, 15)).toBe(40);
  });

  it('never returns zero or a negative for a squeezed page', () => {
    expect(mushafLineHeight(0, 15)).toBeGreaterThan(0);
  });
});
```

- [x] **Step 2: Run and watch them fail**

Run: `npx vitest run src/mushaf/pageScale.test.ts`
Expected: FAIL, unresolved import.

- [x] **Step 3: Implement**

```ts
import { MUSHAF_PAGE_MAX, MUSHAF_PAGE_MIN } from '@quran-corpus/data/mobile';

import { MUSHAF_PAGE_WIDEST_EM } from './pageMetrics.generated';

/**
 * The size past which Android starts dropping pieces of these whole-word
 * outlines (M7b's device run saw it at 44px). Not an active constraint on a
 * phone -- every page lands 18-28dp at 328dp of text width -- but a wider
 * column would walk into it silently, and a silently broken page looks like a
 * missing font rather than an oversized one.
 */
export const MUSHAF_MAX_FONT_SIZE = 40;

/** A floor, so a mid-layout zero height cannot make a line invisible. */
const MIN_LINE_HEIGHT = 1;

export function mushafFontSize(page: number, textWidth: number): number {
  if (!Number.isInteger(page) || page < MUSHAF_PAGE_MIN || page > MUSHAF_PAGE_MAX) {
    throw new RangeError(
      `mushaf page must be an integer ${MUSHAF_PAGE_MIN}..${MUSHAF_PAGE_MAX}, got ${page}`,
    );
  }
  const em = MUSHAF_PAGE_WIDEST_EM[page - 1];
  if (em === undefined || em <= 0) {
    // The generated file is 604 entries by construction, so this is a stale
    // or truncated generation -- say which page, not "NaN".
    throw new Error(`no metrics for mushaf page ${page}; run \`scraper mushaf-metrics\``);
  }
  return Math.min(textWidth / em, MUSHAF_MAX_FONT_SIZE);
}

export function mushafLineHeight(textHeight: number, lineCount: number): number {
  if (lineCount <= 0) return MIN_LINE_HEIGHT;
  return Math.max(textHeight / lineCount, MIN_LINE_HEIGHT);
}
```

- [x] **Step 4: Run the tests**

Expected: PASS, 6 tests. **The "every real page under the cap" test is the one that matters** — it reads the generated file, so a bad regeneration fails here rather than on a phone.

- [x] **Step 5: Mutation-check the cap**

Replace `Math.min(...)` with `textWidth / em` and re-run: the cap test must fail. Restore by re-editing.

- [x] **Step 6: Commit**

```bash
git add apps/mobile/src/mushaf/pageScale.ts apps/mobile/src/mushaf/pageScale.test.ts
git commit -m "feat(mobile/mushaf): size each page from its own widest line"
```

---

## Task 4: The line renderer

**Files:**
- Create: `apps/mobile/src/components/mushaf/MushafLineRow.tsx`, `MushafLineRow.test.tsx`

**Interfaces:**
- Consumes: `MushafWord`, `mushafFontFamily` (`src/mushaf/pageFont.ts`).
- Produces:
  ```ts
  export interface MushafLineRowProps {
    page: number; words: MushafWord[];
    fontSize: number; lineHeight: number;
    colorForAyah: (surahId: number, ayahNumber: number) => string;
    onWordPress: (word: MushafWord) => void;
  }
  ```

Three rules this component exists to hold:

0. **Strip U+0020 from a glyph string before rendering it.** Task 2 found 198 layout rows, on 197 pages, whose word holds two glyph codes separated by a space; both codes are always in that page's own font, and the fonts have no space glyph. It is a separator in the source data, not something print draws — Task 2's metrics give it zero width, so drawing it would make those pages wider than they were measured.
1. **Join glyphs with `''`, never a space.** These fonts lack U+0020, so a space splits the line into a fallback run per word and the line renders in the system font — as plausible Arabic, not tofu (M7a §4).
2. **Centre the line.** Finding 2: lines are pre-justified to within 2%, so centring is visually identical and needs no width heuristic.
3. **`numberOfLines={1}`.** An overflow must clip loudly rather than wrap into the line below and push the page off its 15-line grid.

Per-word nested `<Text>` is safe here — a QCF word is ONE pre-shaped glyph, so there is no join for a nested element to break. This is exactly the case [[rn-android-breaks-shaping-across-nested-text]] does *not* cover, and M7a confirmed it on device.

- [x] **Step 1: Write the failing tests**

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MushafLineRow } from './MushafLineRow';

const w = (ayahNumber: number, position: number, glyph: string) => ({
  surahId: 2, ayahNumber, position, charType: 'word' as const, glyph,
});

const props = {
  page: 46, fontSize: 21, lineHeight: 40,
  colorForAyah: () => '#000000',
  onWordPress: vi.fn(),
};

describe('MushafLineRow', () => {
  it('joins the words with nothing at all', () => {
    // A space is not in these fonts, so joining with one silently drops the
    // whole line into the system face.
    const { container } = render(
      <MushafLineRow {...props} words={[w(1, 1, 'A'), w(1, 2, 'B')]} />,
    );
    expect(container.textContent).toBe('AB');
  });

  it('renders in the page-s own family', () => {
    const { container } = render(<MushafLineRow {...props} words={[w(1, 1, 'A')]} />);
    expect(container.innerHTML).toContain('QCF2046');
  });

  it('colours each ayah-s words from colorForAyah', () => {
    const colorForAyah = (_s: number, ayah: number) => (ayah === 1 ? '#ff0000' : '#00ff00');
    const { container } = render(
      <MushafLineRow {...props} colorForAyah={colorForAyah}
        words={[w(1, 1, 'A'), w(2, 1, 'B')]} />,
    );
    expect(container.innerHTML).toContain('#ff0000');
    expect(container.innerHTML).toContain('#00ff00');
  });

  it('hides the glyph run from TalkBack', () => {
    // Ruling 12: the codes are private-use characters. The ayah label is
    // published by MushafPage; a line reading them aloud is gibberish.
    const { container } = render(<MushafLineRow {...props} words={[w(1, 1, 'A')]} />);
    expect(container.innerHTML).toContain('aria-hidden');
  });
});
```

- [x] **Step 2: Run and watch them fail**

Run: `npx vitest run src/components/mushaf/MushafLineRow.test.tsx`

- [x] **Step 3: Implement**

```tsx
import { Text } from 'react-native';
import type { MushafWord } from '@quran-corpus/data/mobile';

import { mushafFontFamily } from '@/mushaf/pageFont';

export interface MushafLineRowProps {
  page: number;
  words: MushafWord[];
  fontSize: number;
  lineHeight: number;
  /** One colour per ayah, so the three highlight states resolve outside this
   *  component and a line stays a pure renderer. */
  colorForAyah: (surahId: number, ayahNumber: number) => string;
  onWordPress: (word: MushafWord) => void;
}

/**
 * One line of a mushaf page: its words as pre-shaped QCF glyphs.
 *
 * Joined with '' and NOT with a space. U+0020 is the one codepoint these fonts
 * lack, so a space between words splits the line into a fallback run per word
 * and the whole line renders in the system face -- as plausible Arabic rather
 * than tofu, which is the failure mode that hides (M7a §4).
 *
 * Centred rather than justified: measured across all 8,820 lines, 99% sit
 * within 5% of their page's widest line, because QCF pre-justifies them. The
 * remaining 1% are the last line of a surah, which print centres anyway. So
 * centring is both correct and free of a width threshold to misclassify.
 */
export function MushafLineRow({
  page,
  words,
  fontSize,
  lineHeight,
  colorForAyah,
  onWordPress,
}: MushafLineRowProps) {
  return (
    <Text
      // The glyphs are private-use codepoints; MushafPage publishes the real
      // Uthmani text per ayah instead (ruling 12).
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      numberOfLines={1}
      style={{
        fontFamily: mushafFontFamily(page),
        fontSize,
        lineHeight,
        textAlign: 'center',
      }}
    >
      {words.map((word) => (
        <Text
          key={`${word.surahId}:${word.ayahNumber}:${word.position}`}
          onPress={() => onWordPress(word)}
          style={{ color: colorForAyah(word.surahId, word.ayahNumber) }}
        >
          {word.glyph}
        </Text>
      ))}
    </Text>
  );
}
```

- [x] **Step 4: Run the tests**

Expected: PASS, 4 tests.

- [x] **Step 5: Mutation-check the join**

Change `{words.map(...)}` to `{words.map(...)}` interleaved with `' '` and re-run: the "joins with nothing at all" test must fail. Restore by re-editing.

- [x] **Step 6: Commit**

```bash
git add apps/mobile/src/components/mushaf/MushafLineRow.tsx apps/mobile/src/components/mushaf/MushafLineRow.test.tsx
git commit -m "feat(mobile/mushaf): render one page line as pre-shaped QCF glyphs"
```

---

## Task 5: Page chrome — surah band, bismillah, footer

**Files:**
- Create: `packages/config/ornaments/surahBand.ts`
- Modify: `apps/web/src/components/reader/ornaments/SurahFrame.tsx` (consume it)
- Create: `apps/mobile/src/components/mushaf/SurahBand.tsx` (+ test)
- Create: `apps/mobile/src/components/mushaf/BismillahLine.tsx` (+ test)
- Create: `apps/mobile/src/components/mushaf/PageFooter.tsx` (+ test)

**Interfaces:**
- Produces: `SURAH_BAND_PATH`, `SURAH_BAND_VIEW_BOX` (`'0 -500 16320 2000'`, 8.16:1) from `packages/config/ornaments/surahBand.ts`.

The geometry is currently inline in web's `SurahFrame.tsx`. Ruling 21 puts the same arabesque on the mobile page, and §3 forbids the copy-paste. **Extract first, repoint web, then build mobile's** — in that order, so web's existing `SurahFrame.test.tsx` proves the extraction lossless before anything new depends on it.

Keep web's rationale comments with the geometry: the nonzero fill rule producing the cartouche cutouts, and the 8.16:1 ratio budgeting only ~26px of vertical space, are properties of the art, not of either consumer.

- [x] **Step 1: Extract the path, repoint web, run web's suite**

Move the `d` string and viewBox into `packages/config/ornaments/surahBand.ts` beside `medallion.ts`. Import them in `SurahFrame.tsx`. Geometry only — fill and stroke stay with each consumer, since web paints via Tailwind and RN has no `currentColor` (the same split `medallion.ts` already documents).

Run: `cd apps/web && npx vitest run src/test/SurahFrame.test.tsx`
Expected: PASS, unchanged. A diff in the rendered path means the extraction dropped something.

- [x] **Step 2: Write the failing mobile chrome tests**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SurahBand } from './SurahBand';
import { BismillahLine } from './BismillahLine';
import { PageFooter } from './PageFooter';

describe('SurahBand', () => {
  it('names the surah inside the band', () => {
    const { container } = render(<SurahBand surahId={5} surahName="Al-Ma-idah" height={40} />);
    expect(container.textContent).toContain('Al-Ma-idah');
  });

  it('labels itself for TalkBack, since the art carries no text', () => {
    render(<SurahBand surahId={5} surahName="Al-Ma-idah" height={40} />);
    expect(screen.getByLabelText('Al-Ma-idah')).toBeTruthy();
  });
});

describe('BismillahLine', () => {
  it('draws the bismillah centred at the line-s own height', () => {
    const { container } = render(<BismillahLine fontSize={21} lineHeight={40} />);
    expect(container.textContent?.length).toBeGreaterThan(0);
    expect(container.innerHTML).toContain('center');
  });
});

describe('PageFooter', () => {
  it('shows the page number and its juz', () => {
    const { container } = render(<PageFooter page={106} juz={6} uiLocale="en" />);
    const text = container.textContent ?? '';
    expect(text).toContain('106');
    expect(text).toContain('6');
  });
});
```

- [x] **Step 3: Implement the three components**

`SurahBand` — the extracted path in an `<Svg>` at 8.16:1, stroked/filled with `theme.mutedText`, the transliterated surah name centred over it via absolute inset (NOT padding: the same percentage-resolves-against-width trap web documents). Its own `accessibilityLabel` is the surah name, because the art carries no readable text.

`BismillahLine` — the bismillah in the page's own font would need a glyph the layout does not carry, so draw it in `fonts.arabic` (Hafs) at the line's height, centred. Reuse `src/components/Bismillah.tsx`'s string; do not retype it.

`PageFooter` — `medallion-1` geometry from `packages/config/ornaments/medallion.ts` around the page number, juz beside it. **Marked as a stand-in** (ruling 23) with a comment naming the ruling, so a reviewer and the PR body agree.

- [x] **Step 4: Run the tests**

Run: `npx vitest run src/components/mushaf/`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/config/ornaments/surahBand.ts apps/web/src/components/reader/ornaments/SurahFrame.tsx \
        apps/mobile/src/components/mushaf/
git commit -m "feat(mobile/mushaf): draw the surah band, bismillah and page footer"
```

---

## Task 6: Highlight states

**Files:**
- Create: `apps/mobile/src/mushaf/highlights.ts`, `highlights.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface HighlightInput {
    bookmarked: ReadonlySet<string>;   // `${surahId}:${ayahNumber}`
    landing: string | null;
    playing: string | null;
    landingProgress: number;           // 1 at the pulse's peak, 0 once faded
  }
  export function ayahKey(surahId: number, ayahNumber: number): string;
  export function colorForAyah(
    input: HighlightInput,
    theme: typeof themeColors.light,   // light and dark share a shape
  ): (surahId: number, ayahNumber: number) => string;
  ```

Ruling 20: all three can show at once, so this is a precedence function, not a switch. Precedence, strongest first: **audio → landing → bookmark → plain text.** Audio wins because it is the one that moves; a landing pulse under a playing ayah would fight it.

Pure and unit-tested precisely because "all three at once" is the case that is awkward to reproduce by hand on a device.

- [x] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { ayahKey, colorForAyah } from './highlights';
import { themeColors } from '@/theme/tokens';

const theme = themeColors.light;
const base = { bookmarked: new Set<string>(), landing: null, playing: null, landingProgress: 0 };

describe('colorForAyah', () => {
  it('leaves an ordinary ayah in the page-s text colour', () => {
    expect(colorForAyah(base, theme)(2, 5)).toBe(theme.text);
  });

  it('tints a bookmarked ayah', () => {
    const c = colorForAyah({ ...base, bookmarked: new Set([ayahKey(2, 5)]) }, theme);
    expect(c(2, 5)).not.toBe(theme.text);
    expect(c(2, 6)).toBe(theme.text);
  });

  it('lets audio win over a landing pulse and a bookmark on the same ayah', () => {
    // Ruling 20 puts all three on one ayah. The playing ayah is the one that
    // moves, so it has to stay legible as it moves.
    const all = {
      bookmarked: new Set([ayahKey(2, 5)]),
      landing: ayahKey(2, 5),
      playing: ayahKey(2, 5),
      landingProgress: 1,
    };
    expect(colorForAyah(all, theme)(2, 5)).toBe(theme.accent);
  });

  it('lets a landing pulse win over a bookmark', () => {
    const c = colorForAyah(
      { ...base, bookmarked: new Set([ayahKey(2, 5)]), landing: ayahKey(2, 5), landingProgress: 1 },
      theme,
    );
    expect(c(2, 5)).not.toBe(theme.text);
  });

  it('returns the bookmark tint once the pulse has faded out', () => {
    const withBookmark = { ...base, bookmarked: new Set([ayahKey(2, 5)]) };
    const faded = colorForAyah({ ...withBookmark, landing: ayahKey(2, 5), landingProgress: 0 }, theme);
    expect(faded(2, 5)).toBe(colorForAyah(withBookmark, theme)(2, 5));
  });
});
```

- [x] **Step 2: Run and watch them fail**

- [x] **Step 3: Implement**

Keys are `${surahId}:${ayahNumber}` strings, not objects — a page crosses surahs (51 of them do), so an ayah number alone is ambiguous and a `Set` of numbers would highlight the wrong verse on a shared page.

- [x] **Step 4: Run the tests**

Expected: PASS, 5 tests.

- [x] **Step 5: Mutation-check the precedence**

Swap the audio and landing branches. The "audio wins" test must fail. Restore by re-editing.

- [x] **Step 6: Commit**

```bash
git add apps/mobile/src/mushaf/highlights.ts apps/mobile/src/mushaf/highlights.test.ts
git commit -m "feat(mobile/mushaf): resolve the three highlight states into one colour per ayah"
```

---

## Task 7: The page

**Files:**
- Create: `apps/mobile/src/mushaf/useMushafPage.ts` (+ test)
- Create: `apps/mobile/src/components/mushaf/MushafPage.tsx` (+ test)

**Interfaces:**
- Consumes: `getMushafPage` (`@quran-corpus/data/mobile`), `composePage`, `mushafFontSize`, `mushafLineHeight`, `useMushafPageFont`, `colorForAyah`, `MushafLineRow`, `SurahBand`, `BismillahLine`, `PageFooter`.
- Produces: `MushafPage` taking `{ page, lines, width, height, highlights, ayahTexts, surahNames, juz, uiLocale, onWordPress }`.

`lines` is a prop, not something the component fetches: that keeps `MushafPage` pure and renderable in a test with no database, and lets the pager hold the fetch for the three pages it keeps warm. `useMushafPage` is what supplies it.

Two things this component owns and nothing else does:

**Per-ayah TalkBack (ruling 12).** The lines are hidden. The page publishes one accessible element per ayah carrying its real Uthmani text and number — text that comes from the corpus `ayahs` table, NOT from the glyph rows. Pass it in as `ayahTexts: Map<string, string>` so the page stays renderable in a test without a database.

**Not rendering until the font is registered.** A page drawn before `useMushafPageFont` resolves shows the QCF codepoints in the system face — plausible-looking Arabic that is not the Qur'an. That is the single worst failure this phase can ship, and it looks fine in a screenshot. Render nothing (the page's paper ground alone) until `ready`.

- [ ] **Step 1: Write the failing tests**

```tsx
describe('MushafPage', () => {
  it('draws nothing but the page ground until the font is registered', () => {
    // A page drawn early renders QCF codepoints in the system face, which
    // looks like Arabic and is not the Qur'an. Blank is the safe state.
    mockFontReady(false);
    const { container } = render(<MushafPage {...props} />);
    expect(container.textContent).toBe('');
  });

  it('draws the lines once the font is ready', () => {
    mockFontReady(true);
    const { container } = render(<MushafPage {...props} />);
    expect(container.textContent).toContain('A');
  });

  it('publishes one accessible label per ayah, with real Uthmani text', () => {
    mockFontReady(true);
    render(<MushafPage {...props} />);
    expect(screen.getByLabelText(new RegExp(props.ayahTexts.get('2:1')!))).toBeTruthy();
  });

  it('draws a surah band where the composition puts one', () => {
    mockFontReady(true);
    const { container } = render(<MushafPage {...props} page={106} lines={p106Lines} />);
    expect(container.textContent).toContain('Al-Ma-idah');
  });

  it('keeps 15 line slots on a page whose words occupy fewer', () => {
    // The grid is what makes a page a page; a short page must not stretch its
    // lines to fill the height.
    mockFontReady(true);
    const { container } = render(<MushafPage {...props} page={604} lines={p604Lines} />);
    expect(lineBoxesOf(container)).toHaveLength(15);
  });
});
```

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Implement `useMushafPage`, then `MushafPage`**

`useMushafPage(client, page)` returns `{ lines, loading, error }` and calls `getMushafPage`. It must tolerate the page changing under it (the pager prefetches neighbours) — the same cancelled-flag shape `useMushafPageFont` already uses.

`MushafPage` computes `fontSize = mushafFontSize(page, width - 2 * margin)` and `lineHeight = mushafLineHeight(height - footerHeight, MUSHAF_LINES_PER_PAGE)` once per layout, then maps `composePage(...)` to a row per slot. Every slot gets a box of exactly `lineHeight` — including `blank` — so the grid holds.

- [ ] **Step 4: Run the tests**

Expected: PASS, 5 tests.

- [ ] **Step 5: Mutation-check the not-ready guard**

Make the component render its lines regardless of `ready`. The first test must fail. Restore by re-editing. **This is the most important mutation-check in the phase** — the guard's whole job is to prevent a failure that looks like success.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/mushaf/useMushafPage.ts apps/mobile/src/components/mushaf/MushafPage.tsx \
        apps/mobile/src/mushaf/useMushafPage.test.ts apps/mobile/src/components/mushaf/MushafPage.test.tsx
git commit -m "feat(mobile/mushaf): assemble a page from its lines and chrome"
```

---

## Task 8: The pager

**Files:**
- Create: `apps/mobile/src/components/mushaf/MushafPager.tsx` (+ test)

**Interfaces:**
- Produces: `MushafPager` taking `{ initialPage, onPageChange, onWordPress, highlights, ... }`.

A horizontal `FlatList` over `[1..604]`, `pagingEnabled`, `inverted` for RTL (ruling 7), `getItemLayout` from the measured page width — 604 fixed-width items make `getItemLayout` exact, so `initialScrollIndex` lands without a scan.

`inverted` rather than `I18nManager.forceRTL`: forcing RTL flips the ENTIRE app, every screen, and the app's UI locale is a user setting independent of the mushaf's reading direction.

Windowing matters here — 604 pages each holding a registered font. `windowSize={3}`, `maxToRenderPerBatch={1}`, `removeClippedSubviews`. Prefetch exactly one page either side so a swipe lands on a rendered page rather than a blank one, and no further: each page pulls a ~200 KB font that `expo-font` never unloads.

- [ ] **Step 1: Widen the `FlatList` test mock, then write the failing tests**

```tsx
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MushafPager } from './MushafPager';
import { listPropsOf } from '@/testing/rnHosts';

const props = {
  initialPage: 106,
  width: 360,
  height: 720,
  onPageChange: vi.fn(),
  onWordPress: vi.fn(),
};

/** The settle event RN emits at the end of a paging scroll. */
const settleAt = (page: number) => ({
  nativeEvent: { contentOffset: { x: (page - 1) * props.width, y: 0 } },
});

describe('MushafPager', () => {
  it('spans exactly the 604 pages of the mushaf', () => {
    const list = listPropsOf(render(<MushafPager {...props} />));
    expect(list.data).toHaveLength(604);
    expect(list.data[0]).toBe(1);
    expect(list.data[603]).toBe(604);
  });

  it('starts on the page it was given', () => {
    const list = listPropsOf(render(<MushafPager {...props} />));
    expect(list.initialScrollIndex).toBe(105); // page 106
  });

  it('is inverted, so a right-to-left swipe advances like the book', () => {
    // Ruling 7. Inverted and NOT I18nManager.forceRTL, which flips every
    // screen in the app -- the UI locale is a separate user setting from the
    // mushaf's reading direction.
    const list = listPropsOf(render(<MushafPager {...props} />));
    expect(list.inverted).toBe(true);
    expect(list.pagingEnabled).toBe(true);
  });

  it('gives every page the same width, so getItemLayout is exact', () => {
    // 604 fixed-width items mean initialScrollIndex lands without a scan.
    const list = listPropsOf(render(<MushafPager {...props} />));
    expect(list.getItemLayout(null, 105)).toEqual({
      length: 360, offset: 360 * 105, index: 105,
    });
  });

  it('reports the settled page', () => {
    const onPageChange = vi.fn();
    const list = listPropsOf(render(<MushafPager {...props} onPageChange={onPageChange} />));
    list.onMomentumScrollEnd(settleAt(107));
    expect(onPageChange).toHaveBeenCalledWith(107);
  });

  it('reports a page turn exactly once per settle', () => {
    // This is the write point for the durable reading position (ruling 15).
    // Firing on every scroll frame would write the user DB dozens of times
    // per swipe -- the whole reason issue #59's old scroll handler was wrong.
    const onPageChange = vi.fn();
    const list = listPropsOf(render(<MushafPager {...props} onPageChange={onPageChange} />));
    list.onMomentumScrollEnd(settleAt(107));
    list.onMomentumScrollEnd(settleAt(107));
    expect(onPageChange).toHaveBeenCalledTimes(1);
  });

  it('keeps only a narrow window of pages mounted', () => {
    // Every mounted page registers a ~200KB font that expo-font never
    // unloads. Windowing is what bounds the cost of paging through a juz.
    const list = listPropsOf(render(<MushafPager {...props} />));
    expect(list.windowSize).toBe(3);
    expect(list.maxToRenderPerBatch).toBe(1);
  });
});
```

**`listPropsOf` does not exist, and neither does the mock it needs.** `src/testing/rnHosts.ts`'s `FlatList` destructures only `data`, `renderItem`, `keyExtractor` and `testID`, and **silently drops everything else** — `inverted`, `pagingEnabled`, `getItemLayout`, `onMomentumScrollEnd`, `windowSize`. Against the mock as it stands today, every assertion above passes whether or not the component sets the prop.

That is the same shape as [[rn-accessible-view-collapses-children]]: a prop the mock drops is a prop no unit test can defend, and the device becomes the only gate.

So this task's **first** step is to widen the mock — keep the full prop bag on the host node and export `listPropsOf(result)` to read it back — and then mutation-check the widening itself: delete `inverted` from `MushafPager` and confirm the inverted test fails. If it still passes, the mock is still dropping the prop and every assertion here is decorative.

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests**

- [ ] **Step 5: Mutation-check the settle handler**

Make `onPageChange` fire on every scroll event rather than on settle. The "exactly once per settle" test must fail.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/mushaf/MushafPager.tsx apps/mobile/src/components/mushaf/MushafPager.test.tsx
git commit -m "feat(mobile/mushaf): page through all 604 pages right to left"
```

---

## Task 9: Reading position by page — issue #59

**Files:**
- Modify: `packages/data/src/userData.ts`
- Modify: `apps/mobile/src/data/userRepository.ts`, `latestReadingPositionRecorder.ts`
- Test: `packages/data/tests/userData.test.ts`, `apps/mobile/src/data/*.test.ts`

> **§5 TRIGGER.** This writes the on-device user DB, which survives app updates. The migration is **additive only** — a new nullable column, never a changed or dropped one. A bad row here is not fixed by shipping a new build. Stop for `/code-review` before the phase ends (Task 13).

**Interfaces:**
- Produces: `recordReadingPosition(client, { surahId, ayahNumber, page })`, `getLastReadingPosition` returning `{ surahId, ayahNumber, page: number | null }`.

Ruling 15: store the page, display it as the surah/ayah that page opens with. `surah_id` and `ayah_number` stay and stay written — the Continue card, bookmarks and the WBW screen all read them, and dropping them would be a breaking change to device state for no gain.

`page` is nullable precisely because every existing install has rows without one. A null page means "recorded before M7c" and the card falls back to the ayah, exactly as it does today.

- [ ] **Step 1: Write the failing tests**

```ts
it('adds page as a nullable column without touching existing rows', async () => {
  // The user DB is on a phone and survives app updates. A row written by the
  // last build must still read back, with a null page.
  await client.execute("INSERT INTO reading_history (id, surah_id, ayah_number) VALUES (1, 2, 5)");
  await runMigrations(client);
  const position = await getLastReadingPosition(client);
  expect(position).toEqual({ surahId: 2, ayahNumber: 5, page: null });
});

it('records the page a turn landed on', async () => {
  await recordReadingPosition(client, { surahId: 5, ayahNumber: 1, page: 106 });
  expect(await getLastReadingPosition(client)).toEqual({ surahId: 5, ayahNumber: 1, page: 106 });
});

it('rejects a page outside 1..604 rather than storing it', async () => {
  // assertAyahCoordinate already guards the other two. A page arrives from a
  // pager index, so it is derived, not typed -- but the DB is durable and
  // this is the last boundary before it.
  await expect(recordReadingPosition(client, { surahId: 5, ayahNumber: 1, page: 605 }))
    .rejects.toThrow();
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `cd packages/data && node scripts/generate-schema.mjs && npx vitest run tests/userData.test.ts`

**`generate-schema.mjs` is not optional.** A bare `npx vitest run` reads the previously generated `schema.generated.ts`, so a schema change never reaches the test and both the test AND its mutation-check pass vacuously.

- [ ] **Step 3: Implement**

Add the migration to the versioned list below `USER_DB_SCHEMA` — NOT to the baseline string, which every open re-applies and which cannot carry an `ALTER TABLE`.

- [ ] **Step 4: Run the tests, with the schema regenerated first**

- [ ] **Step 5: Mutation-check the range guard**

Delete the page bound check and re-run: the 605 test must fail. Regenerate the schema first, then restore by re-editing.

- [ ] **Step 6: Wire the pager's settle to the recorder, and the Continue card to the page**

The write point is the page turn (ruling 15), not a scroll handler — that is issue #59's whole fix. `getPageIndex` (already in `@quran-corpus/data/mobile`) maps page → first surah/ayah for the display.

- [ ] **Step 7: Commit**

```bash
git add packages/data apps/mobile/src/data
git commit -m "fix(mobile): record the reading position on a page turn

Closes #59."
```

---

## Task 10: Wire the pager in, delete the scroll mushaf

**Files:**
- Modify: `apps/mobile/src/components/SurahReader.tsx`, `apps/mobile/app/surah/[surahId].tsx`
- Modify: `apps/mobile/src/components/ReaderHeader.tsx` (issue #58)
- Delete: `apps/mobile/src/components/MushafAyah.tsx`, `MushafAyah.test.tsx`
- Modify: `apps/mobile/src/components/SurahReader.test.tsx`

Ruling 6: paged replaces the scroll mushaf outright. `rowHeightModel.ts` **stays** — translation mode still uses it, and deleting it would take M6l's landing loop with it.

The mushaf branch no longer renders the ayah `FlatList` at all. It renders `MushafPager`, opened at the page holding the requested ayah. `/surah/[surahId]` remains the entry door (ruling 10): the route resolves surah → first page, and `?ayah=` resolves to that ayah's page plus a landing pulse (ruling 17).

**Chevrons jump to the previous/next surah's first page** (ruling 11), not one page. They keep `useEntryPager` — paging is state, not navigation (D48), and `replace` would remount the screen and kill both the refs and the exit animation.

**Issue #58 while here.** The header's surah name goes blank after a chevron turn. In a pager the name is a function of the current page, not of the screen's mount-time surah — deriving it from the settled page is the fix, and the pager makes the old failure unreachable. Assert it: a test that pages and then reads the header title.

- [ ] **Step 1: Write the failing tests in `SurahReader.test.tsx`**

```tsx
it('renders the pager in mushaf mode, not a list of ayah rows', () => {});

it('opens on the page holding the requested ayah', () => {
  // /surah/5?ayah=1 must open page 106, not page 1 of surah 5's range.
});

it('keeps the surah name after a page turn crosses into the next surah', () => {
  // Issue #58: the name went blank after a chevron turn and stayed blank.
});

it('still renders translation mode as a list of cards', () => {
  // The guard on ruling 6: paged replaces the mushaf, not the reader.
});
```

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Implement, then delete `MushafAyah`**

Delete only after the tests above pass — a red suite plus a deletion is two failures wearing one coat.

- [ ] **Step 4: Run the whole mobile suite**

Run: `npx vitest run && npx eslint . --ext .ts,.tsx && npm run type-check`

Expected: all green. Type-check still shows issue #54's two pre-existing errors (`SurahReader.test.tsx` TS2322, `useReducedMotion.test.ts` TS2835) and no others. **`SurahReader.test.tsx` is edited in this task — if its TS2322 is now trivial to fix, fix it and note that #54 is half closed.**

- [ ] **Step 5: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile/reader): page the mushaf instead of scrolling it

Closes #58."
```

---

## Task 11: Translation mode — ayah by ayah, translation toggleable

**Files:**
- Modify: `apps/mobile/src/settings/settingsStore.tsx` (+ test)
- Modify: `apps/mobile/src/components/AyahCard.tsx` (+ test)
- Modify: `apps/mobile/src/components/ReaderHeader.tsx` (+ test)

Owner ruling 2026-09-08, overriding ruling 3's "translation mode untouched": translation is in M7c.

**Scope, honestly sized.** Translation mode is *already* ayah-by-ayah — `AyahCard` per ayah, Arabic then translation under a rule. `AyahCard` already renders no translation block when `translationText` is null. So the work is a setting, a control, and honouring it. It is not a rebuild, and the plan should not pretend otherwise.

`showTranslation: boolean`, default `true`, persisted through the existing `settings` table by the same path `readerMode` uses. When off, `AyahCard` renders Arabic only, and the header's language control is hidden — a language picker that changes nothing visible is a dead control.

- [ ] **Step 1: Write the failing tests**

```tsx
it('defaults showTranslation to true', () => {});

it('persists showTranslation across a reload', () => {
  // Same path readerMode takes; the point is that it is not component state.
});

it('renders no translation block when showTranslation is off', () => {
  const { container } = renderCard({ translationText: 'In the name of God', showTranslation: false });
  expect(container.textContent).not.toContain('In the name of God');
});

it('still renders the Arabic when the translation is off', () => {});

it('hides the language control when the translation is off', () => {
  // A picker that changes nothing visible is a dead control.
});
```

- [ ] **Step 2: Run and watch them fail**

- [ ] **Step 3: Implement**

Follow `readerMode` exactly: an `isShowTranslation`-style validator on read (the persisted value is a string from SQLite and is untrusted input), a default in `defaultSettings`, a setter through `updateSetting`.

- [ ] **Step 4: Run the tests and the mobile gate**

- [ ] **Step 5: Mutation-check the persistence validator**

Feed the store a persisted `showTranslation` of `"maybe"`. It must fall back to the default, not render `undefined`.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/settings apps/mobile/src/components
git commit -m "feat(mobile/reader): let the translation be switched off"
```

---

## Task 12: Attribution

**Files:**
- Modify: `apps/mobile/app/about.tsx` (+ test)

Ruling 9 and CLAUDE.md §11. The page fonts and the layout are KFGQPC via QUL, shipped under an accepted-exposure override with **no redistribution grant stated**. The About/Credits entry is what makes that exposure auditable rather than silent.

Name both the layout source (quran.com v4 API / QUL) and the font source (KFGQPC), alongside the existing corpus.quran.com, Tanzil and QuranEnc entries.

- [ ] **Step 1: Write the failing test**

```tsx
it('credits KFGQPC and QUL for the mushaf pages and fonts', () => {
  const { container } = render(<AboutScreen />);
  const text = container.textContent ?? '';
  expect(text).toContain('KFGQPC');
  expect(text).toContain('QUL');
});
```

- [ ] **Step 2: Run, implement, run**

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/about.tsx apps/mobile/app/about.test.tsx
git commit -m "docs(mobile): credit KFGQPC and QUL for the mushaf pages"
```

---

## A note on this plan's density

Tasks 1-4, 6, 8 and 9 carry their code because they are pure logic, a
generator, or a virtualization contract — places where a wrong guess is
invisible until a device shows it, and where the exact value matters.

Tasks 5, 7, 10, 11 and 12 carry their interfaces, their rules, their tests and
their reasons, but not their full component bodies. That is deliberate, per
CLAUDE.md §6: those are compositions in a house style this repo already sets
across ~40 components, and transcribing them here would be padding an
implementer skips to read the real ones. Every one of them still names its
files, its props, its tests and the decisions it must honour.

If a task in that second group turns out to be ambiguous in practice, that is a
plan defect — fix the plan, do not guess.

---

## Task 13: Device run and review

`apps/mobile` has no emulator in CI (§10), so the device checklist IS the gate. A milestone is not complete until it has been run on real hardware and recorded here — "implementation complete, verification pending" is an unmet exit criterion, not a pass.

- [ ] **Step 1: Full gate, all three packages**

```bash
cd packages/scraper && uv run pytest -q && uv run ruff check scraper tests && uv run mypy scraper
cd ../data && node scripts/generate-schema.mjs && npx vitest run && npx tsc --noEmit
cd ../../apps/mobile && npx vitest run && npx eslint . --ext .ts,.tsx && npm run type-check
```

- [ ] **Step 2: Build a release APK**

Never `npm run build` or a Gradle build while `expo start` is running — they share `.next`/`.expo` state. Read `/proc/self/status` for `Cpus_allowed_list` first; `taskset` is **mandatory** (an unconstrained run drove the load average to 136).

```bash
cd apps/mobile/android
taskset -c <two allowed cores> nice -n 19 ionice -c 3 ./gradlew assembleRelease \
  -PreactNativeArchitectures=arm64-v8a --max-workers=2 --no-daemon
adb install -r --user 0 app/build/outputs/apk/release/app-release.apk
```

Move the previous APK aside first — a failed build leaves the old one in place and looks like a success.

- [ ] **Step 3: Coordinate the device run with the owner**

**The phone under adb is also the display for this terminal session. Never drive it unattended.** Check `dumpsys activity activities | grep mResumedActivity` before every tap; a tap that lands while the app is backgrounded types into the owner's terminal.

- [ ] **Step 4: Run the checks**

| # | Check | Why this one |
|---|---|---|
| 200 | Page 1 opens in QCF glyphs, 15-line grid, nothing in the system face | The failure that looks like success |
| 201 | Swipe right-to-left advances 1 → 2; left-to-right goes back | Ruling 7 |
| 202 | Page 106 draws Al-Ma'idah's band on line 6 and its **bismillah** on line 7 — not a second band | Finding 1, the two-line case, and the exact bug the first draft had |
| 203 | Page 77 draws a **bismillah** on line 1, and page 76 line 15 carries the band | Finding 1, the split case — the one a wrong rule breaks |
| 204 | Page 187 (At-Tawbah) draws a band and **no** bismillah | Finding 1, the surah-9 case |
| 205 | Page 604 keeps its 15-line grid with three surahs and short final lines centred | Finding 2, short lines |
| 206 | Pages 46 and 106 render every glyph whole, no dropped pieces | M7b's size-dependent dropout, at the real production size |
| 207 | Page 443 (widest, 18.17 em) fits its width with no clipping | The scale's worst case |
| 208 | `/surah/5?ayah=1` opens page 106 and pulses 5:1, and the pulse fades | Ruling 17 |
| 209 | A bookmarked ayah keeps a wash across a page turn and back | Ruling 19 |
| 210 | Playing audio tints the ayah, moves, and auto-turns at the page boundary | Ruling 18 |
| 211 | All three states on one ayah: audio is legible over the other two | Ruling 20 |
| 212 | Tapping a word opens `WordSheet` with the ayah actions | Ruling 4 |
| 213 | Chevrons jump to the previous/next **surah's first page** | Ruling 11 |
| 214 | The header keeps the surah name across a chevron turn | Issue #58 |
| 215 | Turn pages, background the app, cold start: Continue reading shows that page's first ayah | Ruling 15, issue #59 |
| 216 | An install upgraded over the previous build keeps its bookmarks and old reading position | Additive migration, on real device state |
| 217 | TalkBack reads each ayah's Uthmani text and number; no glyph codes are read | Ruling 12 |
| 218 | Reduced motion on: the page turn is shortened, not cut; other animations are cut | Ruling 24 |
| 219 | Translation mode still lists cards; the toggle hides the translation and the language control | Task 11 |
| 220 | Memory is stable after paging through 40 pages | 604 fonts, none unloadable |

- [ ] **Step 5: Write the verification log**

Date, build, device, one line per check with its result. Failures get an issue number, not a sentence.

- [ ] **Step 6: Stop and ask the owner to run `/code-review`**

Two §5 triggers: `packages/data` queries and the **on-device user DB write** in Task 9. The agent cannot launch it (§4). One pass, not a loop to green: fix what is real, say plainly what is declined and why.

- [ ] **Step 7: Do NOT open a PR**

Opening a PR is always the owner's call. Commit and push; then stop.

---

## Risks and rollbacks

| Risk | Rollback |
|---|---|
| The composition rule is wrong for some page the closure check missed | `composePage` is pure and its whole rule is one function; the Step-5 script re-runs against all 604 pages in seconds. A wrong page draws chrome in the wrong slot — visible, not silent. |
| A page renders in the system face because the font was not ready | Task 7's not-ready guard, and its mutation-check. This is the phase's worst failure and the only defence is that guard — do not weaken it for a loading flicker. |
| Android drops glyph pieces at the production size on some page | The cap in Task 3, and device checks 206-207. If a page does drop, lower `MUSHAF_MAX_FONT_SIZE`; the formula and every test survive a cap change. |
| The pager holds 604 registered fonts and memory grows | `expo-font` has no unload — that is a fact, not a bug to fix here. Windowing bounds what renders, not what is registered; check 220 measures the real curve. If it bites, the fix is to stop prefetching neighbours, not to unload. |
| The user-DB migration corrupts an existing install | Additive only, `page` nullable, and check 216 upgrades over the previous build rather than a clean install. Rollback: the column is unused by the old build, so downgrading is safe by construction. |
| The APK is already 211 MB, over Play's 200 MB base-module ceiling | **Not this phase's problem to solve** — M7a assigned distribution to M8. M7c must not grow it further: no new assets beyond the ~7 KB metrics file and the band geometry. |
| Translation scope creeps into a rebuild | Task 11 is a setting, a control, and honouring it. Anything past that is the later phase ruling 3 named. |

---

## Acceptance criteria

- [ ] `composePage` reproduces the header/bismillah/blank layout for all 604 pages, and the closure script prints `0 []`.
- [ ] `mushaf-metrics` regenerates 604 values in 11.91..18.17 em, and every page's font size at 328dp is under the cap — asserted by a test that reads the generated file.
- [ ] A line joins its glyphs with `''`, is centred, and is hidden from TalkBack.
- [ ] `MushafPage` renders nothing until its font is registered, and that guard is mutation-checked.
- [ ] The three highlight states resolve by precedence with audio on top, mutation-checked.
- [ ] The pager is inverted, spans 604 pages, and reports a turn exactly once per settle.
- [ ] `reading_history.page` is additive and nullable; a pre-M7c row reads back with `page: null`.
- [ ] `MushafAyah.tsx` and its test are gone; `rowHeightModel.ts` is not.
- [ ] Translation mode hides the translation and the language control when switched off.
- [ ] About credits KFGQPC and QUL.
- [ ] Full gate green in all three packages; type-check red only on issue #54's known errors.
- [ ] Device checks 200-220 run on real hardware, recorded below with date and build.
- [ ] `/code-review` run by the owner and its findings answered.
- [ ] No PR opened without the owner asking.

Explicitly **not** in M7c: shrinking the APK under Play's ceiling (M8), the final page-number ornament (owner is sourcing it; `medallion-1` ships as a marked stand-in), hizb data (ruling 22), POS colour on the page (ruling 13).

---

## Verification log

_Written during Task 13. Empty until the device run happens — "implementation complete, verification pending" is an unmet exit criterion (§10)._

### 2026-09-08 — Task 1: page composition

- Unit tests: 7 passed (`src/mushaf/pageComposition.test.ts`).
- Real-corpus gap rule (Step 5, script 1): `interior/leading gap slots with no following surah start: 0 []`.
- `composePage` over all 604 real pages: **114 bands / 114 distinct surahs headed / 112 bismillahs / 18 line-15 trailing bands** — the three totals the plan requires.
- Mutation-check: forcing `PAGES_WITH_HEADER_ON_PREVIOUS_PAGE.has(page)` false fails exactly the "band is on the previous page" test; restored by re-editing.
- eslint clean; `npm run type-check` red only on issue #54's two pre-existing errors.
- Commit `516552c`.

### 2026-09-08 — Task 2: per-page font metrics

- `uv run scraper mushaf-metrics --db ../../apps/web/quran.db` → `604 pages: 11.9068..18.1664 em`, median 15.7288 — the plan's 11.91 / 18.17 / 15.73 reproduced from the shipped fonts.
- **Plan defect corrected:** the plan's two test literals held private-use glyph chars that do not survive as text; written as `"\ue000"` escapes instead, with a comment, or both assertions would have run against empty strings and asserted nothing.
- **Ruling — the separator space.** 198 rows on 197 pages split a word's two glyph codes with U+0020, which no QCF font carries; every non-space code in them was verified present in its own page's font. Treated as a zero-width separator rather than a `KeyError`, with a test; the alternative was refusing to measure 197 of 604 pages. Task 4 gained rule 0 so the renderer strips it too — measuring a page narrower than it draws would overflow it.
- Mutation-check: changing the space guard to match `\u0000` fails exactly the separator test with `KeyError: 32`; restored by re-editing.
- Gate: 825 pytest passed (822 + 3 new), mypy clean, ruff clean on every file this task touched. Six pre-existing `E501`/`E702` remain in `sources/corpus_parser.py`, `sources/qul.py`, `tests/test_db.py` and `tests/test_review_glosses.py` under ruff 0.15.17 — untouched here, not introduced by this task.
- Commit `acaea85`.

### 2026-09-08 — Task 3: per-page scale

- 6 tests pass, including the one that walks all 604 pages: at 328dp of text width every page lands **18.1–27.5dp**, under the 40dp cap and well under the 44dp where M7b saw glyph dropout. Finding 3 asserted, not trusted — a bad regeneration of `pageMetrics.generated.ts` now fails here rather than on a phone.
- Mutation-check: dropping `Math.min` to `textWidth / em` fails exactly the cap test; restored by re-editing.
- Gate: 24 mushaf tests pass, eslint clean, `npm run type-check` red only on issue #54's two pre-existing errors.
- Commit `2de4e8f`.

### 2026-09-08 — Task 4: the line renderer

- 8 tests pass (the plan's 4, plus the separator strip, the clip, the centring and the tap).
- **Three plan defects corrected.** (a) The a11y test asserted `aria-hidden`, which `rnHosts` does not emit — it maps `importantForAccessibility` to `data-hidden-from-a11y`; asserted on that instead. (b) The colour test asserted `#ff0000` in the markup, but the DOM normalises hex to `rgb(255, 0, 0)`, so it could never pass however right the component was; reads `style.color` back per span now. (c) `pageFont` pulls `expo-font` → `expo-modules-core`, whose logger setup reads `__DEV__` and dies at import under jsdom; mocked, as `pageFont.test.ts` already does.
- `rnHosts` widened with `accessibilityElementsHidden` (iOS's half of the hide pair) as a dropped prop — unmapped, React lowercases it into an unknown DOM attribute.
- Mutation-checks, all three killing exactly one test and restored by re-editing: joining the words with a space; keeping the separator space; dropping `numberOfLines={1}`.
- Gate: **89 test files / 907 tests pass**, eslint clean, `npm run type-check` red only on issue #54's two pre-existing errors.
- Commit `273b823`.

### 2026-09-08 — Task 5: page chrome

- Geometry extracted to `packages/config/ornaments/surahBand.ts`, web repointed at it. The path is **byte-identical** to the one it replaced — 17,177 chars, compared against `git show HEAD:...` — which is the real proof of a lossless extraction.
- **The plan's Step 1 check was vacuous.** "Run web's suite, a diff in the rendered path means the extraction dropped something" — web's `SurahFrame.test.tsx` asserted neither the path nor the viewBox, so a corrupted `SURAH_BAND_VIEW_BOX` passed **both** suites green. Both now assert path and viewBox, and a re-mutation fails both. That is the gap that would have let a silent geometry loss ship.
- **Ruling — `BismillahLine` takes its text as a prop.** The plan said "reuse `Bismillah.tsx`'s string", but that component deliberately holds no string: 95:1 and 97:1 spell the basmala with a shadda on the ba and the other 110 do not, so a constant is wrong on two surahs. Task 7's `MushafPage` sources it from `ayahTexts` via `splitBasmala`, which it already has.
- **Ruling — `SurahBand` drops `surahId`.** Unused, and eslint refuses it. Web's frame puts numerals in the two medallion cutouts because it heads a scrolling surah; on a mushaf page the number is already in the footer and the cutouts are ~5dp wide at this band's height.
- Mutation-checks, each killing exactly one test: stretching the band off its 8.16:1 ratio; drawing the bismillah in the page's QCF font; hardcoding the footer's page label to English.
- Gate: mobile **90 files / 916 tests**, web **81 files / 485 tests**, both eslint clean, web `tsc` clean, mobile type-check red only on issue #54's two pre-existing errors.
- Commit `03db521`.

### 2026-09-08 — Task 6: highlight states

- `apps/mobile/src/mushaf/highlights.ts` + 7 tests (plan specified 5). Gate: mobile 91 files / 923 tests pass, eslint clean, type-check red only on issue #54's two pre-existing errors.
- **Ruling — the pulse peaks short of the accent.** The plan's own mutation-check (swap the audio and landing branches) is vacuous if a landing pulse at progress 1 resolves *to* the accent: both branches then return the same string. Bookmark sits 45% toward the accent, the pulse 80% of the way from there, so the swap now fails exactly the "audio wins" test. Cost if wrong: a landing pulse is slightly quieter than it could be.
- **Extra test — the spring overshoots.** `landingProgress` comes off a spring, so it exceeds 1; unclamped, the mix walks the channels past the accent and out of the byte range, rendering as an invalid colour instead of a loud one. Clamped, with a test; deleting the clamp fails only that test.
- Contrast, both themes, against each page ground: bookmark 10.75 (light) / 10.73 (dark), pulse peak 6.42-7.15 / 7.06-7.66, accent 5.68 / 6.31. All clear AA.

