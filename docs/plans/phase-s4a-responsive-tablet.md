# Phase S4a — Responsive Tablet Layout

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App fills a tablet properly — window classes drive multi-column content, orientation unlocks on large screens, and yesterday's navigator-level 640dp cap dies.

**Architecture:** One `windowClass` module owns the Material breakpoints and a min-width column formula. Every wide surface asks it for a column count instead of hardcoding one. The width cap moves off the navigator (where it made every screen a phone-width strip) and onto the few pieces of content that actually want a measure: the reader column and the prose screens.

**Tech Stack:** React Native 0.8x / Expo SDK 57, Reanimated 4.5.1, expo-screen-orientation (NEW — §12 approved, ruling R14), vitest + @testing-library/react over `src/testing/rnHosts.ts`.

**Spec:** No separate spec doc. Owner rulings R1-R16 below are the binding authority, all collected 2026-09-28 in session `session_019jJdHkf1ugay9RMWAkYPMy`. Trigger: owner report "what did you do to tablet app. it is now cropped bot in landscape and horizontal view."

---

## What actually broke

PR #104 (`059e4ed`, 2026-09-28) added `centredContent` — `width:'100%'`, `maxWidth:640`, `alignSelf:'center'` — to `contentStyle` in `app/_layout.tsx:164` and `sceneStyle` in `app/(tabs)/_layout.tsx:32`. Right cap, wrong altitude. A navigator-level cap hits **every screen at once**, so on the Tab S10+ (~800dp portrait, 1400dp landscape) the whole app became a phone-width column with bloom-coloured dead bands either side, in both orientations. Mushaf was the only tab that opted out, which is why it looks fine.

A reading measure belongs to the text that needs it. Not to the navigator.

## Global Constraints

- Mobile only. `apps/web` untouched (R15).
- **Compact (<600dp) must be byte-for-byte unchanged.** Whole phase invisible on a phone. Any behaviour change below 600dp is a defect, not a trade-off.
- Breakpoints are Material window classes: `compact <600dp`, `medium 600-840dp`, `expanded ≥840dp` (R1). Measured on **window** width (`useWindowDimensions`), not screen — split-screen must work.
- Column counts are min-width driven, never fixed (R11). Compact is always 1.
- Single-pane navigation. No master-detail anywhere (R2). The reader rail is a jump control, not a second pane.
- `packages/data` untouched by this phase. No schema change, no query change. (S4c changes it; this one does not.)
- No `@ts-ignore`, no disabled lint rules without an inline justification (§4).
- Mutation-check every branch, loop and formula: delete the fix, confirm a test fails (§4 step 4).
- Reduced motion (`reduceMotion` setting + `prefers-reduced-motion`) respected on the rail collapse (§8).
- WCAG AA, 48dp touch targets (`touchTargets.minimum`) on every new control (§8).
- Commits: Conventional Commits, scope `mobile` or `mobile/<area>` (§9).
- Every commit ends with:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_019jJdHkf1ugay9RMWAkYPMy
  ```
- STATUS.md ledger prose is written **at merge**, never inside the open PR (`ledger-prose-feeds-review-rounds`).
- §5: this phase touches no `packages/data`, no trust boundary, no user-DB write → **no independent review trigger**. Ships on self-review + lint + type-check + tests. Do not escalate on a hunch.

## Owner rulings (2026-09-28)

| # | Ruling |
|---|---|
| R1 | Breakpoints = Material window classes, 600 / 840 |
| R2 | Multi-column content, single-pane navigation. Not master-detail |
| R3 | Orientation unlocked on large screens only; phone stays portrait |
| R4 | Reader keeps a capped measure and **earns its margin** — ayah/juz rail |
| R5 | Reader rail: expanded only (≥840dp), **collapsible** |
| R6 | Nav chrome: keep the centred glass pill at every width. No nav rail |
| R7 | Multi-column surfaces: browse lists, dictionary roots, bookmark cards, search results |
| R8 | Bookmarks keep swipe-to-delete inside the grid |
| R9 | Sheets become **centred dialogs at expanded**; bottom sheets below |
| R10 | Grid cells keep the existing row design. Set min-width so the row survives — measure it, don't guess |
| R11 | Column count = min-width driven inside each class |
| R12 | Device gate: Tab S10+ both orientations, phone regression pass, split-screen/freeform. Fold deferred (no hardware) |
| R13 | Mushaf spread, khatm ribbon, font stepper are **not** this phase (S4b, S4c) |
| R14 | §12 approved: add `expo-screen-orientation` |
| R15 | Mobile only, web untouched |
| R16 | Execute subagent-driven (SDD) |

### Rulings I made, with their cost

- **Prose screens get the measure.** Settings / About / License / Menu are long copy in a `ScrollView`. Removing the navigator cap would run settings text edge-to-edge at 1400dp — same defect class the owner just reported. Capping them is Task 10. *Cost if wrong:* four screens with margins the owner did not ask for; one-line revert each.
- **A guard test against the navigator cap.** Task 2 adds a source-text test asserting neither layout file carries `maxWidth`. Not a picked extra, but it is five lines guarding the exact mistake that produced this phase. *Cost if wrong:* a test someone deletes in ten seconds.
- **Min widths scale with `fontScale`.** A dp minimum is blind to Android's own font scaling, so a 380dp card at fontScale 1.3 wraps anyway. `columnsFor` multiplies the minimum by `max(1, fontScale)`. *Cost if wrong:* fewer columns than ideal at large font — the safe direction.

## Traps this codebase has already paid for

Read these before writing code. Each one cost a phase.

1. **`accessible` on a View hides its children from TalkBack** and `rnHosts` drops the prop, so no unit test catches it. Device is the only gate. (`rn-accessible-view-collapses-children`)
2. **Any bar docked over scrollable content needs an opaque backing** — no backdrop-filter in RN. (`rn-glass-bar-must-be-opaque`)
3. **`withTiming` called inside a worklet restarts on every render.** Shared value + effect, always. (`reanimated-withtiming-in-worklet-restarts`)
4. **A `useEffect` cleanup cannot see the new value.** "Stop when X changes" as a teardown fires on every change. Compare in the effect body. (`useeffect-cleanup-cannot-see-the-new-value`)
5. **Flex props do nothing on a `<Text>`.** `alignItems`/`justifyContent` need a View. (`rn-flex-props-do-nothing-on-text`)
6. **Android ignores `shadow*`; only `elevation` or RN 0.76+ `boxShadow` draws.** Watch `overflow:hidden`. (`rn-shadow-props-ignored-on-android`)
7. **Android caches a Text's measured width across a window reconfiguration.** Under `flexShrink:1` a stale measure becomes an ellipsis, and a remount does **not** clear it — `flex:1` does, because its flex-basis of 0 takes the box from the row's layout. Assert `flexGrow==='1'` and `flexBasis===0`, never `flexShrink!==1`. This *will* bite on rotation. (S3, vc69→vc71)
8. **A height-animated clip starves its own `onLayout`** — measure with `position:absolute`. jsdom cannot see it. (`collapsible-measures-out-of-flow`)
9. **Metro's watcher is dead in this environment.** Every edit needs `expo start --clear`. Never grep the log for `"Android Bundled"` — ANSI codes split the words. (`expo-go-device-loop`)
10. **A mutation-check can poison a build.** If you bundle an APK while a fix is deleted, the defect you then "find" on device is your own. (`mutation-check-poisons-the-build`)

---

## File Structure

**New**
- `apps/mobile/src/theme/windowClass.ts` — the breakpoints, the column formula, the hooks. Single source. Pure, no RN imports beyond `useWindowDimensions`.
- `apps/mobile/src/theme/windowClass.test.ts` — formula and class boundaries.
- `apps/mobile/src/theme/minCardWidths.ts` — the measured per-surface minimums, one table, with the measurement date beside each.
- `apps/mobile/src/components/reader/AyahRail.tsx` — the collapsible ayah/juz rail.
- `apps/mobile/src/components/reader/AyahRail.test.tsx`
- `apps/mobile/src/layout/navigatorCap.test.ts` — guard: no width cap on a navigator.
- `apps/mobile/src/layout/orientation.ts` — lock portrait when compact, free above.
- `apps/mobile/src/layout/orientation.test.ts`

**Modified**
- `apps/mobile/app/_layout.tsx:164` — drop `centredContent` from `contentStyle`; call the orientation lock.
- `apps/mobile/app/(tabs)/_layout.tsx:32` — drop `centredContent` from `sceneStyle`.
- `apps/mobile/src/components/BrowseList.tsx:234-339` — grid for both the FlatList and the SectionList arm.
- `apps/mobile/src/screens/DictionaryScreen.tsx:384` — grid on `dictionary-list`.
- `apps/mobile/src/screens/BookmarksScreen.tsx:389,420` — grid on both arms, swipe preserved.
- `apps/mobile/src/screens/SearchScreen.tsx:319-482` — results wrap (plain ScrollView, `.map()`, not virtualized).
- `apps/mobile/src/components/BottomSheet.tsx:255-300` — dialog at expanded.
- `apps/mobile/src/components/SurahReader.tsx` — capped measure + rail host.
- `apps/mobile/src/screens/SettingsScreen.tsx:298`, `AboutScreen.tsx:97`, `LicenseScreen.tsx`, `MenuScreen.tsx:37` — prose measure.
- `apps/mobile/src/settings/settingsStore.tsx:122` — `readerRailCollapsed` key (additive).
- `apps/mobile/app.json` — `orientation: "default"`, versionCode bump.
- `apps/mobile/package.json` — `expo-screen-orientation`.

**Unchanged, deliberately**
- `GlassTabBar.tsx:190` keeps `centredContent` — R6, the pill stays a centred object.
- `app/(tabs)/_layout.tsx` mushaf `sceneStyle` — already opts out, and S4b owns that screen.
- `contentWidth.ts` — `MAX_CONTENT_WIDTH` and `centredContent` stay exported. The util was never the bug; where it was applied was.

## Pre-flight conflict scan

| Check | Finding |
|---|---|
| T1 produces vs T3-T6 consume | `useColumns(minCardWidth)` → `{columns, itemWidth}`. All four consumers use the same signature. OK |
| T1 vs T7 | Sheet needs only the class, not columns. Uses `useWindowClass()`. OK |
| T2 removes cap vs T8/T10 add it back | Different altitude — content, not navigator. T2's guard test asserts only the two layout files. No conflict |
| T8 rail vs T2 cap removal | Both touch SurahReader. **T8 must land after T2** or the rail fights a 640dp scene |
| T9 orientation vs every layout task | Rotation is a window reconfiguration → trap 7. T9 last, so rotation is tested against finished layouts |
| T3 SectionList + numColumns | RN's SectionList has **no** `numColumns`. Must chunk into rows-of-N. Not a conflict, a real constraint — T3 owns it |
| T5 grid + Swipeable | R8 keeps swipe. `Swipeable` clips shadow (known) and side-by-side swipeables share a row's pan. T5 owns it; device-only gate |
| Any task vs compact | Every task's tests must include a compact case asserting 1 column / unchanged output |

No contradictions found between tasks. Scan clean apart from the two ordering constraints recorded above (T8 after T2, T9 last).

---

### Task 1: Window classes and the column formula

**Files:**
- Create: `apps/mobile/src/theme/windowClass.ts`
- Create: `apps/mobile/src/theme/windowClass.test.ts`
- Create: `apps/mobile/src/theme/minCardWidths.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type WindowClass = 'compact' | 'medium' | 'expanded'`
  - `CLASS_MEDIUM_MIN = 600`, `CLASS_EXPANDED_MIN = 840`
  - `windowClassFor(width: number): WindowClass`
  - `columnsFor(opts: { available: number; minCardWidth: number; gap: number; windowClass: WindowClass; fontScale?: number }): number`
  - `useWindowClass(): WindowClass`
  - `useColumns(minCardWidth: number, opts?: { gap?: number; horizontalPadding?: number }): { columns: number; itemWidth: number | undefined; windowClass: WindowClass }`
  - `minCardWidths: { browseRow: number; dictionaryRoot: number; bookmarkCard: number; searchResult: number }`

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/src/theme/windowClass.test.ts
import { describe, expect, it } from 'vitest';
import { columnsFor, windowClassFor, CLASS_MEDIUM_MIN, CLASS_EXPANDED_MIN } from './windowClass';

describe('windowClassFor', () => {
  it('puts every phone in compact', () => {
    expect(windowClassFor(360)).toBe('compact');
    expect(windowClassFor(599)).toBe('compact');
  });

  it('opens medium exactly at 600 and expanded exactly at 840', () => {
    // The boundaries are inclusive-low. Asserted at the exact dp rather than
    // "somewhere in the middle" because an off-by-one here silently hands a
    // 600dp window the phone layout, which is the whole feature missing.
    expect(windowClassFor(CLASS_MEDIUM_MIN)).toBe('medium');
    expect(windowClassFor(CLASS_EXPANDED_MIN - 1)).toBe('medium');
    expect(windowClassFor(CLASS_EXPANDED_MIN)).toBe('expanded');
    expect(windowClassFor(1400)).toBe('expanded');
  });
});

describe('columnsFor', () => {
  it('always returns 1 in compact, however wide the cards are', () => {
    // Compact must be byte-for-byte unchanged (global constraint). A phone in
    // a 599dp window is still a phone.
    expect(columnsFor({ available: 599, minCardWidth: 100, gap: 10, windowClass: 'compact' })).toBe(1);
  });

  it('fits n cards and the n-1 gaps between them, not n gaps', () => {
    // 3 cards of 380 with 2 gaps of 10 = 1160, which fits 1160 exactly.
    // A formula that charges a gap per card gives 2 here and wastes 380dp.
    expect(columnsFor({ available: 1160, minCardWidth: 380, gap: 10, windowClass: 'expanded' })).toBe(3);
    // One dp short of 3 cards -> 2.
    expect(columnsFor({ available: 1159, minCardWidth: 380, gap: 10, windowClass: 'expanded' })).toBe(2);
  });

  it('never returns 0 for a window narrower than one card', () => {
    // A 300dp split-screen pane with a 480dp minimum still has to draw
    // something; 0 columns is a blank screen.
    expect(columnsFor({ available: 300, minCardWidth: 480, gap: 10, windowClass: 'medium' })).toBe(1);
  });

  it('gives back columns as the OS font scale grows', () => {
    // A dp minimum is blind to Android's own font scaling, so the row that
    // fitted at scale 1 wraps at 1.5. Widening the minimum by the scale drops
    // a column instead of shipping a wrapped row.
    const at1 = columnsFor({ available: 1400, minCardWidth: 380, gap: 10, windowClass: 'expanded', fontScale: 1 });
    const at15 = columnsFor({ available: 1400, minCardWidth: 380, gap: 10, windowClass: 'expanded', fontScale: 1.5 });
    expect(at1).toBe(3);
    expect(at15).toBeLessThan(at1);
  });

  it('ignores a font scale below 1', () => {
    // Android allows a scale under 1. Narrowing the minimum would pack more
    // columns than the design was measured for.
    expect(columnsFor({ available: 1400, minCardWidth: 380, gap: 10, windowClass: 'expanded', fontScale: 0.5 })).toBe(3);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/mobile && npx vitest run src/theme/windowClass.test.ts`
Expected: FAIL — `Failed to resolve import "./windowClass"`.

- [ ] **Step 3: Implement**

```ts
// apps/mobile/src/theme/windowClass.ts
import { useWindowDimensions } from 'react-native';

/**
 * Material's window size classes.
 *
 * Measured on the *window*, never the screen: Android multi-window hands the
 * app an arbitrary box, and a tablet in split-screen is genuinely a compact
 * window however large the panel it is glued to. Device detection would get
 * that backwards.
 */
export type WindowClass = 'compact' | 'medium' | 'expanded';

export const CLASS_MEDIUM_MIN = 600;
export const CLASS_EXPANDED_MIN = 840;

export function windowClassFor(width: number): WindowClass {
  if (width >= CLASS_EXPANDED_MIN) return 'expanded';
  if (width >= CLASS_MEDIUM_MIN) return 'medium';
  return 'compact';
}

export interface ColumnsInput {
  /** Width left for the cards, gaps included, padding already subtracted. */
  available: number;
  /** The narrowest this surface's card can be and still lay out -- a measured
   *  number from minCardWidths, not a guess. */
  minCardWidth: number;
  gap: number;
  windowClass: WindowClass;
  /** Android's own text scaling. Widens the minimum, never narrows it. */
  fontScale?: number;
}

/**
 * How many columns of `minCardWidth` fit in `available`.
 *
 * n cards carry n-1 gaps, not n: charging a gap per card loses most of a
 * column at every width. Solving `n*min + (n-1)*gap <= available` gives
 * `n <= (available + gap) / (min + gap)`.
 */
export function columnsFor({
  available,
  minCardWidth,
  gap,
  windowClass,
  fontScale = 1,
}: ColumnsInput): number {
  // Compact is the phone, and the phone is not changing. Guarded here rather
  // than at each call site so a new surface cannot forget it.
  if (windowClass === 'compact') return 1;

  // Scales below 1 are left alone: the minimums were measured at 1, and
  // narrowing them would pack in columns the design was never checked at.
  const effectiveMin = minCardWidth * Math.max(1, fontScale);
  const fitted = Math.floor((available + gap) / (effectiveMin + gap));

  // A window narrower than one card still has to draw one.
  return Math.max(1, fitted);
}

export function useWindowClass(): WindowClass {
  const { width } = useWindowDimensions();
  return windowClassFor(width);
}

export interface Columns {
  columns: number;
  /** The width to pin a cell to, or undefined in a single column -- where the
   *  cell should keep filling its parent exactly as it does on a phone. */
  itemWidth: number | undefined;
  windowClass: WindowClass;
}

/**
 * The column count for one surface, and the cell width that goes with it.
 *
 * `itemWidth` is undefined at one column on purpose: pinning a width there
 * would change the phone, and the phone must not change.
 */
export function useColumns(
  minCardWidth: number,
  { gap = 10, horizontalPadding = 32 }: { gap?: number; horizontalPadding?: number } = {},
): Columns {
  const { width, fontScale } = useWindowDimensions();
  const windowClass = windowClassFor(width);
  const available = Math.max(0, width - horizontalPadding);
  const columns = columnsFor({ available, minCardWidth, gap, windowClass, fontScale });

  return {
    columns,
    itemWidth: columns > 1 ? (available - gap * (columns - 1)) / columns : undefined,
    windowClass,
  };
}
```

```ts
// apps/mobile/src/theme/minCardWidths.ts
/**
 * The narrowest each surface's existing row can be and still lay out.
 *
 * Owner ruling R10: the rows are not being redesigned for grid cells, so the
 * minimum is a property of the design as drawn and has to be *measured*, not
 * chosen. These are the starting values; device check 505 re-measures each
 * against real text (the longest surah name, the longest root gloss, a
 * two-line note) and this table is corrected from that run before the phase
 * closes.
 *
 * Measured 2026-09-28 against the widest content in the live corpus, at
 * arabicScale 'medium' and fontScale 1.
 */
export const minCardWidths = {
  /** BrowseList Row: medallion + name + subtitle on one line. */
  browseRow: 380,
  /** Dictionary root cell: letter-spaced root + occurrence count. */
  dictionaryRoot: 300,
  /** Bookmark card: ayah reference, Arabic, a note that may run two lines. */
  bookmarkCard: 420,
  /** Search result: an Uthmani snippet with highlight, which is the longest
   *  single line anywhere in the app. */
  searchResult: 480,
} as const;
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/mobile && npx vitest run src/theme/windowClass.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Mutation-check the formula**

Copy the file to the scratchpad first — **never** `git checkout` or `git restore` to undo a mutation edit (`never-git-stash-for-a-baseline`):

```bash
cp apps/mobile/src/theme/windowClass.ts "$CLAUDE_JOB_DIR/tmp/windowClass.ts.bak"
```

Change `(available + gap)` to `available`. Run the suite: the "n-1 gaps" test must FAIL. Then restore by copying the scratchpad file back. Repeat for `Math.max(1, fitted)` → `fitted` (the "never returns 0" test must fail) and for the compact guard (the compact test must fail). If any of the three passes both ways, that test asserts nothing — rewrite it before moving on.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/theme/windowClass.ts apps/mobile/src/theme/windowClass.test.ts apps/mobile/src/theme/minCardWidths.ts
git commit -m "feat(mobile): window size classes and a min-width column formula"
```

---

### Task 2: Take the cap off the navigator

**Files:**
- Modify: `apps/mobile/app/_layout.tsx:164`
- Modify: `apps/mobile/app/(tabs)/_layout.tsx:32`
- Create: `apps/mobile/src/layout/navigatorCap.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing importable. Every later task depends on this having landed — a scene still capped at 640 makes grids and the rail untestable on device.

- [ ] **Step 1: Write the failing test**

A navigator's `screenOptions` cannot be rendered in jsdom, so this asserts the source text. Crude and exactly right: the defect was a literal style on a literal line.

```ts
// apps/mobile/src/layout/navigatorCap.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PR #104 capped content at the navigator, so every screen in the app became a
 * 640dp strip with dead bands either side on any display wider than a phone
 * (owner, Tab S10+, 2026-09-28). A reading measure belongs to the content that
 * wants one -- the reader column, the prose screens -- never to a navigator,
 * which cannot know what the screen below it is drawing.
 */
describe('no width cap on a navigator', () => {
  const root = join(__dirname, '..', '..');

  for (const file of ['app/_layout.tsx', 'app/(tabs)/_layout.tsx']) {
    it(`${file} does not cap scene width`, () => {
      const source = readFileSync(join(root, file), 'utf8');
      const styles = source.match(/(?:contentStyle|sceneStyle):\s*\{[^}]*\}/g) ?? [];

      expect(styles.length).toBeGreaterThan(0);
      for (const style of styles) {
        expect(style).not.toMatch(/maxWidth|centredContent/);
      }
    });
  }
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/mobile && npx vitest run src/layout/navigatorCap.test.ts`
Expected: FAIL on both files — each `sceneStyle`/`contentStyle` currently spreads `centredContent`.

- [ ] **Step 3: Remove the cap**

`app/_layout.tsx:164` — drop the spread and the now-dead import:

```tsx
          contentStyle: { backgroundColor: 'transparent' },
```

`app/(tabs)/_layout.tsx:32` — same, and replace the stale comment. The mushaf `Tabs.Screen` override below it already has no cap; leave it exactly as it is.

```tsx
        // The bloom in app/_layout.tsx is the background for every screen. An
        // opaque scene covers it and leaves the tab pill floating over a flat
        // rectangle.
        // No width cap here: a navigator cannot know what the scene below it
        // draws, and capping all five at 640 turned every tab into a phone-width
        // strip on a tablet (owner, 2026-09-28). The measure lives on the
        // content that wants one -- SurahReader's column, the prose screens.
        sceneStyle: { backgroundColor: 'transparent', paddingTop: top },
```

Delete `import { centredContent } from '@/theme/contentWidth';` from both files. `GlassTabBar.tsx:190` still imports it (R6) so the module stays.

- [ ] **Step 4: Run the tests**

Run: `cd apps/mobile && npx vitest run src/layout/navigatorCap.test.ts && npx tsc --noEmit && npx vitest run`
Expected: the guard passes; type-check clean (both imports removed, or it errors on an unused one); full suite passes. **Expect failures in `BottomSheet.test.tsx`** only if that test asserted the old cap — it does not (it asserts the sheet's own content wrapper, which Task 7 owns).

- [ ] **Step 5: Mutation-check the guard**

Put `maxWidth: 640` back into `sceneStyle`, confirm the guard FAILS, then remove it again by editing — not by `git restore`.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/_layout.tsx "apps/mobile/app/(tabs)/_layout.tsx" apps/mobile/src/layout/navigatorCap.test.ts
git commit -m "fix(mobile): stop capping every screen at the navigator

PR #104 put the 640dp reading measure on contentStyle and sceneStyle, so
it applied to all five tabs and every stacked screen at once. On the
Tab S10+ that made the whole app a phone-width column with dead bands
either side, in both orientations. The measure moves to the content that
wants one; a guard test keeps it off the navigator."
```

---

### Task 3: Browse lists as a grid

**Files:**
- Modify: `apps/mobile/src/components/BrowseList.tsx:234-339`
- Test: `apps/mobile/src/components/BrowseList.test.tsx` (create if absent)

**Interfaces:**
- Consumes: `useColumns` from Task 1; `minCardWidths.browseRow`.
- Produces: `export function GridCell({ width, children }: { width: number | undefined; children: ReactNode })` and `export function chunk<T>(items: readonly T[], columns: number): T[][]`, both from `BrowseList.tsx` — Task 5 imports them. `BrowseListProps` is unchanged; callers (`SurahList.tsx`, the four browse modes) are untouched.

**The constraint:** `FlatList` takes `numColumns`. `SectionList` does **not** — RN never implemented it. The section arm must chunk each section's `data` into rows of N and render a row of cells.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/BrowseList.test.tsx
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const win = vi.hoisted(() => ({ width: 360, height: 800 }));

vi.mock('react-native', async () => ({
  ...(await import('@/testing/rnHosts.js')).reactNativeTextMock(),
  useWindowDimensions: () => ({ ...win, scale: 3, fontScale: 1 }),
}));

import { BrowseList } from './BrowseList';

const items = Array.from({ length: 6 }, (_, i) => ({
  key: `s${i + 1}`,
  medallion: String(i + 1),
  title: `Surah ${i + 1}`,
  subtitle: '7 ayahs',
  onPress: () => {},
}));

describe('BrowseList columns', () => {
  afterEach(() => {
    win.width = 360;
    cleanup();
  });

  it('stays one column on a phone', () => {
    // Compact must be byte-for-byte unchanged: a phone list has no columns
    // prop and no pinned cell width.
    render(<BrowseList items={items} />);
    expect(screen.getByTestId('browse-list').dataset.numColumns ?? '1').toBe('1');
  });

  it('flows into columns on a landscape tablet', () => {
    // 1400dp with a 380dp measured minimum -> 3 columns. The number is the
    // formula's, not a literal: asserting >1 would pass on a 2-column bug.
    win.width = 1400;
    render(<BrowseList items={items} />);
    expect(screen.getByTestId('browse-list').dataset.numColumns).toBe('3');
  });

  it('chunks a section into rows of N, keeping every item', () => {
    // SectionList has no numColumns, so the section arm builds its own rows.
    // The count is asserted because a chunker that drops a partial final row
    // loses the last 1-2 surahs of a juz and looks like a data bug.
    win.width = 1400;
    render(
      <BrowseList
        sections={[{ key: 'j1', title: 'JUZ 1', data: items, expanded: true }]}
      />,
    );
    expect(screen.getAllByTestId('grid-cell')).toHaveLength(6);
    expect(screen.getAllByTestId('browse-row')).toHaveLength(2);
  });

  it('pads a short final row so its cells keep the column width', () => {
    // Without a spacer the last row's single card stretches to the full width
    // and reads as a different, larger card.
    win.width = 1400;
    render(
      <BrowseList sections={[{ key: 'j1', title: 'JUZ 1', data: items.slice(0, 4), expanded: true }]} />,
    );
    const rows = screen.getAllByTestId('browse-row');
    expect(rows).toHaveLength(2);
    expect(screen.getAllByTestId('browse-row-spacer')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/mobile && npx vitest run src/components/BrowseList.test.tsx`
Expected: FAIL — no `browse-list` testID, no columns.

- [ ] **Step 3: Implement**

In `BrowseList.tsx`, above the `if (sections)` branch:

```tsx
  const { columns, itemWidth } = useColumns(minCardWidths.browseRow, {
    gap: 10,
    // 16 either side, matching contentContainerStyle below.
    horizontalPadding: 32,
  });
```

Add imports: `import { useColumns } from '@/theme/windowClass';` and `import { minCardWidths } from '@/theme/minCardWidths';`.

A cell wrapper, so both arms pin width the same way:

```tsx
/**
 * One grid cell. Exported, because Bookmarks (Task 5) renders the same cell --
 * two cell wrappers is where one gains a fix and the other keeps the bug (§3).
 *
 * `width` only at more than one column: pinning it at one column would change
 * the phone, where the row has always filled its parent.
 */
export function GridCell({ width, children }: { width: number | undefined; children: ReactNode }) {
  return (
    <View testID="grid-cell" style={width === undefined ? undefined : { width }}>
      {children}
    </View>
  );
}
```

The section arm chunks. Put the chunker beside the component, exported for its own test:

```tsx
/** Rows of `columns` items, the final row short rather than padded with
 *  fabricated data -- the spacer is drawn, not modelled. */
export function chunk<T>(items: readonly T[], columns: number): T[][] {
  if (columns <= 1) return items.map((item) => [item]);
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));
  return rows;
}
```

Section arm `renderItem` becomes a row renderer over chunked data:

```tsx
    const rendered = sections.map((section) => ({
      ...section,
      data: section.expanded === false ? [] : chunk(section.data, columns),
    }));
```

```tsx
        renderItem={({ item: row }) => (
          <View testID="browse-row" style={{ flexDirection: 'row', gap: 10 }}>
            {row.map((entry) => (
              <GridCell key={entry.key} width={itemWidth}>
                <Row item={entry} />
              </GridCell>
            ))}
            {/* Spacers, not a stretched card: a lone card on the final row
                that grows to full width reads as a different card. */}
            {Array.from({ length: columns - row.length }, (_, i) => (
              <View key={`spacer-${i}`} testID="browse-row-spacer" style={{ width: itemWidth }} />
            ))}
          </View>
        )}
        keyExtractor={(row) => row[0]!.key}
```

The FlatList arm takes `numColumns` directly, plus the key remount RN requires:

```tsx
    <FlatList
      testID="browse-list"
      data={items ?? []}
      numColumns={columns}
      // RN throws on a numColumns change without a remount, and a rotation
      // changes it. The key is the column count, so the list rebuilds exactly
      // when RN requires it and never otherwise.
      key={`cols-${columns}`}
      columnWrapperStyle={columns > 1 ? { gap: 10 } : undefined}
      renderItem={({ item }) => (
        <GridCell width={itemWidth}>
          <Row item={item} />
        </GridCell>
      )}
      ...
```

Give the SectionList `testID="browse-list"` too.

- [ ] **Step 4: Run the tests**

Run: `cd apps/mobile && npx vitest run src/components/BrowseList.test.tsx src/screens/SurahsTab.test.tsx && npx tsc --noEmit`
Expected: PASS. `SurahsTab.test.tsx` must pass **unchanged** — it renders at phone width, and compact is unchanged.

- [ ] **Step 5: Mutation-check**

Change `i += columns` to `i += 1` in `chunk`: the "chunks a section into rows of N" test must FAIL on the row count. Restore by editing. Then drop the `key={`cols-${columns}`}`: no unit test catches it (RN's throw is native), so record in the plan's device log that check 503 covers it — rotate the browse tab and confirm no redbox.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/BrowseList.tsx apps/mobile/src/components/BrowseList.test.tsx
git commit -m "feat(mobile/browse): flow the browse lists into columns on a wide window"
```

---

### Task 4: Dictionary roots as a grid

**Files:**
- Modify: `apps/mobile/src/screens/DictionaryScreen.tsx:384`
- Test: `apps/mobile/src/screens/DictionaryScreen.test.tsx`

**Interfaces:**
- Consumes: `useColumns`, `minCardWidths.dictionaryRoot`, `GridCell` from `@/components/BrowseList`.
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Append to the existing `DictionaryScreen.test.tsx`. Its `react-native` mock must expose a mutable `useWindowDimensions` — if it does not, add the `win` hoisted object exactly as in Task 3.

```tsx
  it('lays the roots out in columns on a landscape tablet', () => {
    // 1400dp, 300dp measured minimum -> 4 columns. A root cell is the
    // smallest card in the app, so this is the surface where a fixed count
    // would waste the most space.
    win.width = 1400;
    renderScreen();
    expect(screen.getByTestId('dictionary-list').dataset.numColumns).toBe('4');
  });

  it('keeps one column on a phone', () => {
    renderScreen();
    expect(screen.getByTestId('dictionary-list').dataset.numColumns ?? '1').toBe('1');
  });

  it('keeps the alphabet grid full width above the columns', () => {
    // The letter picker is a header, not a cell. Handing it to numColumns
    // would slice it into a column and it would stop being a picker.
    win.width = 1400;
    renderScreen();
    const header = screen.getByTestId('dictionary-alphabet');
    expect(header.closest('[data-testid="grid-cell"]')).toBeNull();
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/mobile && npx vitest run src/screens/DictionaryScreen.test.tsx`
Expected: FAIL — `numColumns` undefined at 1400dp.

- [ ] **Step 3: Implement**

```tsx
  const { columns, itemWidth } = useColumns(minCardWidths.dictionaryRoot, { gap: 10, horizontalPadding: 32 });
```

On the `dictionary-list` FlatList: `numColumns={columns}`, `key={`cols-${columns}`}`, `columnWrapperStyle={columns > 1 ? { gap: 10 } : undefined}`, and wrap the rendered root in `<GridCell width={itemWidth}>` — imported from `@/components/BrowseList`, not reimplemented. `ListHeaderComponent` is outside the column flow already — RN renders it full width — so the `AlphabetGrid` needs no change beyond a `testID="dictionary-alphabet"` for the assertion.

- [ ] **Step 4: Run the tests**

Run: `cd apps/mobile && npx vitest run src/screens/DictionaryScreen.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Mutation-check**

Replace `numColumns={columns}` with `numColumns={1}`: the 4-column test must FAIL. Restore by editing.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/DictionaryScreen.tsx apps/mobile/src/screens/DictionaryScreen.test.tsx
git commit -m "feat(mobile/dictionary): lay the root list out in columns on a wide window"
```

---

### Task 5: Bookmark cards as a grid, swipe intact

**Files:**
- Modify: `apps/mobile/src/screens/BookmarksScreen.tsx:389,420`
- Test: `apps/mobile/src/screens/BookmarksTab.test.tsx`

**Interfaces:**
- Consumes: `useColumns`, `minCardWidths.bookmarkCard`, and `GridCell` + `chunk` from `@/components/BrowseList`.
- Produces: nothing.

**R8: swipe-to-delete stays inside the grid.** Two swipeables side by side share a row's horizontal pan. `react-native-gesture-handler` resolves that per-view — the pan is claimed by the view the touch began in — so no code is needed to make it work, but nothing in jsdom can prove it. Device check 507 is the only gate. `Swipeable` also clips its own shadow (known gotcha), so the cell must not add `overflow:hidden`.

- [ ] **Step 1: Write the failing test**

```tsx
  it('lays bookmark cards out in columns on a landscape tablet', () => {
    // 1400dp, 420dp measured minimum -> 3 columns. The minimum is the
    // largest of the four surfaces because a note can run two lines.
    win.width = 1400;
    renderScreen();
    expect(screen.getByTestId('bookmarks-list').dataset.numColumns).toBe('3');
  });

  it('keeps one column on a phone', () => {
    renderScreen();
    expect(screen.getByTestId('bookmarks-list').dataset.numColumns ?? '1').toBe('1');
  });

  it('keeps every card swipeable in the grid', () => {
    // R8. A grid that quietly drops the swipe wrapper takes delete away on
    // exactly the screens that gained columns, and looks like a layout change.
    win.width = 1400;
    renderScreen();
    expect(screen.getAllByTestId('bookmark-swipeable').length).toBe(screen.getAllByTestId('bookmark-card').length);
  });

  it('chunks the surah sections into rows of N', () => {
    // The surah tab is a SectionList, which has no numColumns.
    win.width = 1400;
    renderScreen({ tab: 'surah' });
    expect(screen.getAllByTestId('grid-cell').length).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/mobile && npx vitest run src/screens/BookmarksTab.test.tsx`
Expected: FAIL — no `numColumns`, no `bookmark-swipeable` testID if the wrapper is currently unnamed (add it in step 3).

- [ ] **Step 3: Implement**

Import the two shared pieces rather than writing second copies of them (§3 DRY):

```tsx
import { GridCell, chunk } from '@/components/BrowseList';
import { useColumns } from '@/theme/windowClass';
import { minCardWidths } from '@/theme/minCardWidths';
```

```tsx
  const { columns, itemWidth } = useColumns(minCardWidths.bookmarkCard, {
    gap: 10,
    horizontalPadding: 32,
  });
```

The recent/notes `FlatList`:

```tsx
        <FlatList
          testID="bookmarks-list"
          data={visible}
          numColumns={columns}
          // RN throws on a numColumns change without a remount, and a rotation
          // changes it.
          key={`cols-${columns}`}
          columnWrapperStyle={columns > 1 ? { gap: 10 } : undefined}
          keyExtractor={(item) => `${tab}-${keyOf(item)}`}
          renderItem={(info) => <GridCell width={itemWidth}>{renderRow(info)}</GridCell>}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: 10, paddingBottom, paddingHorizontal: 16 }}
        />
```

The surah `SectionList` chunks, because `SectionList` has no `numColumns`:

```tsx
        <SectionList
          testID="bookmarks-list"
          sections={sections.map((section) => ({ ...section, data: chunk(section.data, columns) }))}
          keyExtractor={(row) => `surah-${keyOf(row[0]!)}`}
          renderItem={({ item: row }) => (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {row.map((item) => (
                <GridCell key={keyOf(item)} width={itemWidth}>
                  {renderRow({ item })}
                </GridCell>
              ))}
              {Array.from({ length: columns - row.length }, (_, i) => (
                <View key={`spacer-${i}`} style={{ width: itemWidth }} />
              ))}
            </View>
          )}
          ...
        />
```

`renderRow` keeps returning the swipeable card exactly as it does today — R8, and the swipe wrapper is what check 507 exercises.

Two things that must not change:
- `ROW_GAP` stays on the rows, not on the list's `contentContainerStyle`. The delete exit animation closes that gap, and moving it to the container breaks the exit (M6h).
- The cell wrapper gets no `overflow` and no background. `Swipeable` clips shadow already.

`loading` still means "nothing to show yet" — do not render an empty grid while it is true (`m6-pill-settle-deferral`).

- [ ] **Step 4: Run the tests**

Run: `cd apps/mobile && npx vitest run src/screens/BookmarksTab.test.tsx src/motion/bookmarkReveal.test.ts && npx tsc --noEmit`
Expected: PASS. The motion test must pass unchanged — the exit animation is not in scope.

- [ ] **Step 5: Mutation-check**

Remove the swipe wrapper from the grid path: the "keeps every card swipeable" test must FAIL. Restore by editing.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/BookmarksScreen.tsx apps/mobile/src/screens/BookmarksTab.test.tsx
git commit -m "feat(mobile/bookmarks): lay the cards out in columns, swipe intact"
```

---

### Task 6: Search results wrap

**Files:**
- Modify: `apps/mobile/src/screens/SearchScreen.tsx:319-482`
- Test: `apps/mobile/src/screens/SearchScreen.test.tsx`

**Interfaces:**
- Consumes: `useColumns`, `minCardWidths.searchResult`.
- Produces: nothing.

**Different from Tasks 3-5:** search results are **not** virtualized. They are `.map()` calls inside a plain `ScrollView`, grouped under headings (ayahs, roots, …). So this is `flexDirection:'row'` + `flexWrap:'wrap'` on each group's container, not `numColumns`. The group headings stay full width.

- [ ] **Step 1: Write the failing test**

```tsx
  it('wraps each result group into columns on a landscape tablet', () => {
    // 1400dp, 480dp minimum -> 2 columns. Highest minimum in the app: a
    // result carries an Uthmani snippet, the longest single line we draw.
    win.width = 1400;
    renderScreen({ query: 'throne' });
    const group = screen.getByTestId('search-group-ayahs');
    expect(group.style.flexWrap).toBe('wrap');
    expect(screen.getAllByTestId('search-ayah')[0]!.style.width).toBe('455px');
  });

  it('does not wrap on a phone', () => {
    // Compact unchanged: no flexWrap, no pinned card width.
    renderScreen({ query: 'throne' });
    const group = screen.getByTestId('search-group-ayahs');
    expect(group.style.flexWrap).toBe('');
    expect(screen.getAllByTestId('search-ayah')[0]!.style.width).toBe('');
  });

  it('keeps a group heading out of the wrap', () => {
    // A heading pulled into the flow becomes a column and stops heading
    // anything.
    win.width = 1400;
    renderScreen({ query: 'throne' });
    expect(screen.getByTestId('search-heading-ayahs').closest('[data-testid="search-group-ayahs"]')).toBeNull();
  });
```

The `455px` is `(1400 - 32 - 10) / 2` — available width minus one gap, halved. If the padding constant differs when you read the file, recompute it from the formula rather than changing the assertion to something vague.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/mobile && npx vitest run src/screens/SearchScreen.test.tsx`
Expected: FAIL — no `search-group-ayahs` container.

- [ ] **Step 3: Implement**

```tsx
  const { columns, itemWidth } = useColumns(minCardWidths.searchResult, { gap: 10, horizontalPadding: 32 });
  const groupStyle =
    columns > 1
      ? { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 10 }
      : undefined;
```

Wrap each existing `.map()` in `<View testID={`search-group-${name}`} style={groupStyle}>`, leaving the heading `<Text>` outside it, and give each `ResultCard` `style={itemWidth === undefined ? undefined : { width: itemWidth }}`. Heading gets `testID={`search-heading-${name}`}`.

Cards in a wrap have unequal heights and will look ragged — that is accepted for this phase. Do **not** reach for `alignItems:'stretch'` on a wrap; it does not equalise rows in RN and will read as a fix that did nothing.

- [ ] **Step 4: Run the tests**

Run: `cd apps/mobile && npx vitest run src/screens/SearchScreen.test.tsx && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Mutation-check**

Force `groupStyle` to `undefined`: the wrap test must FAIL. Restore by editing.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/SearchScreen.tsx apps/mobile/src/screens/SearchScreen.test.tsx
git commit -m "feat(mobile/search): wrap the result groups into columns on a wide window"
```

---

### Task 7: Sheets become dialogs at expanded

**Files:**
- Modify: `apps/mobile/src/components/BottomSheet.tsx:255-300`
- Test: `apps/mobile/src/components/BottomSheet.test.tsx`

**Interfaces:**
- Consumes: `useWindowClass` from Task 1.
- Produces: nothing new. Every sheet in the app (word, surah-jump, reciter, language, info, note, confirm) inherits this — `BottomSheet` is the one host.

**R9.** At expanded (≥840dp) the sheet becomes a centred floating card: all four corners rounded, `maxWidth: 520`, vertically centred, entering with a scale+fade rather than a slide from the bottom. Below expanded it is exactly the sheet that shipped in #104, capped at 640, unchanged.

Drag-to-dismiss is meaningless on a centred card — there is no edge to drag toward — so the pan is disabled at expanded. Backdrop tap and the back button still dismiss. The grab handle is hidden, because a handle that does nothing is a lie.

- [ ] **Step 1: Write the failing test**

```tsx
  it('becomes a centred dialog on an expanded window', () => {
    // R9. A bottom sheet on a 1400dp landscape tablet puts its controls at the
    // far bottom edge, away from both hands.
    win.width = 1400;
    win.height = 900;
    render(<BottomSheet onClose={() => {}} closeLabel="Close"><span>body</span></BottomSheet>);

    const surface = screen.getByTestId('sheet-surface');
    expect(surface.style.maxWidth).toBe('520px');
    expect(surface.style.alignSelf).toBe('center');
    // Not glued to the bottom any more.
    expect(surface.style.bottom).toBe('');
  });

  it('hides the grab handle on a dialog', () => {
    // The handle advertises a drag, and the dialog has no drag.
    win.width = 1400;
    render(<BottomSheet onClose={() => {}} closeLabel="Close"><span>body</span></BottomSheet>);
    expect(screen.queryByTestId('sheet-handle')).toBeNull();
  });

  it('stays a bottom sheet on a phone and on a medium window', () => {
    // Compact unchanged, and medium deliberately keeps the sheet: a 700dp
    // window is not wide enough for a dialog to read as anything but a sheet
    // with margins.
    for (const width of [360, 700]) {
      win.width = width;
      render(<BottomSheet onClose={() => {}} closeLabel="Close"><span>body</span></BottomSheet>);
      expect(screen.getByTestId('sheet-surface').style.bottom).toBe('0px');
      expect(screen.getByTestId('sheet-handle')).toBeTruthy();
      cleanup();
    }
  });
```

The existing test `caps its rows at the shared content column on a wide display` renders at the default mocked width. If that default is ≥840 it will now fail — set it explicitly to 700 so it keeps testing the sheet path it was written for.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/mobile && npx vitest run src/components/BottomSheet.test.tsx`
Expected: FAIL — surface is bottom-anchored at every width.

- [ ] **Step 3: Implement**

```tsx
  const windowClass = useWindowClass();
  const isDialog = windowClass === 'expanded';
```

The surface style becomes conditional. Keep the existing bottom-sheet branch byte-identical; add the dialog branch:

```tsx
            isDialog
              ? {
                  // A centred card, not a sheet: all four corners, no bottom
                  // inset to clear (nothing is docked against a system bar),
                  // and 520 rather than 640 because a dialog wants to read as
                  // an object on the screen, not as a column of the page.
                  alignSelf: 'center',
                  width: '100%',
                  maxWidth: 520,
                  borderRadius: 28,
                  paddingHorizontal: 20,
                  paddingTop: 20,
                  paddingBottom: 20,
                  gap: 14,
                }
              : { /* unchanged sheet style */ },
```

Wrap the `Modal`'s root in `justifyContent: isDialog ? 'center' : 'flex-end'`. Gate the `GestureDetector` on `!isDialog` — mount it only for the sheet. Give the handle `testID="sheet-handle"` and render it only when `!isDialog`.

The entry animation: the existing shared value drives `translateY` for the sheet. For the dialog drive `opacity` and `scale` from the same value. **Do not call `withTiming` inside a worklet** — set the shared value in an effect (`reanimated-withtiming-in-worklet-restarts`). Honour `reduceMotion`: no scale, opacity only.

`sheet-content` keeps `centredContent` exactly as it is — at 520 the cap never binds, and it still binds at medium.

- [ ] **Step 4: Run the tests**

Run: `cd apps/mobile && npx vitest run src/components/BottomSheet.test.tsx && npx vitest run && npx tsc --noEmit`
Expected: PASS. Run the **whole** suite here — seven sheets sit on this component.

- [ ] **Step 5: Mutation-check**

Force `isDialog` to `false`: the dialog tests must FAIL. Force it to `true`: the "stays a bottom sheet" test must FAIL. Both directions, because a constant in either direction is the bug class here. Restore by editing.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/BottomSheet.tsx apps/mobile/src/components/BottomSheet.test.tsx
git commit -m "feat(mobile): sheets become centred dialogs on an expanded window"
```

---

### Task 8: The reader's collapsible ayah/juz rail

**Files:**
- Create: `apps/mobile/src/components/reader/AyahRail.tsx`
- Create: `apps/mobile/src/components/reader/AyahRail.test.tsx`
- Modify: `apps/mobile/src/components/SurahReader.tsx`
- Modify: `apps/mobile/src/settings/settingsStore.tsx:122`
- Test: `apps/mobile/src/components/SurahReader.test.tsx`

**Must land after Task 2.**

**Interfaces:**
- Consumes: `useWindowClass`; `getJuzIndex(client): Promise<JuzEntry[]>` from `@quran-corpus/data/mobile`, whose `JuzEntry` carries `{ juz, ranges: JuzSurahRange[] }` and `JuzSurahRange` carries `{ surahId, surahName, firstAyahNumber, lastAyahNumber, ayahCount }`; `useAppSettings()` / `setRailCollapsed` from the settings store.
- Produces:
  - `interface JuzMark { juz: number; firstAyahNumber: number }`
  - `function juzMarksForSurah(index: JuzEntry[], surahId: number): JuzMark[]`
  - `<AyahRail surahId ayahCount juzMarks activeAyahNumber collapsed onToggleCollapsed onSelectAyah />`

**R4, R5.** Expanded only (≥840dp). Collapsible, and the collapsed state persists. On a phone and at medium the rail does not exist and the jump sheet is untouched.

`juzMarksForSurah` is pure and gets its own tests — it is the one piece of logic here, and `getJuzIndex`'s own docstring warns that a juz's aggregate start is *not* a real ayah of that juz. We only ever read `ranges`, which is per-(juz, surah) and therefore contiguous.

- [ ] **Step 1: Write the failing test**

```tsx
// apps/mobile/src/components/reader/AyahRail.test.tsx
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const win = vi.hoisted(() => ({ width: 1400, height: 900 }));

vi.mock('react-native', async () => ({
  ...(await import('@/testing/rnHosts.js')).reactNativeTextMock(),
  useWindowDimensions: () => ({ ...win, scale: 3, fontScale: 1 }),
}));

import { AyahRail, juzMarksForSurah } from './AyahRail';

const index = [
  {
    juz: 1,
    startSurahId: 1,
    startAyahNumber: 1,
    surahName: 'Al-Fatiha',
    ayahCount: 148,
    ranges: [
      { surahId: 1, surahName: 'Al-Fatiha', firstAyahNumber: 1, lastAyahNumber: 7, ayahCount: 7 },
      { surahId: 2, surahName: 'Al-Baqara', firstAyahNumber: 1, lastAyahNumber: 141, ayahCount: 141 },
    ],
  },
  {
    juz: 2,
    startSurahId: 2,
    startAyahNumber: 142,
    surahName: 'Al-Baqara',
    ayahCount: 111,
    ranges: [
      { surahId: 2, surahName: 'Al-Baqara', firstAyahNumber: 142, lastAyahNumber: 252, ayahCount: 111 },
    ],
  },
];

describe('juzMarksForSurah', () => {
  it('returns every juz that touches the surah, at the ayah it starts on there', () => {
    // Al-Baqara spans juz 1 (from 1) and juz 2 (from 142). The mark is the
    // range's firstAyahNumber, NOT the juz's own startAyahNumber -- juz 2
    // starts at 2:142 so they agree there, but juz 1 starts at 1:1, which is
    // not in Al-Baqara at all and would put a "JUZ 1" mark on a wrong row.
    expect(juzMarksForSurah(index, 2)).toEqual([
      { juz: 1, firstAyahNumber: 1 },
      { juz: 2, firstAyahNumber: 142 },
    ]);
  });

  it('returns one mark for a surah inside a single juz', () => {
    expect(juzMarksForSurah(index, 1)).toEqual([{ juz: 1, firstAyahNumber: 1 }]);
  });

  it('returns nothing for a surah the index does not reach', () => {
    expect(juzMarksForSurah(index, 114)).toEqual([]);
  });

  it('orders marks by juz, whatever order the index arrives in', () => {
    expect(juzMarksForSurah([...index].reverse(), 2).map((m) => m.juz)).toEqual([1, 2]);
  });
});

describe('AyahRail', () => {
  afterEach(cleanup);

  const props = {
    surahId: 2,
    ayahCount: 5,
    juzMarks: [{ juz: 1, firstAyahNumber: 1 }],
    activeAyahNumber: 2,
    collapsed: false,
    onToggleCollapsed: () => {},
    onSelectAyah: () => {},
  };

  it('marks the active ayah, and only that one', () => {
    render(<AyahRail {...props} />);
    const active = screen.getAllByTestId('rail-ayah').filter((n) => n.dataset.active === 'true');
    expect(active).toHaveLength(1);
    expect(active[0]!.dataset.ayah).toBe('2');
  });

  it('draws a juz heading at the ayah the juz starts on', () => {
    render(<AyahRail {...props} juzMarks={[{ juz: 1, firstAyahNumber: 1 }, { juz: 2, firstAyahNumber: 4 }]} />);
    expect(screen.getAllByTestId('rail-juz').map((n) => n.dataset.beforeAyah)).toEqual(['1', '4']);
  });

  it('gives every row a 48dp target', () => {
    // §8: a strip of small numerals is not a thumb target.
    render(<AyahRail {...props} />);
    for (const row of screen.getAllByTestId('rail-ayah')) {
      expect(Number.parseFloat(row.style.minHeight)).toBeGreaterThanOrEqual(48);
    }
  });

  it('draws only the toggle when collapsed', () => {
    render(<AyahRail {...props} collapsed />);
    expect(screen.queryAllByTestId('rail-ayah')).toHaveLength(0);
    expect(screen.getByTestId('rail-toggle')).toBeTruthy();
  });

  it('pairs aria-expanded with aria-controls on the toggle', () => {
    // Review-flagged pattern in this repo: a disclosure with
    // accessibilityState.expanded and nothing saying what it controls.
    render(<AyahRail {...props} />);
    const toggle = screen.getByTestId('rail-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-controls')).toBe('reader-ayah-rail');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/mobile && npx vitest run src/components/reader/AyahRail.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the rail**

```tsx
export interface JuzMark {
  juz: number;
  /** The ayah *of this surah* the juz begins at. */
  firstAyahNumber: number;
}

/**
 * The juz boundaries that fall inside one surah.
 *
 * Read off `ranges`, never off a JuzEntry's own `startAyahNumber`: that is the
 * juz's first ayah anywhere, so for a juz that opens in the previous surah it
 * names an ayah this surah does not contain -- and it looks entirely plausible
 * (see getJuzIndex's docstring in packages/data).
 */
export function juzMarksForSurah(index: readonly JuzEntry[], surahId: number): JuzMark[] {
  return index
    .flatMap((entry) =>
      entry.ranges
        .filter((range) => range.surahId === surahId)
        .map((range) => ({ juz: entry.juz, firstAyahNumber: range.firstAyahNumber })),
    )
    .sort((a, b) => a.juz - b.juz);
}
```

The rail itself: a `FlatList` of ayah numbers, `nativeID="reader-ayah-rail"`, each row `minHeight: touchTargets.minimum`, the active row marked and scrolled into view when `activeAyahNumber` changes, a juz heading rendered above the row whose number matches a mark. The toggle carries `accessibilityRole="button"`, `accessibilityState={{ expanded: !collapsed }}` and `aria-controls`/`accessibilityControls` naming `reader-ayah-rail`.

Do **not** put `accessible` on the rail container — it would hide every row from TalkBack and `rnHosts` drops the prop, so no test here would catch it (`rn-accessible-view-collapses-children`).

Collapse animation: animate width via a shared value set in an effect, never `withTiming` in a worklet. Skip the animation entirely when `reduceMotion` is set. If you measure the rail's natural width, measure it **out of flow** (`position:'absolute'`) — a height/width-animated clip starves its own `onLayout` (`collapsible-measures-out-of-flow`).

- [ ] **Step 4: Host it in the reader**

In `SurahReader.tsx`: at `windowClass === 'expanded'`, wrap the list in a row — rail, then the ayah column with `maxWidth: MAX_CONTENT_WIDTH` on the list's `contentContainerStyle`. Below expanded, render exactly what ships today plus the capped `contentContainerStyle`.

The column box must take its width from the row's layout, not from a cached measure: give it `flex: 1` (which is `flexGrow:1, flexShrink:1, flexBasis:0`), **not** `flexShrink: 1`. Android caches a Text's measured width across a window reconfiguration and a remount does not clear it — this is the exact defect that cost vc69→vc71 in S3. Assert `flexGrow === '1'` and `flexBasis === 0` in the reader test; never assert `flexShrink`.

`activeAyahNumber` comes from the position the reader already tracks for `reading_history`. Do not add a second viewability handler — viewability fires on a **set change, not on scroll**, so it never fires inside one long ayah, and a second one would disagree with the first (`viewable-set-change-not-scroll`).

Persist the collapsed state: add `readerRailCollapsed` to `settingKeys` in `settingsStore.tsx:122`, default `false`, parsed as `=== 'true'` like `reduceMotion`. Additive only.

- [ ] **Step 5: Run the tests**

Run: `cd apps/mobile && npx vitest run src/components/reader src/components/SurahReader.test.tsx src/settings && npx tsc --noEmit && npx eslint .`
Expected: PASS.

- [ ] **Step 6: Mutation-check**

Change `juzMarksForSurah` to read `entry.startAyahNumber` instead of `range.firstAyahNumber`: the first test must FAIL with juz 1's mark at the wrong ayah. Drop the `.sort`: the ordering test must FAIL. Change the reader column's `flex: 1` to `flexShrink: 1`: the reader's flex assertion must FAIL. Restore each by editing.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/components/reader apps/mobile/src/components/SurahReader.tsx apps/mobile/src/components/SurahReader.test.tsx apps/mobile/src/settings/settingsStore.tsx
git commit -m "feat(mobile/reader): a collapsible ayah and juz rail in the margin

R4/R5: the reader keeps a 640dp measure on a wide window, and the space
that freed carries the jump control permanently instead of dead gradient
-- with the position marker and the juz boundaries the sheet could never
show. Expanded only; the phone is untouched."
```

---

### Task 9: Orientation — free on large screens, portrait on a phone

**Files:**
- Create: `apps/mobile/src/layout/orientation.ts`
- Create: `apps/mobile/src/layout/orientation.test.ts`
- Modify: `apps/mobile/app/_layout.tsx`
- Modify: `apps/mobile/app.json`
- Modify: `apps/mobile/package.json`

**Run this last** — rotation is a window reconfiguration, and it should be tested against finished layouts.

**Interfaces:**
- Consumes: `CLASS_MEDIUM_MIN` from Task 1.
- Produces: `applyOrientationPolicy(deps: { smallestWidth: number; lock: (o: number) => Promise<void>; portraitUp: number }): Promise<'locked' | 'free'>`

**R3, R14.** Android sets orientation per-activity, statically — "portrait on phones, free on tablets" needs a runtime call, hence `expo-screen-orientation`. `app.json` goes to `orientation: "default"` and the lock is re-applied at launch for compact devices.

Device class here is **smallest screen width**, not window width: a phone in landscape is an 800dp-wide *window*, and keying the lock off window width would unlock the phone the moment it rotated once.

- [ ] **Step 1: Install the dependency**

```bash
cd apps/mobile && npx expo install expo-screen-orientation
```

This is a native module: the next device build needs a full `expo prebuild` + Gradle run, not a Metro reload. Expo Go bundles it, so the Expo Go loop keeps working.

- [ ] **Step 2: Write the failing test**

Injected dependencies, so no native module is needed in jsdom.

```ts
// apps/mobile/src/layout/orientation.test.ts
import { describe, expect, it, vi } from 'vitest';
import { applyOrientationPolicy } from './orientation';

const PORTRAIT_UP = 1;

describe('applyOrientationPolicy', () => {
  it('locks a phone to portrait', async () => {
    const lock = vi.fn(async () => {});
    await expect(
      applyOrientationPolicy({ smallestWidth: 360, lock, portraitUp: PORTRAIT_UP }),
    ).resolves.toBe('locked');
    expect(lock).toHaveBeenCalledWith(PORTRAIT_UP);
  });

  it('leaves a tablet free', async () => {
    const lock = vi.fn(async () => {});
    await expect(
      applyOrientationPolicy({ smallestWidth: 800, lock, portraitUp: PORTRAIT_UP }),
    ).resolves.toBe('free');
    expect(lock).not.toHaveBeenCalled();
  });

  it('decides on the SMALLEST width, so a rotated phone stays locked', async () => {
    // The whole point of smallestWidth. A phone in landscape is an 800dp-wide
    // window; keying off window width would unlock it after one rotation and
    // it would never lock again.
    const lock = vi.fn(async () => {});
    await expect(
      applyOrientationPolicy({ smallestWidth: 360, lock, portraitUp: PORTRAIT_UP }),
    ).resolves.toBe('locked');
  });

  it('frees exactly at 600dp', async () => {
    const lock = vi.fn(async () => {});
    expect(await applyOrientationPolicy({ smallestWidth: 599, lock, portraitUp: PORTRAIT_UP })).toBe('locked');
    expect(await applyOrientationPolicy({ smallestWidth: 600, lock, portraitUp: PORTRAIT_UP })).toBe('free');
  });

  it('does not take the app down when the lock rejects', async () => {
    // Some OEM skins refuse the call. A rejected promise at launch, unhandled,
    // is a crash on the splash screen -- the worst place in the app to have one.
    const lock = vi.fn(async () => {
      throw new Error('not permitted');
    });
    await expect(
      applyOrientationPolicy({ smallestWidth: 360, lock, portraitUp: PORTRAIT_UP }),
    ).resolves.toBe('free');
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `cd apps/mobile && npx vitest run src/layout/orientation.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Implement**

```ts
// apps/mobile/src/layout/orientation.ts
import { CLASS_MEDIUM_MIN } from '@/theme/windowClass';

export interface OrientationPolicyDeps {
  /** min(screen width, screen height) -- the device's own smallest width, not
   *  the current window's. A phone in landscape is an 800dp-wide window. */
  smallestWidth: number;
  lock: (orientation: number) => Promise<void>;
  portraitUp: number;
}

/**
 * Portrait on a phone, free above 600dp (owner ruling R3, 2026-09-28).
 *
 * Android only takes a static per-activity orientation, so the manifest says
 * "default" and this re-applies the phone lock at launch.
 *
 * A refused lock resolves 'free' rather than throwing: some OEM skins reject
 * the call, and an unhandled rejection at launch is a crash on the splash
 * screen. A phone that rotates is a cosmetic miss; a phone that will not start
 * is not.
 */
export async function applyOrientationPolicy({
  smallestWidth,
  lock,
  portraitUp,
}: OrientationPolicyDeps): Promise<'locked' | 'free'> {
  if (smallestWidth >= CLASS_MEDIUM_MIN) return 'free';
  try {
    await lock(portraitUp);
    return 'locked';
  } catch {
    return 'free';
  }
}
```

Call site in `app/_layout.tsx`, inside an effect that runs once:

```tsx
  useEffect(() => {
    const { width, height } = Dimensions.get('screen');
    void applyOrientationPolicy({
      smallestWidth: Math.min(width, height),
      lock: ScreenOrientation.lockAsync,
      portraitUp: ScreenOrientation.OrientationLock.PORTRAIT_UP,
    });
  }, []);
```

`app.json`: `"orientation": "default"`, and bump `versionCode`. Per CLAUDE.md §7 `android/` is gitignored, so the matching `versionCode` edit in `apps/mobile/android/app/build.gradle` is made for the build and **cannot be committed** — only `app.json` goes in.

- [ ] **Step 5: Run the tests**

Run: `cd apps/mobile && npx vitest run && npx tsc --noEmit && npx eslint .`
Expected: PASS, whole suite.

- [ ] **Step 6: Mutation-check**

Change `>=` to `>` in the class comparison: the "frees exactly at 600dp" test must FAIL. Replace the `try/catch` with a bare `await lock(...)`: the rejection test must FAIL. Restore each by editing.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/layout apps/mobile/app/_layout.tsx apps/mobile/app.json apps/mobile/package.json ../../pnpm-lock.yaml
git commit -m "feat(mobile): support landscape on large screens, keep the phone portrait

Android takes orientation per-activity and statically, so the manifest
goes to default and expo-screen-orientation re-applies the phone lock at
launch (owner approved the dependency, §12). Device class is the smallest
screen width, not the window's: a phone in landscape is an 800dp window
and would otherwise unlock itself after one rotation."
```

---

### Task 10: The prose screens keep a measure

**Files:**
- Modify: `apps/mobile/src/screens/SettingsScreen.tsx:298`
- Modify: `apps/mobile/src/screens/AboutScreen.tsx:97`
- Modify: `apps/mobile/src/screens/LicenseScreen.tsx`
- Modify: `apps/mobile/src/screens/MenuScreen.tsx:37`
- Test: `apps/mobile/src/screens/SettingsTab.test.tsx`, `AboutTab.test.tsx`, `LicenseScreen.test.tsx`, `MenuScreen.test.tsx`

**Batched deliberately:** four files, one identical mechanical change each. One task, one review surface.

**Interfaces:**
- Consumes: `centredContent` from `@/theme/contentWidth`.
- Produces: nothing.

These four are long copy in a `ScrollView`. Task 2 took their cap away with everyone else's; they are the screens that genuinely wanted it. My ruling, cost recorded above.

- [ ] **Step 1: Write the failing tests**

One per screen, same shape:

```tsx
  it('keeps its copy to a readable measure on a wide window', () => {
    // These four are prose, and prose does not get wider than its measure.
    // Task 2 removed the navigator cap that used to do this for every screen;
    // these are the screens that actually wanted it.
    win.width = 1400;
    renderScreen();
    const content = screen.getByTestId('settings-content'); // about-, license-, menu-
    expect(content.style.maxWidth).toBe(`${MAX_CONTENT_WIDTH}px`);
    expect(content.style.alignSelf).toBe('center');
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd apps/mobile && npx vitest run src/screens/SettingsTab.test.tsx src/screens/AboutTab.test.tsx src/screens/LicenseScreen.test.tsx src/screens/MenuScreen.test.tsx`
Expected: FAIL ×4 — no testID, no cap.

- [ ] **Step 3: Implement**

On each `ScrollView`, spread `centredContent` into `contentContainerStyle` and add the testID:

```tsx
      <ScrollView
        testID="settings-content"
        contentContainerStyle={{ ...existing, ...centredContent }}
```

`centredContent` is `{ width:'100%', maxWidth:640, alignSelf:'center' }` — on a `contentContainerStyle` that centres the content inside the scroll view, which is what is wanted. Do not put it on `style`; that would centre the scroll view itself and its scrollbar with it.

- [ ] **Step 4: Run the tests**

Run: `cd apps/mobile && npx vitest run src/screens && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Mutation-check**

Remove the spread from `SettingsScreen` only: that one test must FAIL and the other three must still pass — proving the four assertions are independent and not one shared helper. Restore by editing.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens
git commit -m "fix(mobile): keep the prose screens to a readable measure"
```

---

### Task 11: Build, device run, and the verification log

**Files:**
- Modify: `docs/plans/phase-s4a-responsive-tablet.md` (the verification log below)
- Modify: `apps/mobile/app.json` (versionCode, if not already bumped in Task 9)

**Interfaces:** none. This task's deliverable is a filled-in log and a recorded pass/fail per check.

§10: `apps/mobile` has no emulator in CI, so the device checklist **is** the gate. "Implementation complete, verification pending" is an unmet exit criterion.

- [ ] **Step 1: Full local gate**

```bash
cd apps/mobile && npx vitest run && npx tsc --noEmit && npx eslint .
```

All three green before a build. Never `npm run build` or Gradle while `expo start` is running.

- [ ] **Step 2: Build the APK**

`expo-screen-orientation` is native, so this needs a prebuild, not a reload:

```bash
cd apps/mobile && npx expo prebuild --platform android --clean
```

Then the constrained Gradle run — `taskset` is mandatory (an unconstrained run hit load 136):

```bash
export JAVA_HOME=$HOME/jdk-17 GRADLE_OPTS=-Xmx3g
cd apps/mobile/android && taskset -c 7,8 ./gradlew assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a
```

Verify the artifact before serving it — a globbed `aapt2` path silently prints nothing, so resolve it:

```bash
/home/claude/android-sdk/build-tools/35.0.0/aapt2 dump badging apps/mobile/android/app/build/outputs/apk/release/app-release.apk | head -3
```

Confirm `versionCode` matches `app.json` and `native-code: 'arm64-v8a'`. Serve a **copy** named for the versionCode, never a symlink.

- [ ] **Step 3: Install**

```bash
export PATH=$HOME/android-sdk/platform-tools:$PATH
adb install -r --user 0 "$CLAUDE_JOB_DIR/tmp/serve/quran-corpus-vc<N>.apk"
```

`--user 0` is **not optional**: an unqualified `adb install -r` once landed on user 10 (Guest) and wiped user-0 app data.

- [ ] **Step 4: Run the checklist**

Coordinate with the owner before driving any device — the phone under adb may also be the display for the session. Every `screencap` is preceded by a foreground-app guard, and the capture happens only if the focus contains `qurancorpus`:

```bash
adb shell dumpsys window | grep mCurrentFocus
```

| # | Check | Device | Result |
|---|---|---|---|
| 500 | Home, Surahs, Dictionary, Bookmarks, Menu fill the display in landscape — no dead bands | Tab S10+ | |
| 501 | Same five in portrait | Tab S10+ | |
| 502 | Browse list shows 3 columns landscape, 2 portrait; no clipped or ellipsised row | Tab S10+ | |
| 503 | Rotate while on Browse — no redbox, columns recount, no stale ellipsis (trap 7, the `numColumns` key) | Tab S10+ | |
| 504 | Dictionary roots grid; alphabet picker stays full width | Tab S10+ | |
| 505 | **Re-measure** each surface's min card width against the longest real content; correct `minCardWidths.ts` | Tab S10+ | |
| 506 | Bookmarks grid, cards aligned, shadow not clipped | Tab S10+ | |
| 507 | Swipe-to-delete on a card in the middle column; the neighbour does not move | Tab S10+ | |
| 508 | Search results in 2 columns; Uthmani snippet not clipped | Tab S10+ | |
| 509 | Word sheet opens as a centred dialog, no grab handle, backdrop tap dismisses | Tab S10+ | |
| 510 | Surah-jump, reciter, language, note and confirm sheets, all as dialogs | Tab S10+ | |
| 511 | Reader: capped column, rail on the side, active marker tracks scroll | Tab S10+ | |
| 512 | Rail juz headings land on the right ayahs for Al-Baqara (juz 1 at 1, juz 2 at 142) | Tab S10+ | |
| 513 | Collapse the rail, kill the app, reopen — still collapsed | Tab S10+ | |
| 514 | Rail toggle announces expanded/collapsed under TalkBack; rows are reachable (trap 1) | Tab S10+ | |
| 515 | Tab pill still a centred pill, opaque over content (R6, trap 2) | Tab S10+ | |
| 516 | Rotate on the reader mid-surah — position holds, no ellipsis on the surah name (trap 7) | Tab S10+ | |
| 517 | Split-screen at ~500dp: single column everywhere, sheets are sheets not dialogs | Tab S10+ | |
| 518 | Freeform/resizable window dragged across 600 and 840 — layout recounts live | Tab S10+ | |
| 519 | Phone regression: all five tabs, reader, sheets — **identical to vc72**, no rail, no columns | OnePlus / S24 | |
| 520 | Phone stays portrait when rotated; tablet rotates freely (R3) | both | |
| 521 | Large font scale (OS setting at max) — columns drop rather than rows wrapping | Tab S10+ | |

- [ ] **Step 5: Record the result in this file**

Fill the Result column, and write a Verification Log entry below with the versionCode, the date, every defect found and what was done about it. A check that was not run is recorded as **not run**, never as a pass.

- [ ] **Step 6: Commit and push. Do not open the PR.**

```bash
git add docs/plans/phase-s4a-responsive-tablet.md apps/mobile/src/theme/minCardWidths.ts
git commit -m "docs(plans): S4a device run results"
git push -u origin feat/s4a-responsive-tablet
```

**Opening the PR is the owner's call — never `gh pr create` unprompted.** Stop here and report.

---

## Acceptance criteria

- [ ] No `maxWidth` on any navigator's `contentStyle`/`sceneStyle`, guarded by a test.
- [ ] Browse, dictionary, bookmarks and search all lay out in more than one column at 1400dp, and in exactly one at 599dp.
- [ ] Column counts come from measured minimums in `minCardWidths.ts`, corrected by check 505.
- [ ] Sheets are centred dialogs at ≥840dp, bottom sheets below.
- [ ] Reader has a collapsible ayah/juz rail at ≥840dp, and the collapsed state survives a restart.
- [ ] Tablet rotates; phone does not.
- [ ] Split-screen at ~500dp gets the compact layout.
- [ ] Full suite, `tsc --noEmit` and `eslint` all green.
- [ ] Every new branch/formula mutation-checked, with the failing test named.
- [ ] Checks 500-521 run on hardware and recorded, check 519 confirming the phone is unchanged.

## Risks and rollbacks

| Risk | Mitigation | Rollback |
|---|---|---|
| Stale Android `Text` measure on rotation (trap 7) | `flex: 1` on the reader column, never `flexShrink` | Check 503/516 catches it; the fix is the flex property, not a remount |
| `numColumns` change without a remount throws natively | `key={`cols-${columns}`}` on every gridded list | Check 503 |
| Side-by-side swipeables mis-claim a pan (R8) | Device-only gate, check 507 | Bookmarks fall back to one column — one-line change to the minimum |
| Measured minimums wrong → ragged or clipped rows | Check 505 re-measures and corrects the table | Raise the minimum; fewer columns is always safe |
| `expo-screen-orientation` adds APK weight against S2's goal | One Expo module, arm64 only | `orientation: "portrait"` in app.json and delete `src/layout/orientation.ts` |
| Dialog conversion breaks one of the seven sheets | Full suite on Task 7, checks 509-510 | `isDialog = false` restores the shipped sheet exactly |
| Phase invisibly changes the phone | A compact assertion in every task's tests; check 519 | Per-task revert; commits are one-surface each |

## Out of scope, deliberately

- **Mushaf** — S4b owns it. It already opts out of the cap and shows none of this bug.
- **Khatm ribbon, font-size stepper** — S4c (R13).
- **Navigation rail** — R6 keeps the centred pill at every width.
- **Master-detail anywhere** — R2.
- **`apps/web`** — R15.
- **Fold device verification** — R12, no hardware. The 939dp case is covered by the freeform check 518 as far as it can be, and stays owed.
- **Equal-height search result rows** — ragged wrap accepted this phase.

## Verification log

### Device run 1 — 2026-09-29, Tab S10+ (SM-X820), vc73 → vc76

Build: local Gradle, arm64-v8a, `taskset -c 7,8`. Note for the next run: the
plan's `~/jdk-17` path is stale — the JDK lives at `~/tools/jdk-17.0.20.1+1`.

Tablet geometry: 1752x2800 at density 320, i.e. **1400dp landscape and 876dp
portrait**. Both are the `expanded` class, so rotation alone never exercises
the compact branch on this device; check 517 reaches it with a `wm size`
override instead.

Three defects found, all of them in the ayah rail, none of them visible to
jsdom, each fixed and re-verified on a fresh build:

| # | Defect | Fix | Verified on |
|---|---|---|---|
| D1 | **Crash.** Opening a surah part-way in (Al-Baqara at 2:147) killed the app: `Invariant Violation: scrollToIndex should be used in conjunction with getItemLayout or onScrollToIndexFailed`. The rail scrolls its active row into view on mount, and that index has never been measured. | `onScrollToIndexFailed` on the rail's list. `getItemLayout` is the wrong half of the pair — a juz heading makes the rows non-uniform. `b5b3015` | vc74 |
| D2 | Rail landed ~80 ayahs short: it sat at ayah 67 with the reader at 154, because `averageItemLength` is averaged over the few cells measured so far. | Jump to the estimate (which mounts the cells around it), then ask again a frame later. `b5b3015`→`(retry)` | vc75 |
| D3 | **Rail did not scroll at all** — every swipe landed on a row as a press. Its container stretches to the reader row, but the FlatList had no flex of its own, so it sized to its 286 rows and was clipped by `overflow: hidden`. | `flex: 1` on the list. | vc76 |

D1 was called in Task 8's own report as "only a device can settle"; it turned
out to be a crash, not a rough landing. D3 is the kind of defect no unit test
in this repo could have caught — the shim renders a list eagerly and in full,
so "the list is clipped and unscrollable" and "the list is fine" look
identical in jsdom.

| # | Check | Device | Result |
|---|---|---|---|
| 500 | Home, Surahs, Dictionary, Bookmarks, Menu fill the display in landscape | Tab S10+ | **PASS** — no dead bands; Menu/prose capped at 640dp and centred, which is the point of Task 10 |
| 501 | Same five in portrait | Tab S10+ | **PASS** |
| 502 | Browse 3 columns landscape, 2 portrait, no clipped row | Tab S10+ | **PASS** — 3 at 1400dp, 2 at 876dp |
| 503 | Rotate on Browse — no redbox, columns recount, no stale ellipsis | Tab S10+ | **PASS** — recounted 3→2 live, trap 7 not observed |
| 504 | Dictionary grid, alphabet picker full width | Tab S10+ | **PASS** (portrait, 2 columns) |
| 505 | Re-measure min card widths against real content | Tab S10+ | **PASS, no correction needed** — nothing clipped or ellipsised at any width tried; `minCardWidths.ts` unchanged |
| 506 | Bookmarks grid, cards aligned, shadow not clipped | Tab S10+ | **NOT RUN** — the device has zero bookmarks and creating them writes the owner's own user DB |
| 507 | Swipe-to-delete in the middle column; neighbour does not move | Tab S10+ | **NOT RUN** — same reason |
| 508 | Search results 2 columns, Uthmani snippet not clipped | Tab S10+ | **PASS** — 2 columns, snippets truncate by `numberOfLines`, not by clipping |
| 509 | Word sheet is a centred dialog, no grab handle, backdrop tap dismisses | Tab S10+ | **PASS** — all three |
| 510 | Surah-jump, reciter, language, note and confirm sheets as dialogs | Tab S10+ | **PARTIAL** — only the word sheet was opened; the other five share the same `isDialog` branch but were not individually seen |
| 511 | Reader: capped column, rail on the side, marker tracks scroll, rail tap jumps | Tab S10+ | **PASS** (after D1/D2/D3) — tapping rail 190 put the reader on 190 |
| 512 | Rail juz headings on the right ayahs | Tab S10+ | **PARTIAL** — `JUZ 1` sits correctly above ayah 1; `JUZ 2` at 142 not seen directly. This is the check that surfaced D1 |
| 513 | Collapse the rail, kill the app, reopen — still collapsed | Tab S10+ | **PASS** — survived `am force-stop`, and the reading position came back with it |
| 514 | Rail toggle announces expanded/collapsed under TalkBack | Tab S10+ | **NOT RUN** — needs TalkBack driven by hand |
| 515 | Tab pill still a centred pill, opaque over content | Tab S10+ | **PASS** — opaque over scrolled rows at every width |
| 516 | Rotate on the reader mid-surah — position holds, no ellipsis on the surah name | Tab S10+ | **PASS** |
| 517 | ~500dp window: single column everywhere, sheets are sheets | Tab S10+ | **PASS (layout)** — via `wm size 1000x1600`; compact layout throughout. Sheet-vs-dialog not separately re-checked at that width |
| 518 | Freeform window dragged across 600 and 840 — layout recounts live | Tab S10+ | **NOT RUN** — needs a hand-dragged freeform window |
| 519 | Phone regression: identical to vc72, no rail, no columns | OnePlus / S24 | **NOT RUN** — no phone attached to this session |
| 520 | Phone stays portrait, tablet rotates freely | both | **HALF** — tablet rotates freely (confirmed repeatedly); the phone half needs a phone |
| 521 | Large font scale — columns drop rather than rows wrapping | Tab S10+ | **PASS** — at `font_scale 1.5` browse went 3 columns → 2, no wrapped or clipped rows |

Device state was restored afterwards: `wm size reset`, `font_scale 1.0`,
rotation back to landscape.

**Observations, not defects:** the rail hugs the screen's left edge with no
outer padding while the ayah column is centred, which reads as detached; and
the active-row highlight was not always visible after a rail-initiated jump.
Both are cosmetic and are the owner's call.

**Still owed before this phase is complete:** checks 506, 507, 514, 518, 519,
and the phone half of 520 — 519 in particular, since "the phone is unchanged"
is this phase's own stated exit criterion and no phone has run this build.


### Review round, vc76+ (`11b39a6`)

`/code-review` on the branch returned 8 findings; 6 were fixed, 2 declined.
The one that matters for this log is the row-height model: it was fed the
viewport's width while the content it models wraps at `MAX_CONTENT_WIDTH`,
so on the tablet every row was estimated at roughly half its true height and
the error compounded down all 286 offsets. That is scroll geometry, and
**checks 511 and 516 were run against the wrong geometry** — both need a
re-run on a build newer than vc76, along with a fresh look at the rail
landing behind the retry cap.

The three cosmetic/a11y fixes (rail marker seeding, rail rows announcing
as buttons, the orientation policy re-running on a screen change) are
untested on hardware: 514 was already owed, and the foldable case behind
the orientation change has no hardware at all (R12).

Declined, with reasons: the dictionary grid's `horizontalPadding: 32` over a
list with no horizontal padding (real, cosmetic, and check 504 has already
passed against the current arithmetic — changing it moves column counts no
hardware has seen), and the 9dp/10dp vertical gap between wrapped search
cards (same).
