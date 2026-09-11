# Phase M7e — Header & Browse Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unsqueeze the reader and morphology headers, fix the stuck mode pill, give the juz list a real disclosure, enlarge the mushaf band numerals, and probe surah-name-color-v4 without shipping it.

**Architecture:** Six UI tasks on `apps/mobile` plus one constants edit in `packages/config/ornaments` and one read-only font spike. Two headers converge on one shape (name owns row 1, surah chevrons flank the mode pill on row 2, actions live in an inline expanding row). One new shared `Collapsible` carries both the header's action row and the juz card's curtain, so the unroll exists once.

**Tech Stack:** React Native + Expo, Reanimated 3, react-native-svg, vitest + @testing-library/react over the `rnHosts` shim, fontTools 4.63 for the spike.

**Spec:** none. Authority is the owner's 2026-09-11 rulings, transcribed verbatim in Owner Rulings below. Rulings bind; this plan argues from them.

## Global Constraints

- Mobile only. `apps/web` is not touched.
- No new npm dependency. §12 forbids adding one without asking; every task here is servable by what is installed.
- No `packages/data` schema or query change, no trust boundary, no on-device user-DB write → **§5 independent review does NOT apply to this phase.** §4 self-review + lint + type-check + tests + mutation-check is the gate.
- `packages/config` stays free of web/Next/Expo/RN imports (§2).
- Every animation respects `prefers-reduced-motion` via the existing `useReducedMotion` (§8).
- WCAG AA: every control keeps a ≥48dp target (`touchTargets.minimum`) or sits inside padding that carries it there; every icon-only control keeps an `accessibilityLabel`; state changes announce via `accessibilityState` (§8).
- No new user-visible English string without the Uzbek and Russian entries beside it — `uiStrings.test.ts` greps sources for literal keys, so keys must be written out, never assembled.
- Commits: Conventional Commits, one logical change each (§9).
- Branch: `feat/m7e-header-polish`, cut from `main` at `7a309f8`.

## Owner Rulings (2026-09-11)

| # | Ruling |
|---|---|
| R1 | Reader header: name owns row 1 with back + `⋮`. **All three actions** (translation toggle, search, language) go in the `⋮`. Nothing kept out. |
| R2 | Mode pill shrinks; surah `‹ ›` flank it on row 2. |
| R3 | Translation-toggle icon becomes an Arabic-style stroke over a Latin line. On = both strokes, accent. Off = Latin line drops away. |
| R4 | `⋮` opens an **inline expanding row** inside the header. Not a sheet, not a popup. Button becomes `✕` while open. |
| R5 | Morphology header **mirrors the reader exactly**: back + name + verse picker on row 1, surah `‹ ›` flanking the Dense/Verse pill on row 2. |
| R6 | Juz children render **inside the juz card** — plain inset rows, hairline separators, no card of their own. |
| R7 | Juz motion is a **curtain unroll**: children clipped from the top, dropping as one block, chevron rotating in step. |
| R8 | Mushaf band numerals **+12%, both of them**. |
| R9 | Stuck pill fixed by teaching `SegmentedControl` about **door options**. |
| R10 | surah-name-color-v4 is a **spike only**. Report back; no UI change this phase. |

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `apps/mobile/src/components/SegmentedControl.tsx` | gains `door` on an option | T1 |
| `apps/mobile/src/components/Collapsible.tsx` | **new** — clip-from-top curtain, height + reduced-motion | T2 |
| `apps/mobile/src/components/icons/Icon.tsx` | `translationOn` / `translationOff` replace `translationText` | T3 |
| `apps/mobile/src/components/ReaderHeader.tsx` | three-row header, inline action row | T3 |
| `apps/mobile/src/screens/WbwScreen.tsx` | header row restructure | T4 |
| `apps/mobile/src/components/BrowseList.tsx` | `children` on a row; `indent` deleted | T5 |
| `apps/mobile/src/screens/SurahsScreen.tsx` | juz rows nest instead of flattening | T5 |
| `packages/config/ornaments/surahBand.ts` | numeral fractions +12% | T6 |
| `docs/plans/phase-m7e-header-and-browse-polish.md` | spike report appended | T7 |

## Pre-flight conflict scan

| Pair / task | Shared surface | Finding |
|---|---|---|
| T1 ↔ T3 | `SegmentedControl` props | T3 consumes the `door` flag T1 produces. Ordered T1 first. Clean. |
| T1 ↔ T4 | `SegmentedControl` | T4's Dense/Verse pill is a real two-state control, no `door`. Untouched by T1's default-off flag. Clean. |
| T2 ↔ T3, T2 ↔ T5 | `Collapsible` | Both consumers. T2 first. Clean. |
| T3 ↔ T4 | `AdjacentNavButton` | Both place it beside a pill; component unchanged by either. Clean. |
| T5 internal | `BrowseItem.indent` | `indent` has exactly one call site (`SurahsScreen.tsx:212`), removed in the same task. No orphan. Clean. |
| T6 ↔ mushaf tests | `SURAH_BAND_NUMERAL_SIZE` | `SurahBand.test.tsx` may assert computed sizes; T6 updates them in the same commit. Flagged, not a conflict. |
| T3 self | title fade | `titleStyle` fades the name in only once the list heading scrolls off. Row 1 at rest is then back + `⋮` with an empty middle. **Ruling: keep the existing fade.** No ruling overturns it, and the row is not empty — it holds two controls. Cost if wrong: one row reads bare at the top of a surah; a device-run row covers it (check 302). |
| T7 | none | Read-only. Writes only this plan file. Clean. |

---

### Task 1: Door options in SegmentedControl

Fixes the reported bug: switch to Words, come back, pill still on Words.

**Root cause (verified in source, not guessed):** `SegmentedControl` sets `optimistic` on press and clears it only when the caller's `value` catches up (`SegmentedControl.tsx`, the un-arrayed effect). `ReaderHeader` hard-codes `value="translation"` and the `wbw` press **navigates** instead of applying — so `optimistic` stays `'wbw'` for the life of the screen. The component's own docstring predicts exactly this caller: *"A caller that never applies it holds the pill on the pressed segment for good."*

**Files:**
- Modify: `apps/mobile/src/components/SegmentedControl.tsx`
- Test: `apps/mobile/src/components/SegmentedControl.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `SegmentedControlProps<T>.options` entries gain optional `door?: boolean`. Default `undefined` = today's behaviour, so every existing caller is unchanged.

- [ ] **Step 1: Write the failing test**

```tsx
it('does not park the wash on a door option', () => {
  // A door fires onChange and navigates away; it never becomes the selection.
  // Without this the optimistic hold never clears -- the caller's `value`
  // can never catch up to a value it will never apply -- and the pill sits
  // on the door for the life of the screen (owner, device, 2026-09-11).
  const onChange = vi.fn();
  const options = [
    { value: 'translation', label: 'Translation' },
    { value: 'wbw', label: 'Words', door: true },
  ] as const;
  const result = render(
    <SegmentedControl options={options} value="translation" onChange={onChange} accessibilityLabel="Mode" />,
  );

  fireEvent.click(result.getByTestId('segment-wbw'));

  expect(onChange).toHaveBeenCalledWith('wbw');
  expect(result.getByTestId('segment-translation').getAttribute('aria-selected')).toBe('true');
  expect(result.getByTestId('segment-wbw').getAttribute('aria-selected')).toBe('false');
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd apps/mobile && npx vitest run src/components/SegmentedControl.test.tsx -t 'door option'`
Expected: FAIL — `segment-wbw` is selected, because `optimistic` was set to `'wbw'`.

- [ ] **Step 3: Implement**

In `SegmentedControlProps`, widen the option:

```ts
  options: readonly {
    value: T;
    label: string;
    /** A segment that leaves the screen rather than selecting.
     *
     *  It fires `onChange` and then nothing: no optimistic hold, no travel
     *  that sticks. Without it the hold never clears -- `value` can never
     *  catch up to a value the caller will never apply -- and the wash sits
     *  on the door for good. The reader's 'Words' is the only one today. */
    door?: boolean;
  }[];
```

In the press handler, before any of the existing work:

```ts
              if (option.value === shown) return;
              if (option.door) {
                // No place(), no setOptimistic, no settle hold: there is no
                // travel to protect, because the wash is not going anywhere.
                onChange(option.value);
                return;
              }
```

- [ ] **Step 4: Run the suite**

Run: `cd apps/mobile && npx vitest run src/components/SegmentedControl.test.tsx`
Expected: PASS, including every pre-existing test — the flag is opt-in.

- [ ] **Step 5: Mutation-check (§4 step 4)**

Delete the `if (option.door)` block. Re-run. Expected: the new test FAILS. Restore by re-editing — **never** `git checkout` / `git restore` (see `never-git-stash-for-a-baseline`).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/SegmentedControl.tsx apps/mobile/src/components/SegmentedControl.test.tsx
git commit -m "fix(mobile): a segment that navigates must not keep the wash"
```

---

### Task 2: Collapsible

One curtain, two consumers (T3's action row, T5's juz children). Extracted rather than written twice (§3 DRY).

**Files:**
- Create: `apps/mobile/src/components/Collapsible.tsx`
- Test: `apps/mobile/src/components/Collapsible.test.tsx`

**Interfaces:**
- Consumes: `useReducedMotion` from `@/motion/useReducedMotion`.
- Produces:
  ```ts
  export interface CollapsibleProps { open: boolean; children: ReactNode; testID?: string }
  export function Collapsible(props: CollapsibleProps): JSX.Element
  ```
  Children mount while `open`, and stay mounted through the closing animation. Measured height is cached, so a reopen has a target on frame one.

- [ ] **Step 1: Write the failing tests**

```tsx
it('keeps its children out of the tree while shut', () => {
  const result = render(<Collapsible open={false}><div data-testid="child" /></Collapsible>);
  expect(result.queryByTestId('child')).toBeNull();
});

it('clips from the top, so the content drops as one block', () => {
  // A curtain, not a fade (owner ruling R7). overflow:hidden on the clip is
  // what makes the height animation read as an unroll rather than as content
  // squashing -- without it the children resize with the container.
  const result = render(<Collapsible open testID="clip"><div data-testid="child" /></Collapsible>);
  expect(result.getByTestId('clip').style.overflow).toBe('hidden');
  expect(result.getByTestId('child')).not.toBeNull();
});
```

- [ ] **Step 2: Run, confirm fail**

Run: `cd apps/mobile && npx vitest run src/components/Collapsible.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, runOnJS } from 'react-native-reanimated';

import { useReducedMotion } from '@/motion/useReducedMotion';

/** How long the curtain takes. Matched to PILL_SETTLE_MS's neighbourhood so
 *  the two motions in one header do not read as different machines. */
const UNROLL_MS = 220;

export interface CollapsibleProps {
  open: boolean;
  children: ReactNode;
  testID?: string;
}

/**
 * A curtain: content clipped from the top, dropping as one block.
 *
 * Height, not opacity. A fade leaves the rows in place and the card's
 * neighbours jump to their final positions on frame one; animating the clip's
 * height is what makes the list below travel with the content (owner ruling
 * R7, 2026-09-11).
 *
 * Children mount on open and stay mounted until the close lands -- unmounting
 * at the top of the close would collapse the clip to nothing instantly and
 * there would be no curtain to watch.
 *
 * The measured height is cached across a close, so a reopen has a target on
 * its first frame rather than springing from 0 to 0 and then jumping.
 */
export function Collapsible({ open, children, testID }: CollapsibleProps) {
  const reduceMotion = useReducedMotion();
  const height = useSharedValue(0);
  const measured = useRef(0);
  // Mount state, separate from `open`: it trails the close by one animation.
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      if (measured.current > 0) {
        height.value = reduceMotion ? measured.current : withTiming(measured.current, { duration: UNROLL_MS });
      }
      return;
    }
    if (reduceMotion) {
      height.value = 0;
      setMounted(false);
      return;
    }
    height.value = withTiming(0, { duration: UNROLL_MS }, (finished) => {
      if (finished) runOnJS(setMounted)(false);
    });
  }, [open, reduceMotion, height]);

  const clipStyle = useAnimatedStyle(() => ({ height: height.value }));

  return (
    <Animated.View testID={testID} style={[{ overflow: 'hidden' }, clipStyle]}>
      {mounted ? (
        <View
          onLayout={(event: LayoutChangeEvent) => {
            const next = event.nativeEvent.layout.height;
            if (next <= 0 || next === measured.current) return;
            measured.current = next;
            // Only while open: a layout arriving mid-close must not re-inflate
            // the clip we are in the middle of shutting.
            if (open) height.value = reduceMotion ? next : withTiming(next, { duration: UNROLL_MS });
          }}
        >
          {children}
        </View>
      ) : null}
    </Animated.View>
  );
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `cd apps/mobile && npx vitest run src/components/Collapsible.test.tsx`
Expected: PASS.

- [ ] **Step 5: Mutation-check**

Flip `if (next <= 0 || next === measured.current) return;` to `if (next < 0) return;` — the suite should still pass (that guard is a perf guard, not a behaviour guard), so instead delete `overflow: 'hidden'` and confirm the clip test FAILS; then delete the `mounted ? … : null` guard and confirm the shut test FAILS. Restore by re-editing.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/Collapsible.tsx apps/mobile/src/components/Collapsible.test.tsx
git commit -m "feat(mobile): a curtain that unrolls, for the header and the juz card"
```

---

### Task 3: Reader header — name on its own row, actions in a curtain

**Files:**
- Modify: `apps/mobile/src/components/icons/Icon.tsx`
- Modify: `apps/mobile/src/components/ReaderHeader.tsx`
- Modify: `apps/mobile/src/i18n/uiStrings.ts`
- Test: `apps/mobile/src/components/ReaderHeader.test.tsx`, `apps/mobile/src/components/icons/Icon.test.tsx`

**Interfaces:**
- Consumes: `Collapsible` (T2), `SegmentedControl` option `door` (T1).
- Produces: no prop change to `ReaderHeaderProps`. `SurahReader` is untouched.

- [ ] **Step 1: New icons**

In `Icon.tsx`, remove `'translationText'` from `IconName` and `PATHS`, add:

```ts
  | 'translationOn'
  | 'translationOff'
```

```ts
  // The switch that draws or hides the translation under the Arabic. An
  // Arabic-style stroke over a Latin line: ON shows both, OFF drops the Latin
  // line, so the glyph says which script is on screen rather than merely that
  // something is toggled. The three flat lines this replaces read as a
  // hamburger on the device (owner, 2026-09-11, ruling R3).
  //
  // Deliberately not a second globe: the globe beside it picks the language,
  // and two glyphs of the same thing name neither.
  translationOn: [
    'M4 8.5c1.7-2.4 3.2.6 4.9-.7 1.5-1.2 3 1.3 4.5.9 1.3-.3 2.1-1.3 3.7-1.3',
    'M5 15.5h14',
  ],
  translationOff: [
    'M4 8.5c1.7-2.4 3.2.6 4.9-.7 1.5-1.2 3 1.3 4.5.9 1.3-.3 2.1-1.3 3.7-1.3',
  ],
```

Update `Icon.test.tsx` wherever it enumerates names.

- [ ] **Step 2: Write the failing header tests**

```tsx
it('gives the surah name a row of its own', () => {
  // Seven controls in a 390pt row left the name ~34pt -- 'Al-B...' on the
  // device (owner screenshot, 2026-09-11). The chevrons moved down to the
  // pill row; only back and the actions button share row 1 now.
  const result = render(<ReaderHeader {...props} />);
  const title = result.getByTestId('reader-title');
  const row = title.parentElement!;
  expect(within(row).queryByTestId('surah-previous')).toBeNull();
  expect(within(row).queryByTestId('surah-next')).toBeNull();
  expect(within(row).queryByTestId('reader-back')).not.toBeNull();
  expect(within(row).queryByTestId('reader-actions')).not.toBeNull();
});

it('keeps the surah chevrons beside the mode pill', () => {
  const result = render(<ReaderHeader {...props} />);
  const row = result.getByTestId('reader-mode-row');
  expect(within(row).queryByTestId('surah-previous')).not.toBeNull();
  expect(within(row).queryByTestId('surah-next')).not.toBeNull();
});

it('hides the three actions until the actions button is pressed', () => {
  // Ruling R4: an inline expanding row, not a sheet -- nothing covers the
  // verses, and the row is part of the same glass surface.
  const result = render(<ReaderHeader {...props} />);
  expect(result.queryByTestId('toggle-translation')).toBeNull();

  fireEvent.click(result.getByTestId('reader-actions'));

  expect(result.queryByTestId('toggle-translation')).not.toBeNull();
  expect(result.queryByTestId('open-language')).not.toBeNull();
  expect(result.queryByTestId('reader-search')).not.toBeNull();
});

it('says what the actions button will do', () => {
  const result = render(<ReaderHeader {...props} />);
  const button = result.getByTestId('reader-actions');
  expect(button.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(button);
  expect(result.getByTestId('reader-actions').getAttribute('aria-expanded')).toBe('true');
});

it('draws the translation switch as the script it is showing', () => {
  // Colour alone is not a state (WCAG 1.4.1): the glyph itself changes.
  const on = render(<ReaderHeader {...props} showTranslation />);
  fireEvent.click(on.getByTestId('reader-actions'));
  expect(on.getByTestId('toggle-translation').querySelector('[data-icon="translationOn"]')).not.toBeNull();

  const off = render(<ReaderHeader {...props} showTranslation={false} />);
  fireEvent.click(off.getByTestId('reader-actions'));
  expect(off.getByTestId('toggle-translation').querySelector('[data-icon="translationOff"]')).not.toBeNull();
});

it('never lets the mode pill settle on the word-by-word door', () => {
  // The reader's 'Words' navigates; it is not a rendering this screen has.
  const result = render(<ReaderHeader {...props} />);
  fireEvent.click(result.getByTestId('segment-wbw'));
  expect(props.onOpenWbw).toHaveBeenCalled();
  expect(result.getByTestId('segment-translation').getAttribute('aria-selected')).toBe('true');
});
```

If `Icon` does not already emit a `data-icon` attribute under the shim, add it in `Icon.tsx` (`<Svg testID={...}>` → the rnHosts shim maps `testID`; prefer a `data-icon` via the existing shim convention, matching how `rnHosts` forwards props). Check `rnHosts.ts` first and follow whatever convention is already there rather than inventing a second one.

- [ ] **Step 3: Run, confirm fail**

Run: `cd apps/mobile && npx vitest run src/components/ReaderHeader.test.tsx`
Expected: FAIL on all six — `reader-actions` does not exist, chevrons are on the title row.

- [ ] **Step 4: Implement the header**

Three rows inside the one `GlassSurface`:

```tsx
  const [actionsOpen, setActionsOpen] = useState(false);

  const options = [
    { value: 'translation', label: t(uiLocale, 'reader.modeTranslation') },
    // A door, not a state: pressing it leaves for /surah/[id]/words. Marked
    // so the wash springs back instead of parking on a segment this screen
    // will never be (see SegmentedControl's `door`).
    { value: 'wbw', label: t(uiLocale, 'reader.modeWbw'), door: true },
  ] as const satisfies readonly { value: ModeChipValue; label: string; door?: boolean }[];
```

Row 1 — back, name, actions:

```tsx
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {/* back Pressable: unchanged */}
          <Animated.Text testID="reader-title" numberOfLines={1} style={[titleStyle, {
            flex: 1, textAlign: 'center', color: theme.text,
            fontFamily: fonts.display, fontSize: typography.title,
          }]}>
            {surahName}
          </Animated.Text>
          <Pressable
            testID="reader-actions"
            accessibilityRole="button"
            accessibilityState={{ expanded: actionsOpen }}
            accessibilityLabel={t(uiLocale, actionsOpen ? 'reader.hideActions' : 'reader.showActions')}
            onPress={() => setActionsOpen((open) => !open)}
            style={{ minHeight: touchTargets.minimum, minWidth: touchTargets.minimum,
                     alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name={actionsOpen ? 'close' : 'menu'} color={theme.text} />
          </Pressable>
        </View>
```

`typography.title` (24), up from `body` (16): the name is the only thing on the row now, and at 16 it reads as a caption rather than as the screen's subject.

If `Icon` has no `close`, add `close: ['M6 6l12 12', 'M18 6L6 18']` in the same commit as the other two glyphs.

Row 2 — chevrons flanking the pill:

```tsx
        <View testID="reader-mode-row" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {onPageSurah ? (
            <AdjacentNavButton side="prev" target={prevSurahId ? String(prevSurahId) : null}
              onNavigate={(target, side) => onPageSurah(Number(target), side)}
              uiLocale={uiLocale} testIDPrefix="surah" />
          ) : null}
          <View style={{ flex: 1 }}>
            <SegmentedControl options={options} value="translation"
              accessibilityLabel={t(uiLocale, 'reader.mode')}
              onChange={(next) => { if (next === 'wbw') onOpenWbw(); }} />
          </View>
          {onPageSurah ? (
            <AdjacentNavButton side="next" target={nextSurahId ? String(nextSurahId) : null}
              onNavigate={(target, side) => onPageSurah(Number(target), side)}
              uiLocale={uiLocale} testIDPrefix="surah" />
          ) : null}
        </View>
```

Row 3 — the curtain. Move the existing `SearchHeaderButton`, translation `Pressable` and language `Pressable` into it verbatim, only swapping the icon names and centring the row:

```tsx
        <Collapsible open={actionsOpen} testID="reader-actions-row">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, paddingTop: 4 }}>
            {onChangeShowTranslation ? (
              <Pressable testID="toggle-translation" /* …existing a11y props… */>
                <Icon name={showTranslation ? 'translationOn' : 'translationOff'}
                  color={showTranslation ? theme.accent : theme.mutedText} />
              </Pressable>
            ) : null}
            <SearchHeaderButton uiLocale={uiLocale} onPress={onOpenSearch} />
            {showTranslation ? (
              <Pressable testID="open-language" /* …existing a11y props… */>
                <Icon name="translate" color={theme.accent} />
              </Pressable>
            ) : null}
          </View>
        </Collapsible>
```

Shrink the pill: in `SegmentedControl`'s `Segment`, `minHeight: touchTargets.compact` (40) → **34**, and the outer `GlassSurface` `padding: 4` → **3**. Row height 48 → 40. The 48dp guideline measures the *row*, and row 2 now sits inside the header's own 10pt vertical padding, which carries the reachable target past 48. Note this in the code comment that already explains the compact choice — do not silently contradict it.

- [ ] **Step 5: Locale keys**

Add `'reader.showActions'` and `'reader.hideActions'` to the `UiStringKey` union **written out as literals**, and the English / Uzbek / Russian values:

| key | en | uz | ru |
|---|---|---|---|
| `reader.showActions` | `More actions` | `Boshqa amallar` | `Другие действия` |
| `reader.hideActions` | `Hide actions` | `Amallarni yashirish` | `Скрыть действия` |

- [ ] **Step 6: Run every suite**

```bash
cd apps/mobile && npx tsc --noEmit && npx eslint src --max-warnings=0 && npx vitest run
```
Expected: type-check exit 0, lint exit 0, all suites green. `uiStrings.test.ts`'s dead-key check must stay green — if it fails, a key was assembled at runtime somewhere.

- [ ] **Step 7: Mutation-check**

Three mutants, restored by re-editing each time:
1. Drop `door: true` from the `wbw` option → the door test FAILS.
2. Render row 3 unconditionally instead of inside `Collapsible` → the "hides the three actions" test FAILS.
3. Make `translationOff` draw the same paths as `translationOn` → the glyph test FAILS.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/components/ReaderHeader.tsx apps/mobile/src/components/ReaderHeader.test.tsx \
        apps/mobile/src/components/icons/Icon.tsx apps/mobile/src/components/icons/Icon.test.tsx \
        apps/mobile/src/components/SegmentedControl.tsx apps/mobile/src/i18n/uiStrings.ts
git commit -m "fix(mobile/reader): give the surah name a row instead of 34 points"
```

---

### Task 4: Morphology header mirrors the reader

**Files:**
- Modify: `apps/mobile/src/screens/WbwScreen.tsx`
- Test: `apps/mobile/src/screens/WbwScreen.test.tsx` (or the existing WBW suite — locate it first)

**Interfaces:**
- Consumes: nothing new. `AdjacentNavButton` and `SegmentedControl` as they already are.
- Produces: nothing. Internal layout only.

Row 1 becomes name + verse picker (the back affordance is the Stack's, drawn above this view). Row 2 becomes `‹` + Dense/Verse pill + `›`.

- [ ] **Step 1: Write the failing test**

```tsx
it('keeps the surah name off the pager row', () => {
  // 'Al-Baq...' on the device: four controls flanking the name left it nothing
  // (owner screenshot, 2026-09-11). Surah paging moves to the density row;
  // the verse picker stays beside the name, which is what it pages within.
  const result = render(<WbwScreen {...props} />);
  const row = result.getByTestId('wbw-title-row');
  expect(within(row).queryByTestId('surah-previous')).toBeNull();
  expect(within(row).queryByTestId('surah-next')).toBeNull();
  expect(within(row).queryByTestId('verse-picker')).not.toBeNull();

  const density = result.getByTestId('wbw-density-row');
  expect(within(density).queryByTestId('surah-previous')).not.toBeNull();
  expect(within(density).queryByTestId('surah-next')).not.toBeNull();
});
```

Read `VersePicker` first to find its real `testID`; use that, do not invent one.

- [ ] **Step 2: Run, confirm fail.**

Run: `cd apps/mobile && npx vitest run src/screens/WbwScreen.test.tsx`

- [ ] **Step 3: Implement**

```tsx
          <View testID="wbw-title-row" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text accessibilityRole="header" numberOfLines={1}
              style={{ color: theme.text, fontSize: typography.title, fontWeight: '700', flex: 1 }}>
              {view.surah.name_translit}
            </Text>
            <VersePicker from={view.from} to={view.to} ayahCount={view.surah.ayah_count}
              uiLocale={uiLocale} onRange={(nextFrom) => setFrom(nextFrom)} />
          </View>
          <View testID="wbw-density-row" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AdjacentNavButton side="prev"
              target={currentSurahId !== null && currentSurahId > 1 ? String(currentSurahId - 1) : null}
              onNavigate={(target, side) => setSurah(Number(target), side)}
              uiLocale={uiLocale} testIDPrefix="surah" />
            <View style={{ flex: 1 }}>
              <SegmentedControl
                options={DENSITY_OPTIONS.map((option) => ({ value: option.value, label: t(uiLocale, option.labelKey) }))}
                value={wbwDensity} onChange={setWbwDensity}
                accessibilityLabel={t(uiLocale, 'wbw.density')} />
            </View>
            <AdjacentNavButton side="next"
              target={currentSurahId !== null && currentSurahId < 114 ? String(currentSurahId + 1) : null}
              onNavigate={(target, side) => setSurah(Number(target), side)}
              uiLocale={uiLocale} testIDPrefix="surah" />
          </View>
```

`flex: 1` on the name, not `flexShrink: 1`: it now has a row to fill, and shrink-only leaves it hugging its text with the picker floating at the far edge.

Rewrite the block comment above this row. It currently argues "Name and pager share one row on purpose… stacked as separate rows they ate roughly a third of the screen". That argument no longer holds and must not be left standing — replace it with R5 and the reason (a clamped name is worse than 40 more points of chrome), keeping the D49 nesting note, which still applies.

- [ ] **Step 4: Run, confirm pass.** Then `npx tsc --noEmit && npx eslint src --max-warnings=0`.

- [ ] **Step 5: Mutation-check** — move `AdjacentNavButton side="prev"` back onto the title row; the test must FAIL. Restore by re-editing.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/WbwScreen.tsx apps/mobile/src/screens/WbwScreen.test.tsx
git commit -m "fix(mobile/wbw): stop wrapping the surah name between four controls"
```

---

### Task 5: Juz children live inside the juz card

**Files:**
- Modify: `apps/mobile/src/components/BrowseList.tsx`
- Modify: `apps/mobile/src/screens/SurahsScreen.tsx`
- Test: `apps/mobile/src/components/BrowseList.test.tsx`, `apps/mobile/src/screens/SurahsTab.test.tsx`

**Interfaces:**
- Consumes: `Collapsible` (T2).
- Produces: `BrowseItem` loses `indent?: boolean`, gains `children?: BrowseItem[]`. A `children` row renders them inside its own `GlassSurface`, hairline-separated, no medallion, no card. `indent` has exactly one call site and dies with it.

- [ ] **Step 1: Write the failing tests**

```tsx
it('draws an expanded juz as one card, not as four', () => {
  // Ruling R6: the children looked exactly like juz cards, so an expanded
  // juz read as four juz (owner screenshot, 2026-09-11).
  const items = [{ ...juz(1), expanded: true, children: [child('Al-Fatiha 1-7'), child('Al-Baqara 1-141')] }];
  const result = render(<BrowseList items={items} />);
  const card = result.getByTestId('browse-juz-1');
  expect(within(card).getByText('Al-Fatiha 1-7')).not.toBeNull();
  expect(result.container.querySelectorAll('[data-rn-glass]')).toHaveLength(1);
});

it('keeps a collapsed juz childless', () => {
  const items = [{ ...juz(1), expanded: false, children: [child('Al-Fatiha 1-7')] }];
  const result = render(<BrowseList items={items} />);
  expect(result.queryByText('Al-Fatiha 1-7')).toBeNull();
});

it('turns the chevron as the curtain unrolls', () => {
  // One motion, not two: the chevron rotating in step is what says the card
  // itself opened rather than that new rows arrived beneath it.
  const shut = render(<BrowseList items={[{ ...juz(1), expanded: false, children: [child('x')] }]} />);
  const open = render(<BrowseList items={[{ ...juz(1), expanded: true, children: [child('x')] }]} />);
  expect(rotationOf(shut.getByTestId('browse-chevron-juz-1'))).toBe(0);
  expect(rotationOf(open.getByTestId('browse-chevron-juz-1'))).toBe(90);
});
```

`data-rn-glass` and `rotationOf` must match what `rnHosts.ts` actually emits — read it first and follow the existing convention. If `GlassSurface` carries no such marker under the shim, add one there rather than asserting on class names (and remember `rn-testing-shim-blind-to-shadows`: a style prop React drops onto `node.style` asserts nothing).

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement in `BrowseList.tsx`**

Delete `indent` from `BrowseItem` and delete the `item.indent ? <View width 34 /> :` branch in `Row`. Add:

```ts
  /** Rows that belong to this one, drawn inside its own card while
   *  `expanded`. Not siblings in the list: a child card looks exactly like a
   *  juz card, so an expanded juz read as four juz (ruling R6). */
  children?: BrowseItem[];
```

In `Row`, move the chevron to a rotating `Animated.View`, and hang the curtain off the bottom of the same `GlassSurface`:

```tsx
  const spin = useSharedValue(item.expanded ? 90 : 0);
  useEffect(() => {
    if (item.expanded === undefined) return;
    const target = item.expanded ? 90 : 0;
    spin.value = reduceMotion ? target : withTiming(target, { duration: 220 });
  }, [item.expanded, reduceMotion, spin]);
```

The card becomes a column: the pressable header row as it is today, then

```tsx
        {item.children ? (
          <Collapsible open={item.expanded === true}>
            {item.children.map((child, index) => (
              <View key={child.key}>
                {index === 0 ? null : <View style={{ height: 1, marginLeft: 48, backgroundColor: theme.border }} />}
                <Pressable
                  testID={child.testID}
                  accessibilityRole="button"
                  accessibilityLabel={child.accessibilityLabel}
                  onPress={child.onPress}
                  style={{ minHeight: touchTargets.minimum, justifyContent: 'center', paddingLeft: 48, paddingRight: 16 }}
                >
                  <Text numberOfLines={1} style={{ color: theme.text, fontSize: typography.body }}>{child.title}</Text>
                </Pressable>
              </View>
            ))}
          </Collapsible>
        ) : null}
```

The separator is inset to 48 — the child text's own left edge — so it reads as a rule between two rows of one card rather than as the card's own edge (same rule the word sheet's group divider follows).

Only the header row is a `Pressable`; the card's `GlassSurface` moves outside it so a child press is not swallowed by the parent's disclosure toggle. Verify this on the device — nested pressables on Android are exactly where `swipe-begins-as-a-press-on-content` bit us.

- [ ] **Step 4: Implement in `SurahsScreen.tsx`**

Replace the flattening loop: build each juz's children into `children` instead of pushing them as sibling rows. Drop `leading: ''` and `indent: true` — neither exists any more.

```tsx
      rows.push({
        key: `juz-${entry.juz}`,
        testID: `browse-juz-${entry.juz}`,
        leading: String(entry.juz),
        title: `${t(uiLocale, 'browse.juzLabel')} ${entry.juz}`,
        subtitle: `${entry.ayahCount} ${t(uiLocale, 'surahList.ayahsSuffix')}`,
        accessibilityLabel: `${t(uiLocale, 'browse.juzLabel')} ${entry.juz}, ${entry.ayahCount} ${t(uiLocale, 'surahList.ayahsSuffix')}`,
        expanded,
        onPress: () => setOpenJuz(/* unchanged */),
        children: entry.ranges.map((range) => ({
          key: `juz-${entry.juz}-surah-${range.surahId}`,
          testID: `browse-juz-${entry.juz}-surah-${range.surahId}`,
          leading: '',
          title: `${range.surahName} ${range.firstAyahNumber}–${range.lastAyahNumber}`,
          accessibilityLabel: `${range.surahName}, ${t(uiLocale, 'wbw.rangeLabel')} ${range.firstAyahNumber}–${range.lastAyahNumber}`,
          onPress: () => openAyah(range.surahId, range.firstAyahNumber),
        })),
      });
```

**Always build `children`, never only when `expanded`** — `Collapsible` needs them present to measure, and gating them here would make every open a jump from 0 to 0.

- [ ] **Step 5: Run everything**

```bash
cd apps/mobile && npx tsc --noEmit && npx eslint src --max-warnings=0 && npx vitest run
```

Type-check is the real gate here: deleting `indent` must produce exactly zero errors, which proves the one call site was the only one.

- [ ] **Step 6: Mutation-check**

1. Render `item.children` outside `Collapsible` → the collapsed test FAILS.
2. Make the chevron's `target` always `0` → the rotation test FAILS.
3. Wrap the whole card in the header `Pressable` again → no test catches it. **That is a real gap**: add an assertion that a child press calls the child's `onPress` and not the parent's, then re-run the mutant and confirm it fails.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/components/BrowseList.tsx apps/mobile/src/components/BrowseList.test.tsx \
        apps/mobile/src/screens/SurahsScreen.tsx apps/mobile/src/screens/SurahsTab.test.tsx
git commit -m "feat(mobile/browse): an expanded juz is one card, and it unrolls"
```

---

### Task 6: Mushaf band numerals +12%

**Files:**
- Modify: `packages/config/ornaments/surahBand.ts`
- Test: `packages/config/ornaments/surahBand.test.ts` (locate it; if absent, assert through `apps/mobile/src/components/mushaf/SurahBand.test.tsx`)

**Interfaces:**
- Consumes: nothing.
- Produces: `SURAH_BAND_NUMERAL_SIZE` values change. Both apps read it; the web reader draws no band today, so mobile is the only visible consumer — **verify that** with a grep before committing rather than assuming it.

- [ ] **Step 1: Change the four fractions**

```ts
export const SURAH_BAND_NUMERAL_SIZE = {
  westernShort: 0.1832,
  westernLong: 0.1665,
  easternShort: 0.2775,
  easternLong: 0.2554,
} as const;
```

All four ×1.12, rounded to four places (owner ruling R8, 2026-09-11: the numerals read small inside their medallions). The long variants scale by the same ratio so a 3-digit surah keeps its existing proportion to a 2-digit one — scaling only the short pair would make 114 smaller *relative to* 2 for the first time.

Extend the existing comment above the block with the ruling and the ratio, so the next reader knows these are a measured set × a deliberate factor rather than four fresh measurements.

- [ ] **Step 2: Update whatever asserts them**

Run `cd packages/config && npx vitest run` and `cd apps/mobile && npx vitest run src/components/mushaf/` first to see what breaks, then update the expected numbers. Do **not** relax an exact assertion into a range to make it pass.

- [ ] **Step 3: Mutation-check**

Revert one of the four values to its old number; a test must FAIL. If none does, the constants are unasserted — add one assertion pinning all four before moving on. Restore by re-editing.

- [ ] **Step 4: Commit**

```bash
git add packages/config/ornaments/surahBand.ts packages/config/ornaments/surahBand.test.ts
git commit -m "style(config): the mushaf band's numerals sit small in their medallions"
```

---

### Task 7: surah-name-color-v4 spike (read-only)

Ruling R10: probe and report. **No UI change ships from this task.**

**Files:**
- Modify: this plan file only (append the report).
- Download to: `$CLAUDE_JOB_DIR/tmp/` — **not** into `assets/`, and **not** committed. `temp-dir-and-ornament-provenance` cost us a 98MB history purge; nothing downloaded lands in git this phase.

- [ ] **Step 1: Fetch**

Source: `https://quranfonts.com/font/surah-name-color-v4/`. Save the font and any licence file beside it.

- [ ] **Step 2: Which colour technology?**

```bash
python3 -c "
from fontTools.ttLib import TTFont
f = TTFont('<file>')
print(sorted(f.keys()))
for t in ('COLR','CPAL','SVG ','sbix','CBDT'): print(t, t in f)
"
```

- **COLR/CPAL** → Android renders it. Proceed to step 3.
- **`SVG `** → Android's Skia does **not** render the OpenType SVG table. It will fall back silently to monochrome or tofu — the same failure class as `woff2-loadasync-fails-silently-rn`. Record it and stop; the answer is no.
- **sbix / CBDT** → bitmap colour. Record the bitmap sizes; it will not scale to a mushaf band.

- [ ] **Step 3: Does it cover all 114?**

```bash
python3 -c "
from fontTools.ttLib import TTFont
cmap = TTFont('<file>').getBestCmap()
missing = [i for i in range(1,115) if (0xE000+i) not in cmap]
print('missing', missing)
"
```

v2 is missing 102 (`needsSurahNameFallback`). Report whether colour-v4 is missing anything — a different gap means a different fallback predicate, not the same one.

- [ ] **Step 4: Licence (§11)**

Record the exact licence text or the site's stated terms, and whether attribution is required. We currently credit quranfonts.com anyway.

- [ ] **Step 5: The theming question**

A colour font's palette is baked into CPAL; `color:` does not reach it. State plainly, in the report, what the palette looks like against **both** themes — our dark ground is near-black and a palette drawn for white paper may be illegible, with no lever on our side. If CPAL carries more than one palette, say how many, because choosing a palette index is the only control we would have.

- [ ] **Step 6: Device check, only if steps 2-5 all pass**

Register it alongside `SurahNameV2` and render one surah name in both themes. **Coordinate with the owner first** — the phone under adb is also this session's display and is never driven unattended. A pixel diff against the mono glyph is the only proof it registered (`woff2-loadasync-fails-silently-rn`).

- [ ] **Step 7: Append the report to this file**

Under a `## Task 7 spike report` heading: tables present, coverage gaps, licence, palette count, both-theme verdict, and a one-line recommendation. Then stop and hand it to the owner.

- [ ] **Step 8: Commit**

```bash
git add docs/plans/phase-m7e-header-and-browse-polish.md
git commit -m "docs(plans): record what surah-name-color-v4 actually is"
```

---

## Task 7 spike report — `surah-name-color-v4` (2026-09-11)

Read-only probe, per ruling R10. **Nothing shipped, nothing committed but this
report.** The file was fetched to `$CLAUDE_JOB_DIR/tmp/` and never entered
`assets/` or git (`temp-dir-and-ornament-provenance`).

**What it actually is:** `QCF_SurahHeader_COLOR-Regular.ttf`, 386 KB, 124
glyphs, from `https://quranfonts.com/fonts/Surah%20header%20font/`. The page's
own download button serves this; there is no separate "color v4" artefact.

### Tables

| table | present | meaning |
|---|---|---|
| `COLR` (v0) | **yes** | Android's Skia renders COLRv0. Not the blocker. |
| `CPAL` (v0) | yes | 6 palettes x 20 entries |
| `SVG ` | no | the failure mode we feared is absent |
| `sbix` / `CBDT` | no | not bitmap colour — it scales |

120 of the 124 glyphs carry colour layers; each surah glyph is composed of ~7
layers, the name plus shared frame parts (`glyph00118`-`glyph00123`).

### Coverage — 114/114, but **not** at our codepoints

It carries **no PUA at all**. Where `SurahNameV2`/`V4` map `0xE000 + surahId`,
this font maps 114 glyphs onto Arabic Presentation Forms A, `U+FB51`-`U+FC64`,
non-contiguously. The site claims "same V4 codes"; that is false against the
`SurahNameV4.ttf` we already ship, which is PUA.

The order is not surah order either. Rendered and compared glyph-by-glyph
against our V4 at eight points (indices 0, 1, 7, 49, 60, 92, 93, 113 — all
eight matched), the mapping over the 114 sorted non-control codepoints is:

```
surah = ((21 + index) % 114) + 1        # index 0 = U+FB51 = surah 22 (Al-Hajj)
```

So it starts at Al-Hajj and wraps. Derivable, and `needsSurahNameFallback`
would not apply — this font has no 102 gap. But it is a mapping we reverse-
engineered from renders, not one the publisher documents.

### Licence (§11) — **unclear, and that is a stop on its own**

- `name` ID 0: `King Fahad Complex, All rights reserved.`
- `name` ID 7: `All rights reserved`
- The site's only statement: *"All fonts belong to their respective creators."*
  It calls itself a Sadaqah Jariyah project and the download "free", but grants
  no licence and names no terms.

"All rights reserved" with no accompanying grant is not a licence we can ship
against. Our existing V2/V4 came through the same channel, so this is a
question about the whole family, not only the colour build — worth settling
once, separately.

### Theming — the decisive finding

CPAL carries **6 palettes**, and they are clearly authored as a light/dark set:

| palette | entry 0 (the name's ink) | reads as |
|---|---|---|
| 0 (default) | `#000000` | for white paper |
| 1 | `#FFFFFF` | for a dark ground |
| 2 | `#000000` | paper, warm frame (`#FBE7D2`) |
| 3 | `#000000` | near-mono, paper |
| 4 | `#FFFFFF` | near-mono, dark |
| 5 | `#000000` | near-mono, paper |

A COLR glyph takes its colours from CPAL, not from `color:` — so our theme
tokens do not reach it. **A palette index is the only control that would
exist, and React Native does not expose one.** `font-palette` is a CSS
feature; Android's `Typeface` has no palette selector, and neither does
`expo-font` or RN's text style. We would get palette 0 on both themes: black
ink on our near-black dark ground.

That is the answer. The font is technically sound, covers all 114, and even
ships the dark palette we would want — and we have no way to ask for it.

### Recommendation

**No**, not this phase, on two independent grounds: no palette control from RN
(so dark mode is unreadable), and no licence grant. Step 6's device check was
not run — it is gated on steps 2-5 passing, and step 5 fails.

If the surah list wants colour later, the cheap path is not this font: take our
existing monochrome V4 glyph and tint it ourselves, which keeps the theme
tokens in charge. That is a UI decision, not a font one, and it needs no new
asset.


## Acceptance criteria

- [ ] `npx tsc --noEmit` exit 0 across the workspace.
- [ ] `npx eslint src --max-warnings=0` exit 0 in `apps/mobile`.
- [ ] `npx vitest run` green in `apps/mobile` and `packages/config`; total test count ≥ 1058 + the new tests.
- [ ] Every mutant named above killed by a named test. A mutant no test catches is a gap to close, not a mutant to skip (§4 step 4; `sdd-brief-can-specify-vacuous-tests`).
- [ ] No `// @ts-ignore`, no disabled lint rule without an inline justification.
- [ ] `git grep -n "translationText\|item.indent\|indent:" apps/mobile/src` returns nothing.
- [ ] No new dependency in any `package.json`.
- [ ] Nothing under `assets/` added or modified (T7 is read-only).

## Device checks (§10 — the mobile gate)

An APK run is required before this phase is complete. New rows, continuing M7d's numbering:

| # | Check |
|---|---|
| 300 | Reader: the surah name is fully legible on Al-Munafiqoon (surah 63) and Al-Baqara — no ellipsis. |
| 301 | Reader: `⋮` unrolls three actions; `✕` rolls them back; nothing covers the first verse. |
| 302 | Reader: row 1 at the top of a surah, before the name fades in, does not read as empty chrome. |
| 303 | Reader: translation on/off — the glyph changes, not only its colour. |
| 304 | Reader: switch to Words, press back. **The pill is on Translation.** |
| 305 | Reader: surah `‹ ›` beside the pill still page the surah, and are dead at 1 and 114. |
| 306 | Mode pill at 34 is still comfortably tappable one-handed. |
| 307 | Morphology: name legible on Al-Munafiqoon; verse picker and surah chevrons both reachable. |
| 308 | Juz: expand juz 1 — one card, children inset, chevron rotates, curtain unrolls. |
| 309 | Juz: tap a child — it opens that ayah and does **not** collapse the juz. |
| 310 | Juz: expand several, scroll fast. No row recycles mid-animation, no flicker. |
| 311 | Mushaf: band numerals on surah 2 and surah 114 — bigger, still inside their medallions. |
| 312 | Reduced motion on: curtain and chevron snap, nothing animates, nothing is stuck shut. |
| 313 | TalkBack: `⋮` announces expanded/collapsed; a juz announces expanded; every action has a name. |
| 314 | Carried from `d2d702d`: mushaf page 1 and 604 do not rubber-band. Unverified on glass. |

Record results in this file's verification log. "Implementation complete, verification pending" is an unmet exit criterion (§10).

## Risks & rollbacks

| Risk | Mitigation | Rollback |
|---|---|---|
| Colour font is SVG-table → silent monochrome/tofu | T7 step 2 catches it before any asset ships | nothing to roll back; T7 writes only this file |
| Curtain height animation fights FlatList row recycling | `BrowseList`'s FlatList sets no `getItemLayout`, so variable heights are already supported; check 310 exercises it | revert T5's commit; the flat-row rendering is one commit behind |
| Nested pressable swallows the child tap | Header row is the only `Pressable`; mutant 3 in T5 asserts it; check 309 confirms on glass | revert T5 |
| Pill at 34 under the 48dp guideline | Row sits inside the header's 10pt padding; check 306 judges it on the device | one constant back to `touchTargets.compact` |
| `⋮` costs a tap on the translation toggle (owner chose this knowingly, R1) | check 303 + 301 judge it in use | promote the toggle back to row 1; one block moves |
| Title fade leaves row 1 looking bare | check 302 | drop `titleStyle`, show the name always — one prop |

## Out of scope

- The surah list's calligraphic glyph. Blocked on T7's report by ruling R10.
- Anything in `apps/web`.
- The M6 baseline device run, still owed and still blocked on the owner's wireless-debugging `IP:port`.
- `STATUS.md`, which is written at merge, not inside an open PR (`ledger-prose-feeds-review-rounds`).
