# Phase S4b — Mushaf Two-Page Spread

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In landscape, the mushaf shows two facing pages and one swipe turns the leaf, like a book.

**Architecture:** Spreads are fixed pairs anchored from the right — recto odd, verso `recto+1` — so a page always sits on the same half and the 604 pages become 302 leaves. Both orientations use the one `PagerView` we already have: portrait gives it 604 single-page children, landscape gives it 302 two-cell children. There is no second pager and no custom page transition.

**Tech Stack:** react-native-pager-view 8.0.2 (both orientations), QCF page fonts via expo-font. **No new dependency, no Reanimated work in this phase.**

**Spec:** No separate spec. Owner rulings below, collected 2026-09-28 in session `session_019jJdHkf1ugay9RMWAkYPMy`. Depends on **S4a having landed** — the window classes and the orientation unlock come from there.

---

## Global Constraints

- **Portrait is not changing.** Single-page `PagerView`, today's behaviour, byte-for-byte. Every task asserts it.
- **The page transition is not changing either.** Android's own `PagerView` slide, in both orientations. No hinge, no curl, no custom gesture.
- Spread appears in **landscape only** (box wider than tall), ruling R-B2.
- Recto identifies the spread. Stored position stays **a single page number** — no user-DB change in this phase (R-B3).
- The QCF per-page render band is load-bearing: **whole-word glyphs drop outside a per-page size band**, and subsetting is not the cause (`qcf-page-font-render-band`). Halving the box halves the scale, which walks straight into it. Task 4 exists for this alone.
- 54 pages have header/bismillah line gaps; they must be checked in a spread, not assumed.
- 60fps target. The mushaf has already fought a glyph-atlas thrash at ~146 texture uploads/frame; a hardware layer plus memo took swipes from 92% janky/34ms to 8%/9ms (`mushaf-glyph-atlas-thrash`). Keep both.
- `packages/data` untouched. No schema change. **No §5 trigger** — no data layer, no trust boundary, no user-DB write.
- Commits end with the `Co-Authored-By` / `Claude-Session` trailers from S4a's constraints.

## Owner rulings

| # | Ruling |
|---|---|
| R-B1 | Two-page spread, "like a real book. one swipe turns page like a book with animation" |
| R-B2 | Landscape only. Portrait keeps one page |
| R-B3 | The right page (recto) identifies the spread |
| R-B4 | ~~Hinged flip now~~ — **superseded 2026-09-29 by the owner:** drop the hinge and the curl together, keep the plain slide. Both are a later phase, if ever |
| R-B5 | Mushaf gets **no kebab**. No new chrome in this phase at all |

### Rulings I made, with their cost

- **One pager, two modes — `spread` is a prop, not a second component.** With the hinge gone there is nothing `PagerView` cannot do, and a bespoke pager would have re-litigated the whole Android paging fight (`android-paging-snaps-from-predicted-fling`) for a transition we are no longer writing. *Cost if wrong:* `MushafPager` carries a branch. Cheap, and the alternative was two page renderers drifting apart.
- **The pager remounts on a mode flip (`key={mode}`).** Its child count goes 604 ↔ 302, which is the `numColumns` hazard in another costume. *Cost if wrong:* a rotation lands on a blank or wrong page — check 603 catches it.
- **Page 1 is a recto and sits alone.** In a printed mushaf Al-Fatiha faces Al-Baqara's opening, so the natural pairs are (1,2),(3,4)…(603,604) with nothing orphaned. Adopted because it orphans no page and keeps every recto odd. *Cost if wrong:* the pairing is off by one against the owner's physical copy — check 601 verifies against it, and the fix is one line in `spreadFor`.

## Traps

Same list as S4a §Traps applies. Four matter most here:

1. **A swipe begins as a press.** Press-feedback state held above the pager re-renders every mounted page at gesture start; keep it in the cell (`swipe-begins-as-a-press-on-content`).
2. **`PagerView` re-renders all its children on any prop change** (`android-paging-snaps-from-predicted-fling`). Halving the child count to 302 helps; the memo on the cell is still load-bearing.
3. **Glyph-atlas thrash.** The hardware layer plus the memo took swipes from 92% janky/34ms to 8%/9ms (`mushaf-glyph-atlas-thrash`). A spread draws two cells per leaf, so keep both on the cell, not on the leaf.
4. **A `useEffect` cleanup cannot see the new value** — this already broke mushaf Play once (`useeffect-cleanup-cannot-see-the-new-value`). The `focusPage` effect gains a spread branch; compare in the effect body.

---

## File Structure

**New**
- `apps/mobile/src/mushaf/spread.ts` — the pairing math. Pure, no RN.
- `apps/mobile/src/mushaf/spread.test.ts`

**Modified**
- `apps/mobile/src/screens/MushafScreen.tsx` — computes `spread = width > height` and passes it down.
- `apps/mobile/src/components/mushaf/MushafPager.tsx` — gains the `spread` prop and the leaf children; the page body is extracted into a shared `MushafPageCell` in the same file.
- `apps/mobile/src/mushaf/` page-scale helper (`mushafColumnWidth`) — a half-box variant.
- `apps/mobile/src/mushaf/highlightsContext.tsx` — highlight must resolve on either half.

---

### Task 1: The pairing math

**Files:**
- Create: `apps/mobile/src/mushaf/spread.ts`
- Create: `apps/mobile/src/mushaf/spread.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PAGE_MIN = 1`, `PAGE_MAX = 604`, `SPREAD_COUNT = 302`
  - `interface Spread { index: number; recto: number; verso: number | null }`
  - `spreadFor(page: number): Spread`
  - `spreadAt(index: number): Spread`
  - `spreadIndexFor(page: number): number`

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/src/mushaf/spread.test.ts
import { describe, expect, it } from 'vitest';
import { PAGE_MAX, SPREAD_COUNT, spreadAt, spreadFor, spreadIndexFor } from './spread';

describe('spreadFor', () => {
  it('puts an odd page on the right and its successor on the left', () => {
    // RTL: the recto leads. Page 3 is always the right half of its own
    // spread, never the left -- that is the whole of ruling R-B3.
    expect(spreadFor(3)).toEqual({ index: 1, recto: 3, verso: 4 });
  });

  it('resolves an even page to the spread it shares, still recto-identified', () => {
    // Page 4 is the LEFT half of spread (3,4). Asking for page 4 must not
    // invent a spread (4,5) -- that would make every page its own recto and
    // the pairing would shift by one every time you opened an even page.
    expect(spreadFor(4)).toEqual({ index: 1, recto: 3, verso: 4 });
  });

  it('opens with 1 and 2 facing each other', () => {
    expect(spreadFor(1)).toEqual({ index: 0, recto: 1, verso: 2 });
  });

  it('closes on 603 and 604 with nothing orphaned', () => {
    // 604 is even, so the last spread is full and SPREAD_COUNT is exact.
    expect(spreadFor(PAGE_MAX)).toEqual({ index: SPREAD_COUNT - 1, recto: 603, verso: 604 });
    expect(SPREAD_COUNT).toBe(302);
  });

  it('round-trips every page in the mushaf', () => {
    // The property that matters: a page is on exactly one spread, and that
    // spread contains it. A loop over all 604, because an off-by-one at one
    // end passes every spot check in the middle.
    for (let page = 1; page <= PAGE_MAX; page += 1) {
      const spread = spreadFor(page);
      expect([spread.recto, spread.verso]).toContain(page);
      expect(spreadAt(spread.index)).toEqual(spread);
      expect(spreadIndexFor(page)).toBe(spread.index);
    }
  });

  it('rejects a page outside the mushaf', () => {
    // The page arrives from a pager index and from stored state, so nothing
    // upstream has range-checked it.
    expect(() => spreadFor(0)).toThrow(RangeError);
    expect(() => spreadFor(605)).toThrow(RangeError);
    expect(() => spreadFor(1.5)).toThrow(RangeError);
    expect(() => spreadFor(Number.NaN)).toThrow(RangeError);
  });

  it('rejects a spread index outside the book', () => {
    expect(() => spreadAt(-1)).toThrow(RangeError);
    expect(() => spreadAt(SPREAD_COUNT)).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/mobile && npx vitest run src/mushaf/spread.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
// apps/mobile/src/mushaf/spread.ts
export const PAGE_MIN = 1;
export const PAGE_MAX = 604;
export const SPREAD_COUNT = 302;

export interface Spread {
  /** 0-based leaf index, for the pager. */
  index: number;
  /** The right-hand page. Always odd -- ruling R-B3. */
  recto: number;
  /** The left-hand page. Never null at 604 pages, but typed for it so a
   *  future edition with an odd page count cannot silently pair off the end. */
  verso: number | null;
}

function assertPage(page: number): void {
  if (!Number.isInteger(page) || page < PAGE_MIN || page > PAGE_MAX) {
    throw new RangeError(`page must be an integer in ${PAGE_MIN}..${PAGE_MAX}, got ${String(page)}`);
  }
}

/**
 * The leaf a page sits on.
 *
 * Pairs are anchored from the right and fixed: (1,2), (3,4) ... (603,604). So a
 * page is always on the same half of the same leaf, which is what makes "open
 * where I left off" land somewhere stable. Deriving the pair from whichever
 * page was asked for -- (4,5) for page 4 -- would shift the whole book by one
 * every time an even page was opened.
 */
export function spreadFor(page: number): Spread {
  assertPage(page);
  const recto = page % 2 === 1 ? page : page - 1;
  const verso = recto + 1 <= PAGE_MAX ? recto + 1 : null;
  return { index: (recto - 1) / 2, recto, verso };
}

export function spreadAt(index: number): Spread {
  if (!Number.isInteger(index) || index < 0 || index >= SPREAD_COUNT) {
    throw new RangeError(`spread index must be an integer in 0..${SPREAD_COUNT - 1}, got ${String(index)}`);
  }
  return spreadFor(index * 2 + 1);
}

export function spreadIndexFor(page: number): number {
  return spreadFor(page).index;
}
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/mobile && npx vitest run src/mushaf/spread.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Mutation-check**

Change `page % 2 === 1 ? page : page - 1` to just `page`: the even-page test and the round-trip must FAIL. Change `(recto - 1) / 2` to `recto / 2`: the round-trip must FAIL. Drop `assertPage`: the rejection test must FAIL. Restore each by editing — never `git restore`.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/mushaf/spread.ts apps/mobile/src/mushaf/spread.test.ts
git commit -m "feat(mobile/mushaf): recto-anchored spread pairing for 604 pages"
```

---

### Task 2: Landscape draws a spread, inside the pager we already have

**Files:**
- Modify: `apps/mobile/src/components/mushaf/MushafPager.tsx`
- Modify: `apps/mobile/src/screens/MushafScreen.tsx`
- Test: `apps/mobile/src/components/mushaf/MushafPager.test.tsx`, `apps/mobile/src/screens/MushafScreen.test.tsx`

**Interfaces:**
- Consumes: `spreadFor`, `spreadAt`, `spreadIndexFor`, `SPREAD_COUNT` from Task 1; `useWindowDimensions`.
- Produces: `MushafPager` gains one optional prop — `spread?: boolean` (default `false`). Everything else about its signature is unchanged. In spread mode its `onPageChange` reports the **recto** of the leaf turned to.

There is no bespoke pager and no hinge in this phase (see *Rulings I made*). A
spread is the same `PagerView` with 302 children instead of 604, each child
holding two page cells in a `row-reverse` row. That keeps Android's own fling —
the thing `react-native-pager-view` was adopted for after
`decelerationRate="fast"` made pages *harder* to turn — identical in both
orientations, and it halves the child count rather than adding a second pager.

- [ ] **Step 1: Write the failing test**

```tsx
  it('renders one page per child in portrait, exactly as it does today', () => {
    // Portrait is not changing. A regression here is the phase failing.
    render(<MushafPager {...props} initialPage={3} />);
    const cells = screen.getAllByTestId('mushaf-page-cell');
    expect(cells).toHaveLength(1);
    expect(cells[0].dataset.page).toBe('3');
  });

  it('renders two page cells per child in spread mode', () => {
    render(<MushafPager {...props} spread initialPage={3} />);
    expect(screen.getAllByTestId('mushaf-page-cell').map((c) => c.dataset.page))
      .toEqual(['3', '4']);
  });

  it('puts the recto on the right in the layout, not just in the data', () => {
    // RTL. A row that renders [recto, verso] left-to-right reads backwards and
    // is invisible in a data-only assertion.
    render(<MushafPager {...props} spread initialPage={3} />);
    expect(screen.getByTestId('mushaf-leaf').style.flexDirection).toBe('row-reverse');
  });

  it('opens an even page on its own leaf, not as a recto', () => {
    // Rotating on page 4 must land on leaf (3,4) with 4 on the LEFT -- not
    // rebuild the book around 4 as a recto.
    render(<MushafPager {...props} spread initialPage={4} />);
    expect(screen.getAllByTestId('mushaf-page-cell').map((c) => c.dataset.page))
      .toEqual(['3', '4']);
  });

  it('gives each half exactly half the box', () => {
    // A cell handed the full width overflows the leaf and the QCF page is
    // clipped rather than scaled -- which looks like a font bug, not a layout one.
    render(<MushafPager {...props} spread width={1400} initialPage={3} />);
    for (const cell of screen.getAllByTestId('mushaf-page-cell')) {
      expect(cell.dataset.width).toBe('700');
    }
  });

  it('reports the recto when a leaf settles', () => {
    // The caller stores a page number (R-B3, no data change), so a leaf turn
    // has to hand back a page and not a leaf index.
    const onPageChange = vi.fn();
    const { settleOn } = renderPager({ spread: true, initialPage: 3, onPageChange });
    settleOn(2); // leaf index 2 == pages 5,6
    expect(onPageChange).toHaveBeenCalledWith(5);
  });

  it('remounts the pager when the mode flips', () => {
    // PagerView does not survive its child count changing under it (604 -> 302)
    // any more than a FlatList survives a numColumns change: the key is what
    // forces the remount, and without it a rotation lands on the wrong page or
    // on a blank one.
    const { rerender } = render(<MushafPager {...props} initialPage={3} />);
    const before = screen.getByTestId('mushaf-pager').dataset.mode;
    rerender(<MushafPager {...props} spread initialPage={3} />);
    expect(screen.getByTestId('mushaf-pager').dataset.mode).not.toBe(before);
  });
```

`renderPager` is a helper in this test file that renders the pager and returns
`settleOn(index)`, which fires the component's own `onPageSelected` contract —
assert against the contract the component listens for, not a simulated raw
touch stream.

And in `MushafScreen.test.tsx`:

```tsx
  it('decides on the box, not on the window class', () => {
    // A 1000x1400 medium-class tablet in portrait is still portrait: two pages
    // there would be tall and narrow and would walk into the QCF render band.
    win.width = 1000; win.height = 1400;
    renderScreen();
    expect(screen.getByTestId('mushaf-pager').dataset.spread).toBe('false');
  });

  it('asks for a spread when the box is wider than it is tall', () => {
    win.width = 1400; win.height = 900;
    renderScreen();
    expect(screen.getByTestId('mushaf-pager').dataset.spread).toBe('true');
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd apps/mobile && npx vitest run src/components/mushaf/MushafPager.test.tsx src/screens/MushafScreen.test.tsx`
Expected: FAIL — `spread` is not a prop; no `mushaf-leaf`.

- [ ] **Step 3: Implement the pager**

Extract today's page body into `MushafPageCell` with **no behaviour change** —
same fonts, same `memo`, same `renderToHardwareTextureAndroid`, same per-page
query. Both modes then render the identical cell (§3 DRY: two page renderers is
where one gains a fix and the other keeps the bug). Give it
`testID="mushaf-page-cell"` and a `width` prop.

```tsx
const LEAVES = Array.from({ length: SPREAD_COUNT }, (_, i) => i);

// PagerView holds its children by index. Flipping between 604 and 302 children
// under a live pager is the same hazard as changing a FlatList's numColumns:
// remount, or land on the wrong page.
const mode = spread ? 'spread' : 'single';
const halfWidth = Math.floor(width / 2);

<PagerView
  key={mode}
  testID="mushaf-pager"
  data-mode={mode}
  initialPage={spread ? spreadIndexFor(clampPage(initialPage)) : clampPage(initialPage) - MUSHAF_PAGE_MIN}
  onPageSelected={(e) => {
    const i = e.nativeEvent.position;
    onPageChange(spread ? spreadAt(i).recto : PAGES[i]);
  }}
  ...
>
  {spread
    ? LEAVES.map((i) => {
        const { recto, verso } = spreadAt(i);
        return (
          <View key={i}>
            {/* row-reverse: RTL, the recto is the RIGHT half. */}
            <View testID="mushaf-leaf" style={{ flex: 1, flexDirection: 'row-reverse' }}>
              <MushafPageCell page={recto} width={halfWidth} {...cellProps} />
              {verso !== null ? <MushafPageCell page={verso} width={halfWidth} {...cellProps} /> : null}
            </View>
          </View>
        );
      })
    : PAGES.map((page) => (
        <View key={page}>
          <MushafPageCell page={page} width={width} {...cellProps} />
        </View>
      ))}
</PagerView>
```

Keep `WINDOW` and the existing draw-window logic; in spread mode the window is
measured in leaves, so one leaf either side draws — two cells each, the same
three-pages-worth of glyph atlas portrait already carries.

The `focusPage` effect resolves through `spreadIndexFor` in spread mode and
stays page-indexed otherwise.

- [ ] **Step 4: Implement the screen branch**

```tsx
  const { width, height } = useWindowDimensions();
  // The box, not the window class: a 1000dp portrait tablet is still portrait,
  // and two pages in a tall narrow box lands outside the QCF render band.
  const spread = width > height;
```

Pass `spread` straight through to `MushafPager`. No second component, no branch
in the screen body beyond this one prop.

- [ ] **Step 5: Run the tests**

Run: `cd apps/mobile && npx vitest run src/screens/MushafScreen.test.tsx src/components/mushaf && npx tsc --noEmit && npx eslint .`
Expected: PASS, and every existing mushaf test passes unchanged.

- [ ] **Step 6: Mutation-check**

Change `width > height` to `width >= 840`: the "decides on the box" test must
FAIL. Change `row-reverse` to `row`: the recto test must FAIL. Delete
`key={mode}`: the remount test must FAIL. Hand both cells `width` instead of
`halfWidth`: the half-box test must FAIL. Restore each by editing — never
`git checkout` or `git restore`.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/screens/MushafScreen.tsx apps/mobile/src/components/mushaf
git commit -m "feat(mobile/mushaf): draw a two-page spread in landscape

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019jJdHkf1ugay9RMWAkYPMy"
```

---

### Task 3: Page scale inside a half-box, against the render band

**Files:**
- Modify: the page-scale helper in `apps/mobile/src/mushaf/` (`mushafColumnWidth` and its test)
- Create: `apps/mobile/scripts/SPREAD-BAND-CHECK.md` — the measured band per sampled page

**Interfaces:**
- Consumes: the existing `mushafColumnWidth(...)`.
- Produces:
  - `mushafHalfColumnWidth(input: { boxWidth: number; boxHeight: number; page: number }): number` — the existing contract, for a half-box.
  - `mushafHalfEmScale(input: { boxWidth: number; boxHeight: number; page: number }): number` — the same fit expressed as the em scale the QCF band is stated in (11.91-18.17), so the band can be asserted in a test rather than only seen on device.

**This task is the phase's real risk.** QCF whole-word glyphs **drop out entirely** outside a per-page size band, and subsetting is not the cause. A spread halves each page's box, which halves the scale. Nothing in jsdom can see a dropped glyph — this is measured on device or not at all.

- [ ] **Step 1: Write the failing test for the geometry**

```ts
  it('fits a page in half the box, not the whole box', () => {
    // A spread gives each page half the width. Passing the full width silently
    // draws each page at twice the scale and they overlap at the spine.
    const full = mushafColumnWidth({ boxWidth: 1400, boxHeight: 900, page: 3 });
    const half = mushafHalfColumnWidth({ boxWidth: 1400, boxHeight: 900, page: 3 });
    expect(half).toBeLessThan(full);
    expect(half).toBeLessThanOrEqual(1400 / 2);
  });

  it('keeps the two halves of one leaf at the same scale', () => {
    // Facing pages at different scales is immediately visible and reads as a
    // rendering bug. Pre-justified lines mean each page's own width differs,
    // so this has to be asserted, not assumed.
    const recto = mushafHalfColumnWidth({ boxWidth: 1400, boxHeight: 900, page: 3 });
    const verso = mushafHalfColumnWidth({ boxWidth: 1400, boxHeight: 900, page: 4 });
    expect(recto).toBe(verso);
  });

  it('reports a scale inside the known render band', () => {
    // The corpus-derived band is 11.91-18.17em (phase M7c). A half-box scale
    // outside it is a page of missing words, and no unit test can see the
    // glyphs -- so the number is asserted here and the pixels on device.
    const em = mushafHalfEmScale({ boxWidth: 1400, boxHeight: 900, page: 3 });
    expect(em).toBeGreaterThanOrEqual(11.91);
    expect(em).toBeLessThanOrEqual(18.17);
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/mobile && npx vitest run src/mushaf`
Expected: FAIL — `mushafHalfColumnWidth` does not exist.

- [ ] **Step 3: Implement**

`mushafHalfColumnWidth` takes the same inputs and divides the available width by two before the existing fit runs — and takes the scale from the **narrower** of the two facing pages so both halves land on one number. Do not reimplement the fit; call the existing one with a halved box (§3).

- [ ] **Step 4: Sweep every page in the simulator**

Run the fit over all 604 pages at the Tab S10+ landscape box and at the Fold's 939dp box, and write the pages whose computed em scale falls outside 11.91-18.17 into `SPREAD-BAND-CHECK.md`. **If any page falls outside the band, stop and report** — the spread may need a fixed scale with letterboxing rather than a per-page fit, and that is a ruling for the owner, not a decision for this task.

- [ ] **Step 5: Run the tests**

Run: `cd apps/mobile && npx vitest run src/mushaf && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Mutation-check**

Remove the halving: the "fits in half the box" test must FAIL. Take the scale from the wider page instead of the narrower: the same-scale test must FAIL. Restore by editing.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/mushaf apps/mobile/scripts/SPREAD-BAND-CHECK.md
git commit -m "feat(mobile/mushaf): fit a page to a half-box inside the QCF render band"
```

---

### Task 4: Position, highlight and playback across a leaf

**Files:**
- Modify: `apps/mobile/src/mushaf/highlightsContext.tsx`
- Modify: `apps/mobile/src/screens/MushafScreen.tsx`
- Test: `apps/mobile/src/mushaf/highlightsContext.test.tsx`, `src/screens/MushafScreen.test.tsx`

**Interfaces:**
- Consumes: `spreadFor`; the existing `recordReadingPosition` call path — **unchanged signature, no data change** (R-B3).
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

```tsx
  it('records the recto when a leaf is turned to', () => {
    // Stored state stays one page number. The recto is the stable identity of
    // a leaf, so reopening lands on the same paper.
    const record = vi.fn();
    const { turnForward } = renderSpread({ page: 3, record });
    turnForward();
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ page: 5 }));
  });

  it('highlights an ayah on the left half as readily as the right', () => {
    // The highlight resolves by page, and a spread has two. A lookup that
    // only checks the recto leaves half the book unhighlightable during
    // playback -- and playback is exactly when it matters.
    renderSpread({ page: 3 });
    expect(highlightedPagesFor({ surahId: 2, ayahNumber: 20 })).toContain(4);
  });

  it('turns the leaf when playback crosses onto the next one', () => {
    // Playback advancing from the verso to the next recto has to turn the
    // leaf, not sit on a page that no longer holds the ayah being recited.
    const { advanceToAyahOnPage } = renderSpread({ page: 3 });
    advanceToAyahOnPage(5);
    expect(screen.getByTestId('mushaf-spread').dataset.recto).toBe('5');
  });

  it('does not turn the leaf while playback stays on the same leaf', () => {
    // Crossing from recto to verso is the SAME leaf. Turning there would flip
    // the page away from the ayah being recited on it.
    const { advanceToAyahOnPage } = renderSpread({ page: 3 });
    advanceToAyahOnPage(4);
    expect(screen.getByTestId('mushaf-spread').dataset.recto).toBe('3');
  });
```

That fourth test is the one that catches the real bug here: "advance a page" logic written for a single-page pager turns on every page change, and on a spread half of those changes are already on screen.

- [ ] **Step 2: Run them and watch them fail**

Run: `cd apps/mobile && npx vitest run src/mushaf/highlightsContext.test.tsx src/screens/MushafScreen.test.tsx`
Expected: FAIL on the leaf-awareness tests.

- [ ] **Step 3: Implement**

Compare **leaf index**, not page, when deciding to turn: `spreadFor(target).index !== spreadFor(current).index`. Make the highlight lookup accept both of a leaf's pages. Keep `recordReadingPosition`'s existing validated call — do not add a second writer.

Note: the mushaf ignores the Continuous-play setting by design (M7 device run vc11). Do not "fix" that here.

- [ ] **Step 4: Run the tests**

Run: `cd apps/mobile && npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: PASS, whole suite.

- [ ] **Step 5: Mutation-check**

Compare pages instead of leaf indices: the "does not turn while on the same leaf" test must FAIL. Restore by editing.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/mushaf apps/mobile/src/screens/MushafScreen.tsx
git commit -m "fix(mobile/mushaf): treat a leaf as one unit for position, highlight and playback"
```

---

### Task 5: Build, device run, and the verification log

Build and install exactly as S4a Task 11 (prebuild only if a native dep changed — nothing here adds one, so a Gradle `assembleRelease` is enough; `taskset -c 7,8` still mandatory, `adb install -r --user 0` still mandatory, APK served as a copy named for the versionCode verified with an explicitly-resolved `aapt2`).

| # | Check | Result |
|---|---|---|
| 600 | Landscape shows two pages, recto on the RIGHT | |
| 601 | Pairing matches the owner's physical mushaf for pages 1-2, 3-4, 603-604 | |
| 602 | Portrait still one page, identical to vc72 | |
| 603 | Rotate on page 4 → leaf (3,4), page 4 on the left; rotate back → page 4 | |
| 604 | framestats gaps inside a landscape turn, 3 repeats — no UI-thread stall (two cells per leaf) | |
| 605 | 10 fast swipes in a burst — no blank leaf, no missed mount | |
| 606 | Every glyph present on 20 sampled pages incl. the 54 with header/bismillah gaps | |
| 610 | Playback crossing recto→verso does not turn; verso→next recto does | |
| 611 | Highlight lands on an ayah on the left half | |
| 612 | Close on a landscape leaf, reopen in portrait — lands on the recto | |
| 613 | Page-jump sheet lands on the right leaf | |
| 614 | Phone regression: mushaf unchanged | |

- [ ] Record every result, fill the Verification Log, commit, push. **Do not open the PR** — that is the owner's call.

## Acceptance criteria

- [ ] Landscape draws a recto-right spread; portrait is unchanged.
- [ ] One swipe turns one leaf, on Android's own `PagerView` slide — the same feel as portrait.
- [ ] Every page's half-box scale sits inside the 11.91-18.17em render band, evidenced by the sweep in `SPREAD-BAND-CHECK.md` **and** check 606.
- [ ] Stored position is still a single page number. No migration, no user-DB write.
- [ ] Playback and highlight treat a leaf as one unit.
- [ ] Suite, type-check and lint green; every branch mutation-checked.
- [ ] Checks 600-606 and 610-614 run and recorded.

## Risks and rollbacks

| Risk | Mitigation | Rollback |
|---|---|---|
| Half-box scale leaves the QCF band → missing words | Task 4 sweeps all 604 before any device build; check 606 | Fixed scale with letterboxing instead of a per-page fit — owner ruling needed |
| Two QCF cells per leaf costs frames | framestats gaps, 3 repeats, check 604; memo + hardware layer kept on the cell | Drop the draw window to the current leaf only |
| Mode flip lands on a blank page | `key={mode}` remount, mutation-checked; check 603 | Revert to portrait-only — one prop, one line in the screen |
| Pairing off-by-one vs the printed mushaf | Check 601 against the owner's own copy | One line in `spreadFor` |

## Out of scope

- **Any custom page-turn animation** — hinge and curl both (owner, 2026-09-29). The curl additionally needs Skia and a rasterised page; a mushaf page is live QCF `Text`.
- Any new mushaf chrome (R-B5) — the khatm ribbon is S4c.
- Portrait spreads, at any width.
- Changing what position is stored.

## Verification log

### Desk work, 2026-10-01

Tasks 1-4 implemented, each mutation-checked, each committed on
`feat/s4b-mushaf-spread`. Task 5 — the build and the device run — is owed, and
the phase is not complete until it is run: no device has seen a leaf.

| Task | Commit | What landed |
|---|---|---|
| 1 | `d73030c` | `spread.ts` — recto-anchored pairing, bounds from the shared package |
| 3 | `b319336` | one type size per leaf; `SPREAD-BAND-CHECK.md`; `MushafPage` size override |
| 2 | `02f4876` | the pager's spread mode, the leaf, the mode remount, the leaf focus guard |
| 4 | `65205ea` | the ayah-text window widened by a page either side on a spread |
| — | `576a6ec` | self-review fixes: the reader's place survives a rotation; the text inset moved to `pageScale` |

Task 3 ran before Task 2, because the pager needs `mushafLeafFontSize`.

Gates: `tsc --noEmit` clean, `eslint src app` clean, `vitest run` **129 files,
1583 tests** (1540 before this phase). Portrait's 119 existing mushaf tests pass
unchanged, which is the phase's own hard constraint, and three new ones assert
it stays that way.

**Four tests were caught asserting nothing by the mutation step, not by review.**
Worth recording because each looked right:

1. `?? leafFontSize` in `MushafPage` passed with the fix deleted — not a vacuous
   test but genuinely redundant code, since `mushafColumnForFontSize` is the
   exact inverse of `mushafFontSize`. In the one case the two differ, a size too
   large for the half, the `??` was the worse of the two.
2. The mode-remount test asserted child counts, which change with or without
   `key={mode}`. It now goes through `pagerHost`'s per-node command log, where a
   surviving pager instance carries its pre-flip history.
3. The shared-leaf-size tests used pages 53/54, which both clamp at the font cap
   and therefore agree however the code is written. 298 of 302 leaves are like
   that at the Tab S10+ half-box; the tests now use leaf 27, one of the four
   where the halves genuinely diverge.
4. The forward half of Task 4's widening passed both ways because the fixture
   ran out of pages and both widths fell through to `LAST_SURAH_ID`.

**Self-review (§4 step 2) found two defects the tests could not.** Both need a
render that actually flips mode, and every spread test written for Task 2
rendered one mode only:

- `initialPage` was still derived from the prop — the page the reader *launched*
  on — so a reader who opened on 106 and swiped to 300 was dragged back to 106
  on every rotation.
- `current`, which decides what draws, survived the flip holding the old mode's
  unit. Portrait page 106 is index 105; read as a leaf index that is leaf 105,
  pages 211-212, so the drawn window sat a hundred leaves from the leaf on
  screen and a rotation landed on blank paper.

`key={mode}` remounts the PagerView but **not** `MushafPager` itself, which is
what both defects turn on. The real ViewPager2 fires `onPageSelected` at mount
and would probably have papered over the second one after a frame; relying on
that is not a fix. Check 608 below is the device half.

The same pass caught a §3 violation: the leaf sized its halves against a `32`
restated in the pager beside `MushafPage`'s own `2 * PAGE_MARGIN`, with a comment
admitting the two had to match. It is now `MUSHAF_PAGE_TEXT_INSET` in
`pageScale.ts` — not in `MushafPage`, which the pager's own tests mock, and
importing from there broke 15 of them and said where the constant belonged.

### Checks owed (Task 5)

Nothing in the table below has been run.

**APK ready.** versionCode 79, release, arm64-v8a, built at `576a6ec`, 194 MB.
Served as a copy, not a symlink: `~/apks/quran-corpus-vc79.apk`. versionCode
verified `79` with `/home/claude/android-sdk/build-tools/35.0.0/aapt2 dump
badging` on the served copy, not on the build output. Debug-signed, so it cannot
upgrade over an EAS build — uninstall first if one is present.

```bash
/home/claude/android-sdk/platform-tools/adb -s adb-R52XC0AYMZZ-S3tLzk._adb-tls-connect._tcp \
  install -r --user 0 ~/apks/quran-corpus-vc79.apk
```

`--user 0` is mandatory: an unqualified `adb install -r` once landed on user 10
(Guest) and wiped user-0 app data.

| # | Check | Result |
|---|---|---|
| 600 | Landscape shows two pages, recto on the RIGHT | |
| 601 | Pairing matches the owner's physical mushaf for 1-2, 3-4, 603-604 | |
| 602 | Portrait still one page, identical to vc72 | |
| 603 | Rotate on page 4 → leaf (3,4), page 4 on the left; rotate back → page 4 | |
| 604 | framestats gaps inside a landscape turn, 3 repeats — no UI-thread stall | |
| 605 | 10 fast swipes in a burst — no blank leaf, no missed mount | |
| 606 | Every glyph present on 20 sampled pages incl. the 54 with header/bismillah gaps | |
| 607 | **New.** Both halves of leaf 27, 177, 399 or 443 at the same type size — the four where they diverge | |
| 608 | **New.** Open on page 1, swipe to ~300, rotate — lands on the leaf holding 300, not back on 1, and both halves draw | |
| 610 | Playback crossing recto→verso does not turn; verso→next recto does | |
| 611 | Highlight lands on an ayah on the left half | |
| 612 | Close on a landscape leaf, reopen in portrait — lands on the recto | |
| 613 | Page-jump sheet lands on the right leaf | |
| 614 | Phone regression: mushaf unchanged | |
| 615 | **New.** Landscape, recite through a leaf that carries a surah seam (page 106: surah 4 ends, 5:1 is printed below) — audio carries on through the verso and then turns to the next leaf | |
| 616 | **New.** Landscape, saved position on an EVEN page (108) — both halves draw their surah band and bismillah line, not only their words | |
| 617 | **New.** Short wide box: split-screen or a freeform window dragged flat — lines do not overlap, and the type shrinks instead | |

Check 607 is new, from ruling R-X4: the shared leaf size is only observable on
four leaves out of 302, so a spot check anywhere else in the book cannot see it.

Carried forward from S4a and still owed: 519 (the phone regression, S4a's own
exit criterion), the phone half of 520, 518, 514's spoken announcement, and the
rail-tap spinner check. 614 here is the same phone build, so one phone session
can clear both phases' phone checks.

---

## APK, versionCode 80

Built 2026-10-01 at `a6e1967`, release / arm64-v8a, 202972589 bytes, `BUILD
SUCCESSFUL in 1m 38s`. Served as a **copy** at `~/apks/quran-corpus-vc80.apk`
(194M), versionCode verified `80` on that copy with `aapt2 dump badging`.

vc79 is superseded and should not be used: it predates the review round, and
checks 603, 610 and 615-617 all test behaviour its four fixes change.

The first vc80 attempt built as **79**. `app.json`'s `versionCode` does not
reach Gradle — `android/` is `expo prebuild` output, so the live value is
`android/app/build.gradle` and only a prebuild syncs them. The build exits 0 and
hands back the old number, so the only thing that catches it is reading
`aapt2 dump badging` off the copy that is actually served.

Debug-signed, so it cannot upgrade over an EAS build — uninstall one first if
present.

```bash
/home/claude/android-sdk/platform-tools/adb -s adb-R52XC0AYMZZ-S3tLzk._adb-tls-connect._tcp \
  install -r --user 0 ~/apks/quran-corpus-vc80.apk
```

`--user 0` is not optional: an unqualified `-r` once landed on user 10 (Guest)
and wiped user-0 app data.

---

## Independent review, 2026-10-01

Run at the owner's request on `main...HEAD`. §5 applies: `spread.ts` adds a
range validator on a page number arriving from the user DB, and the pager's
settle path writes the reading position, so the trust-boundary and on-device-DB
triggers both fire. One pass, five findings, four fixed and one subsumed.

The review confirmed the parts the phase turns on — the pairing math, the
leaf-size algebra, `row-reverse`, `key={mode}`, the render-phase unit
re-derivation and `initialPage={indexOf(settled.current)}`. Every finding was
in what sits *above* the pager, and every one of them came from the same thing
the tests could not see: a leaf has two pages and everything above it still
speaks in one.

| # | Finding | Disposition |
|---|---|---|
| 1 | `settled` holds the portrait page across a flip, so rotating off an even page reports its recto and rewrites the reading position | Fixed `6b2aa36` — compare by leaf identity, report nothing when the position is already on this leaf |
| 2 | The same-leaf focus guard refused the turn silently, so continuous recitation stalled at every surah seam in landscape | Fixed `6b2aa36` — report the half without turning to it |
| 3 | `pageLines` is the recto's rows only, so the page-audio helpers are blind to the verso | Subsumed by 2: `currentPage` now follows the playhead across the leaf, so the seam logic reads the half being recited. "Play this page" still starts at the recto and flows through the verso, which is the leaf's reading order and not a defect |
| 4 | The type size is fitted to width alone; nothing clamps it to the line box, so a short wide box draws glyphs taller than their slots | Fixed `c2c760c` — fit to the line box before the column is built |
| 5 | The widened surah window assumed `page` was a recto; it can be a verso | Fixed `7e43261` — anchor on `spreadFor(page).recto`, guarded |

Finding 4 is pre-existing — landscape single-page was worse, clamped at
`MUSHAF_MAX_FONT_SIZE` under a tall box — but the band check validated only the
width axis and this phase makes landscape the headline mode. The fix caps the
type at exactly one line box, which is the unarguable part: a glyph taller than
its slot cannot not overlap. Whether that ratio *reads* comfortable is a device
question, not a desk one — every shipping configuration today sits at
`lineHeight / fontSize` ≥ 1.49, and the Tab S10+ in landscape lands near 1.12.
Check 606 is where that gets measured; if it reads tight, the fix is a factor on
the clamp, with the number taken from that run.

Gates after the fixes: `tsc --noEmit` exit 0, `eslint src app` exit 0,
`vitest run` 129 files / **1589 tests** (1583 before this round). Six new tests.
Each of the four fixes was mutation-checked and its test fails when the fix is
deleted; a fifth mutation — moving the line-box clamp to *after* the column is
built — fails the column test and passes the size test, which is what makes
those two tests distinct rather than one assertion twice. The leaf-invariant
test under the clamp is a regression guard only: both halves are handed the same
height, so no plausible mutation separates them.

---

## Execution rulings, 2026-10-01

The plan was written against the mushaf as described in the M7 notes, not as the
code actually stands after M7d and S4a. Five of its interfaces do not exist.
Each divergence is ruled on here rather than implemented as written, with what
it costs if the ruling is wrong.

**R-X1 — `spread` is derived in `MushafReader` from its measured box, not in
`MushafScreen` from `useWindowDimensions`.** The plan's own test says "decides
on the box, not on the window class", and the box is already measured:
`MushafReader` sizes the pager from an `onLayout`, precisely because the window
is taller than the pager by the status bar, `MushafTopStrip` and the tab bar.
Reading `useWindowDimensions` in the screen would introduce a second, less
accurate source for the same number, and near square the two disagree — a
1000x1050 window is portrait while its inner box may be 1000x900, which is
landscape. *Cost if wrong:* the spread appears at a slightly different aspect
than the window's; never a wrong page. The test moves from `MushafScreen.test`
to `MushafReader.test`, where the layout event can be fired.

**R-X2 — no `MushafPageCell` extraction.** The plan asks for the page body to be
pulled out into a shared cell. It already is: `PagerPage` in `MushafPager.tsx`
is the memoised, hardware-layered, per-page-query cell, and `MushafPage` beneath
it already takes `width`/`height` and scales itself. Both halves of a leaf
render the same `PagerPage`. *Cost if wrong:* none identified — the extraction
the plan wanted is a no-op against this code, and doing it anyway would be a
rename with no behaviour.

**R-X3 — Task 3's render band is a misreading; the real constraint is the font
cap.** The plan asserts each half-box scale lands inside "the 11.91-18.17em
render band". That range is `MUSHAF_PAGE_WIDEST_EM`'s min and max — each page's
widest line measured in em, a constant of the page's own content that does not
move when the box does. Asserting a computed scale against it would pass for
every implementation, which is exactly the vacuous assertion §4 step 4 exists to
catch. The real band is `MUSHAF_MAX_FONT_SIZE = 40`: above ~44px Android drops
pieces of these whole-word outlines (M7b device run). Halving the box lowers the
font, which moves *away* from that ceiling — so the spread cannot walk into the
documented defect, and the plan's stated "phase's real risk" does not exist.
What does exist is replaced below. *Cost if wrong:* a size floor nobody has
measured, caught by check 606 on 20 sampled pages.

**R-X4 — the real Task 3 defect is that facing pages would draw at different
type sizes.** Each page's font comes from its own `widestEm`, so page 3 (15.71em)
and a neighbour at 17.2em land on different sizes and different column widths in
identical halves. In print both pages of a leaf are the same size and the
narrower page simply keeps more margin. So a leaf resolves ONE font size — the
smaller of its two pages' fits — and each page's column follows from it. New in
`pageScale.ts`: `mushafPageFontSize`, `mushafLeafFontSize`,
`mushafColumnForFontSize`, all delegating to the existing `mushafFontSize` /
`mushafColumnWidth` pair so there is still one formula. `MushafPage` gains an
optional `fontSize` override and is byte-identical without it (proved
algebraically both ways in the commit body, and asserted). *Cost if wrong:* the
leaf is set from the wrong page and one half has slack it did not need.

**R-X5 — highlights already resolve per word, so there is nothing page-keyed to
fix.** Task 4 asks for "the highlight lookup to accept both of a leaf's pages".
`HighlightInput` is keyed `surah:ayah` and `MushafPagerProps.ayahTexts` is
documented "Page-agnostic lookups, shared by every mounted page" — a page draws
whatever marks its own words carry. The left half is already highlightable.
`highlightsContext.tsx` is untouched. What Task 4 is really about is the leaf
guard, and that is one condition in the pager's `focusPage` effect: compare leaf
indices, not pages, so playback crossing recto to verso does not turn a leaf
that is already showing the ayah being recited. *Cost if wrong:* nothing — the
device checks 610 and 611 cover both halves of the claim.

**R-X6 — the draw window stays at one leaf either side (6 pages drawn, against
portrait's 3).** The plan claims a spread carries "the same three-pages-worth of
glyph atlas"; it is six. Narrowing to the current leaf only would halve that,
but `offscreenPageLimit` has to stay in step with the drawn window or a swipe
lands on a cell that draws nothing, and a blank leaf mid-turn is a visible
defect where a doubled footprint is not. *Cost if wrong:* memory and atlas
pressure in landscape. Checks 604 and 605 measure it; the rollback is already
in the plan's risk table — drop the spread window to the current leaf.

**R-X7 — `spread.ts` takes its page bounds from `@quran-corpus/data/mobile`.**
The plan declares its own `PAGE_MIN`/`PAGE_MAX`; `MUSHAF_PAGE_MIN` and
`MUSHAF_PAGE_MAX` are already the shared source of that fact and
`MushafPager.tsx` imports them. A second copy is a §3 violation waiting to
disagree. `SPREAD_COUNT` is derived, not written. *Cost if wrong:* none.
