# Phase S4b — Mushaf Two-Page Spread

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In landscape, the mushaf shows two facing pages and one swipe turns the leaf with a hinged flip, like a book.

**Architecture:** Spreads are fixed pairs anchored from the right — recto odd, verso `recto+1` — so a page always sits on the same half and the 604 pages become 302 leaves. Portrait keeps today's single-page `PagerView` untouched; landscape renders a bespoke Reanimated pager holding three spreads, which is what makes a hinged turn possible at all.

**Tech Stack:** react-native-pager-view 8.0.2 (portrait, unchanged), Reanimated 4.5.1 + react-native-gesture-handler 2.32.0 (landscape spread), QCF page fonts via expo-font.

**Spec:** No separate spec. Owner rulings below, collected 2026-09-28 in session `session_019jJdHkf1ugay9RMWAkYPMy`. Depends on **S4a having landed** — the window classes and the orientation unlock come from there.

---

## Global Constraints

- **Portrait is not changing.** Single-page `PagerView`, today's behaviour, byte-for-byte. Every task asserts it.
- Spread appears in **landscape only** (box wider than tall), ruling R-B2.
- Recto identifies the spread. Stored position stays **a single page number** — no user-DB change in this phase (R-B3).
- The QCF per-page render band is load-bearing: **whole-word glyphs drop outside a per-page size band**, and subsetting is not the cause (`qcf-page-font-render-band`). Halving the box halves the scale, which walks straight into it. Task 4 exists for this alone.
- 54 pages have header/bismillah line gaps; they must be checked in a spread, not assumed.
- Reduced motion (`reduceMotion` setting) falls back to the slide. No hinge (§8).
- 60fps target. The mushaf has already fought a glyph-atlas thrash at ~146 texture uploads/frame; a hardware layer plus memo took swipes from 92% janky/34ms to 8%/9ms (`mushaf-glyph-atlas-thrash`). Keep both.
- `packages/data` untouched. No schema change. **No §5 trigger** — no data layer, no trust boundary, no user-DB write.
- Commits end with the `Co-Authored-By` / `Claude-Session` trailers from S4a's constraints.

## Owner rulings

| # | Ruling |
|---|---|
| R-B1 | Two-page spread, "like a real book. one swipe turns page like a book with animation" |
| R-B2 | Landscape only. Portrait keeps one page |
| R-B3 | The right page (recto) identifies the spread |
| R-B4 | Hinged flip now (rotateY about the spine); the true paper curl is a later phase |
| R-B5 | Mushaf gets **no kebab**. No new chrome in this phase at all |

### Rulings I made, with their cost

- **Bespoke Reanimated pager for the spread; `PagerView` stays for portrait.** `PagerView` exposes no way to replace its transition, so a hinge is impossible inside it. A bespoke pager also sidesteps its other known problem — it re-renders all 604 children on any prop change. *Cost if wrong:* landscape paging feel differs from portrait's Android fling, which is exactly the thing we moved to `PagerView` to get right. Mitigation: Task 3 lands the spread on a slide and **check 604 compares the feel against portrait before the hinge is written**. If the feel is wrong, the fallback is a spread inside `PagerView` with no hinge, and R-B4 gets renegotiated.
- **Three mounted spreads, not a window of pages.** Previous, current, next. *Cost if wrong:* a fast repeated swipe outruns the mount; check 605 is a 10-swipe burst.
- **Page 1 is a recto and sits alone.** In a printed mushaf Al-Fatiha faces Al-Baqara's opening, so the natural pairs are (1,2),(3,4)…(603,604) with nothing orphaned. Adopted because it orphans no page and keeps every recto odd. *Cost if wrong:* the pairing is off by one against the owner's physical copy — check 601 verifies against it, and the fix is one line in `spreadFor`.

## Traps

Same list as S4a §Traps applies. Three matter most here:

1. **`withTiming` in a worklet restarts the curve on every render** — shared value + effect (`reanimated-withtiming-in-worklet-restarts`).
2. **A swipe begins as a press.** Press-feedback state held above the pager re-renders every mounted page at gesture start; keep it in the cell (`swipe-begins-as-a-press-on-content`).
3. **A `useEffect` cleanup cannot see the new value** — this already broke mushaf Play once (`useeffect-cleanup-cannot-see-the-new-value`).

Plus: **Reanimated's test shim hands back a fresh box per render** unless the local fix is in place — `useSharedValue` returning a new object per render loses writes and makes prop-seeded animation tests vacuous (`reanimated-shim-hands-back-a-fresh-box`). Verify that shim before trusting any animation test in this phase.

---

## File Structure

**New**
- `apps/mobile/src/mushaf/spread.ts` — the pairing math. Pure, no RN.
- `apps/mobile/src/mushaf/spread.test.ts`
- `apps/mobile/src/components/mushaf/SpreadPager.tsx` — bespoke 3-cell Reanimated pager.
- `apps/mobile/src/components/mushaf/SpreadPager.test.tsx`
- `apps/mobile/src/components/mushaf/HingedLeaf.tsx` — the rotateY turn and its shading.
- `apps/mobile/src/components/mushaf/HingedLeaf.test.tsx`

**Modified**
- `apps/mobile/src/screens/MushafScreen.tsx` — branch on landscape.
- `apps/mobile/src/components/mushaf/MushafPager.tsx` — portrait path, untouched except for extraction of the shared page cell.
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

### Task 2: Landscape branches to a spread

**Files:**
- Modify: `apps/mobile/src/screens/MushafScreen.tsx`
- Modify: `apps/mobile/src/components/mushaf/MushafPager.tsx` (extract the page cell only)
- Test: `apps/mobile/src/screens/MushafScreen.test.tsx`

**Interfaces:**
- Consumes: `spreadFor`, `spreadIndexFor` from Task 1; `useWindowDimensions`.
- Produces: `MushafPageCell` — the single-page renderer, extracted unchanged from `MushafPager` so both pagers draw an identical page. `<MushafPageCell page={number} width={number} />`.

- [ ] **Step 1: Write the failing test**

```tsx
  it('shows one page in portrait, exactly as it does today', () => {
    // Portrait is not changing. A regression here is the phase failing, not a
    // trade-off: the phone only ever sees this path.
    win.width = 800; win.height = 1300;
    renderScreen();
    expect(screen.getByTestId('mushaf-pager')).toBeTruthy();
    expect(screen.queryByTestId('mushaf-spread')).toBeNull();
  });

  it('shows a spread in landscape', () => {
    win.width = 1400; win.height = 900;
    renderScreen();
    expect(screen.getByTestId('mushaf-spread')).toBeTruthy();
    expect(screen.queryByTestId('mushaf-pager')).toBeNull();
  });

  it('puts the recto on the right in the layout, not just in the data', () => {
    // RTL. A row that renders [recto, verso] left-to-right reads backwards and
    // is invisible in a data-only assertion.
    win.width = 1400; win.height = 900;
    renderScreen({ page: 3 });
    const halves = screen.getAllByTestId('spread-half');
    expect(halves.map((h) => h.dataset.page)).toEqual(['3', '4']);
    expect(screen.getByTestId('mushaf-spread').style.flexDirection).toBe('row-reverse');
  });

  it('keeps an even page on its own leaf when landscape opens', () => {
    // Rotating on page 4 must land on leaf (3,4) with 4 on the left -- not
    // rebuild the book around 4 as a recto.
    win.width = 1400; win.height = 900;
    renderScreen({ page: 4 });
    expect(screen.getAllByTestId('spread-half').map((h) => h.dataset.page)).toEqual(['3', '4']);
  });

  it('decides on the box, not on the class', () => {
    // A 1000x1400 medium-class tablet in portrait is still portrait: two pages
    // there would be tall and narrow and would walk into the render band.
    win.width = 1000; win.height = 1400;
    renderScreen();
    expect(screen.queryByTestId('mushaf-spread')).toBeNull();
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/mobile && npx vitest run src/screens/MushafScreen.test.tsx`
Expected: FAIL — no `mushaf-spread`.

- [ ] **Step 3: Implement**

Extract the page cell out of `MushafPager` into `MushafPageCell` with no behaviour change — same fonts, same memo, same hardware layer. Both pagers then render the identical cell (§3 DRY: two page renderers is where one gains a fix and the other keeps the bug).

In `MushafScreen`:

```tsx
  const { width, height } = useWindowDimensions();
  // The box, not the window class: a 1000dp portrait tablet is still portrait,
  // and two pages in a tall narrow box lands outside the QCF render band.
  const landscape = width > height;
```

Render `<SpreadPager .../>` when `landscape`, today's `<MushafPager .../>` otherwise. The spread container is `flexDirection: 'row-reverse'` so the recto sits on the right.

- [ ] **Step 4: Run the tests**

Run: `cd apps/mobile && npx vitest run src/screens/MushafScreen.test.tsx src/components/mushaf && npx tsc --noEmit`
Expected: PASS, and every existing mushaf test passes unchanged.

- [ ] **Step 5: Mutation-check**

Change `width > height` to `width >= 840`: the "decides on the box" test must FAIL. Change `row-reverse` to `row`: the recto test must FAIL. Restore by editing.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/MushafScreen.tsx apps/mobile/src/components/mushaf
git commit -m "feat(mobile/mushaf): draw a two-page spread in landscape"
```

---

### Task 3: The spread pager, on a slide

**Files:**
- Create: `apps/mobile/src/components/mushaf/SpreadPager.tsx`
- Create: `apps/mobile/src/components/mushaf/SpreadPager.test.tsx`

**Interfaces:**
- Consumes: `spreadAt`, `spreadFor`, `SPREAD_COUNT`; `MushafPageCell`.
- Produces: `<SpreadPager page={number} onPageChange={(page: number) => void} />` — `page` is any page; the pager resolves it to a leaf. `onPageChange` reports the **recto** of the leaf turned to.

Slide first, hinge in Task 5. This task proves paging, mounting and layout before any motion risk is added — and check 604 compares its feel against portrait's `PagerView` before the hinge is written at all.

- [ ] **Step 1: Write the failing test**

```tsx
  it('mounts three leaves: previous, current, next', () => {
    // Not a window over 302: three cells is the whole point of a bespoke
    // pager here, and it is what keeps the glyph atlas from thrashing.
    render(<SpreadPager page={11} onPageChange={() => {}} />);
    expect(screen.getAllByTestId('spread-leaf').map((l) => l.dataset.index)).toEqual(['4', '5', '6']);
  });

  it('mounts two leaves at the start of the book', () => {
    // No leaf -1. A pager that mounts one anyway renders page 0 and the QCF
    // font has no glyph for it.
    render(<SpreadPager page={1} onPageChange={() => {}} />);
    expect(screen.getAllByTestId('spread-leaf').map((l) => l.dataset.index)).toEqual(['0', '1']);
  });

  it('mounts two leaves at the end of the book', () => {
    render(<SpreadPager page={604} onPageChange={() => {}} />);
    expect(screen.getAllByTestId('spread-leaf').map((l) => l.dataset.index)).toEqual(['300', '301']);
  });

  it('reports the recto when a leaf is turned', () => {
    // The caller stores a page number (R-B3, no data change), so the pager has
    // to hand back a page and not a leaf index.
    const onPageChange = vi.fn();
    const { turnForward } = renderPager({ page: 3, onPageChange });
    turnForward();
    expect(onPageChange).toHaveBeenCalledWith(5);
  });

  it('does not turn past the last leaf', () => {
    const onPageChange = vi.fn();
    const { turnForward } = renderPager({ page: 604, onPageChange });
    turnForward();
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it('keeps press feedback inside the leaf', () => {
    // A swipe begins as a press. Press state held above the pager re-renders
    // every mounted leaf at gesture start, which is 2-3 full QCF pages.
    render(<SpreadPager page={11} onPageChange={() => {}} />);
    expect(screen.getByTestId('spread-pager').dataset.pressed).toBeUndefined();
  });
```

`renderPager` is a helper in this test file that renders the pager and returns a `turnForward()` which drives the gesture the way the component listens for it — assert against the component's own gesture contract, not against a simulated raw touch stream.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/mobile && npx vitest run src/components/mushaf/SpreadPager.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Verify the Reanimated shim before writing any animation**

`useSharedValue` in the test shim has previously returned **a new object per render**, which loses writes and makes every prop-seeded animation test pass vacuously. Confirm the local fix is in `src/testing/` before trusting a single assertion below. If it is not, fix the shim first — as its own commit.

- [ ] **Step 4: Implement**

A `Gesture.Pan()` driving one shared value (the leaf offset in leaf-widths), `withSpring` on release to the nearest leaf, three absolutely-positioned leaves translated off that value. `runOnJS(onPageChange)` only when the settled leaf differs from the one it started on.

- Set the shared value in an **effect** when `page` changes, never `withTiming` inside a worklet.
- Keep `MushafPageCell`'s hardware layer (`renderToHardwareTextureAndroid`) and its memo — swipes went from 92% janky/34ms to 8%/9ms because of them.
- Press feedback lives in the cell (trap 2).
- Clamp at both ends; no leaf -1 and no leaf 302.

- [ ] **Step 5: Run the tests**

Run: `cd apps/mobile && npx vitest run src/components/mushaf && npx tsc --noEmit && npx eslint .`
Expected: PASS.

- [ ] **Step 6: Mutation-check**

Remove the end clamp: the "does not turn past the last leaf" test must FAIL. Change the mounted window to `[current]`: the three-leaf test must FAIL. Restore by editing.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/components/mushaf/SpreadPager.tsx apps/mobile/src/components/mushaf/SpreadPager.test.tsx
git commit -m "feat(mobile/mushaf): a three-leaf spread pager on a slide"
```

---

### Task 4: Page scale inside a half-box, against the render band

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

### Task 5: The hinged turn

**Files:**
- Create: `apps/mobile/src/components/mushaf/HingedLeaf.tsx`
- Create: `apps/mobile/src/components/mushaf/HingedLeaf.test.tsx`
- Modify: `apps/mobile/src/components/mushaf/SpreadPager.tsx`

**Do not start this until check 604 has confirmed the slide's feel on device.** If the bespoke pager feels worse than portrait's `PagerView`, the fallback (spread inside `PagerView`, no hinge) is on the table and R-B4 gets renegotiated — that is the ruling recorded above.

**Interfaces:**
- Consumes: the pager's gesture progress shared value.
- Produces: `<HingedLeaf progress={SharedValue<number>} side="recto" | "verso" children />` — rotates about the spine and draws the shading.

- [ ] **Step 1: Write the failing test**

```tsx
  it('rotates about the spine, not about the leaf centre', () => {
    // A leaf hinged at its middle looks like a card flipping in mid-air. The
    // transform origin has to sit on the spine edge.
    const progress = makeSharedValue(0.5);
    render(<HingedLeaf progress={progress} side="recto"><span>page</span></HingedLeaf>);
    const leaf = screen.getByTestId('hinged-leaf');
    expect(leaf.style.transformOrigin).toContain('left');
  });

  it('turns the recto toward the spine and the verso away from it', () => {
    // Opposite signs. Same sign on both and the leaves pass through each other.
    const progress = makeSharedValue(0.5);
    const { rectoAngle, versoAngle } = renderBothSides(progress);
    expect(Math.sign(rectoAngle)).toBe(-Math.sign(versoAngle));
  });

  it('is flat at rest and side-on at the halfway point', () => {
    expect(angleAt(0)).toBe(0);
    expect(Math.abs(angleAt(0.5))).toBeCloseTo(90, 0);
  });

  it('deepens the shading as the leaf turns', () => {
    // The shading is what makes a rotateY read as paper rather than a
    // flipping rectangle.
    expect(shadeAt(0.5)).toBeGreaterThan(shadeAt(0.1));
  });

  it('falls back to a slide when reduced motion is on', () => {
    // §8. The hinge is the flourish; the page turn is the function.
    const { container } = renderWithSettings({ reduceMotion: true });
    expect(container.querySelector('[data-testid="hinged-leaf"]')).toBeNull();
  });
```

`makeSharedValue` must produce a **stable** box across renders — see the shim warning in Task 3 Step 3. If it does not, these tests pass whatever the component does.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/mobile && npx vitest run src/components/mushaf/HingedLeaf.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

`useAnimatedStyle` mapping progress to `rotateY` with a `perspective` ahead of it in the transform array (order matters — perspective last is a no-op), `transformOrigin` on the spine edge, and an overlay whose opacity rises with `|progress|` for the shading. Read `reduceMotion` from the settings store and render the children bare when it is set.

Keep the leaf's hardware layer. A rotateY on a texture is cheap; a rotateY that re-rasterises a QCF page every frame is 146 texture uploads a frame again.

- [ ] **Step 4: Run the tests and measure the frames**

Run: `cd apps/mobile && npx vitest run src/components/mushaf && npx tsc --noEmit && npx eslint .`

Then on device, per `ui-thread-jank-measure-framestats`: **framestats gaps only**, three repeats, inside the animation window. JS logs, gfxinfo percentiles and frame *duration* are all blind to a UI-thread stall. Record the numbers in the log.

- [ ] **Step 5: Mutation-check**

Make both sides' angles the same sign: that test must FAIL. Remove the `reduceMotion` branch: that test must FAIL. Move `perspective` to the end of the transform array — no unit test catches it, so record that check 607 is the gate (a hinge with no perspective looks like a squashing rectangle). Restore by editing.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/mushaf
git commit -m "feat(mobile/mushaf): turn the leaf on a spine hinge"
```

---

### Task 6: Position, highlight and playback across a leaf

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

### Task 7: Build, device run, and the verification log

Build and install exactly as S4a Task 11 (prebuild only if a native dep changed — nothing here adds one, so a Gradle `assembleRelease` is enough; `taskset -c 7,8` still mandatory, `adb install -r --user 0` still mandatory, APK served as a copy named for the versionCode verified with an explicitly-resolved `aapt2`).

| # | Check | Result |
|---|---|---|
| 600 | Landscape shows two pages, recto on the RIGHT | |
| 601 | Pairing matches the owner's physical mushaf for pages 1-2, 3-4, 603-604 | |
| 602 | Portrait still one page, identical to vc72 | |
| 603 | Rotate on page 4 → leaf (3,4), page 4 on the left; rotate back → page 4 | |
| 604 | **Slide feel vs portrait PagerView** — is the bespoke pager as good? Gate for Task 5 | |
| 605 | 10 fast swipes in a burst — no blank leaf, no missed mount | |
| 606 | Every glyph present on 20 sampled pages incl. the 54 with header/bismillah gaps | |
| 607 | Hinge reads as paper: perspective present, shading deepens, no squashing rectangle | |
| 608 | framestats gaps inside the turn, 3 repeats — no UI-thread stall | |
| 609 | Reduced motion on → slide, no hinge | |
| 610 | Playback crossing recto→verso does not turn; verso→next recto does | |
| 611 | Highlight lands on an ayah on the left half | |
| 612 | Close on a landscape leaf, reopen in portrait — lands on the recto | |
| 613 | Page-jump sheet lands on the right leaf | |
| 614 | Phone regression: mushaf unchanged | |

- [ ] Record every result, fill the Verification Log, commit, push. **Do not open the PR** — that is the owner's call.

## Acceptance criteria

- [ ] Landscape draws a recto-right spread; portrait is unchanged.
- [ ] One swipe turns one leaf, with a hinge (or a slide under reduced motion).
- [ ] Every page's half-box scale sits inside the 11.91-18.17em render band, evidenced by the sweep in `SPREAD-BAND-CHECK.md` **and** check 606.
- [ ] Stored position is still a single page number. No migration, no user-DB write.
- [ ] Playback and highlight treat a leaf as one unit.
- [ ] Suite, type-check and lint green; every branch mutation-checked.
- [ ] Checks 600-614 run and recorded.

## Risks and rollbacks

| Risk | Mitigation | Rollback |
|---|---|---|
| Half-box scale leaves the QCF band → missing words | Task 4 sweeps all 604 before any device build; check 606 | Fixed scale with letterboxing instead of a per-page fit — owner ruling needed |
| Bespoke pager feels worse than `PagerView` | Check 604 gates Task 5 | Spread inside `PagerView`, slide only, R-B4 renegotiated |
| Hinge misses 60fps | framestats gaps, 3 repeats, check 608 | `reduceMotion` path is already the slide — make it the default |
| Pairing off-by-one vs the printed mushaf | Check 601 against the owner's own copy | One line in `spreadFor` |
| Reanimated shim makes animation tests vacuous | Verified in Task 3 Step 3 before any assertion is trusted | Fix the shim as its own commit |

## Out of scope

- The true paper curl (R-B4 defers it; it needs Skia and a rasterised page).
- Any new mushaf chrome (R-B5) — the khatm ribbon is S4c.
- Portrait spreads, at any width.
- Changing what position is stored.

## Verification log

*(empty — Task 7 fills this)*
