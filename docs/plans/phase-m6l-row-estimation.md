# Phase M6l — Row Estimation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the reader's FlatList a `getItemLayout`, so a deep-link landing is
a bounded two-step jump instead of up to 25 blind retries behind a hidden list.

**Architecture:** A pure height model, fitted on device measurements, drives
`getItemLayout`. The model is an *estimate* and is never trusted to land the
scroll — after the jump, the target row's own measured offset corrects it, in a
loop capped at 3. `initialNumToRender` stops being widened to cover the target,
because FlatList no longer needs to measure what it skips.

**Tech Stack:** React Native FlatList (`getItemLayout`, `scrollToOffset`,
CellRendererComponent), TypeScript, Jest + rnHosts.

**Spec:** `apps/mobile/scripts/ROW-HEIGHT-SPIKE.md` — the device run of
2026-09-06 (2451 rows, OnePlus GM1917 at 360x780dp), its fitted coefficients,
and the verdict that rules out a model-only landing. Every constant below is
copied from its Results section.

## Global Constraints

- **The model never lands the scroll.** Worst measured cumulative drift is
  512dp (translation, size 42, Al-Baqara). A model-only landing is out; the
  correction pass is not optional polish.
- **No new dependency.** FlashList is a §12 question that was asked and not
  taken. This phase is FlatList only.
- **No schema change and no new query.** `text_uthmani` and `translation.text`
  are already on `ReaderAyah` in memory; character counts come from what the
  screen already holds.
- **`onViewableItemsChanged` must not write during a jump.** `positionedRef`
  stays false for every intermediate scroll. Writing ayahs the reader never saw
  into the saved reading position is the exact defect the abandoned
  `averageItemLength` recovery shipped (16:90 landed on 16:49, 2026-08-23).
- **Reduced motion is respected** and the list still must not be seen scrolling
  to its landing: the `opacity: positioned || arriving ? 1 : 0` gate stays.
- Arabic reader sizes are 22 / 28 / 35 / 42 (`typography.arabicReader = 28` x
  `arabicScales`). All four ship; none may be left without a model.
- `apps/mobile` has no emulator in CI (§10): the device checklist in Task 5 is
  this phase's gate, and its results go in the verification log below.

---

## File Structure

- `src/components/rowHeightModel.ts` — **new.** Pure. Takes mode, Arabic size,
  list width, and the two character counts; returns a height in dp. No React,
  no imports from the reader. This is the only place a coefficient appears.
- `src/components/rowHeightModel.test.ts` — **new.** Unit tests, including the
  measured-row regression fixture.
- `src/components/SurahReader.tsx` — **modify.** Add `getItemLayout`, replace
  the attempt loop, stop widening `initialNumToRender`, capture the target
  row's measured offset.
- `src/components/SurahReader.test.tsx` — **modify.** Landing behaviour.
- `src/components/rowHeightFixture.ts` — **new.** ~60 measured rows sampled from
  `dump.txt`, so the model's error bound is asserted in CI against real device
  numbers rather than against itself. A `.ts` module rather than JSON: the base
  tsconfig sets neither `resolveJsonModule` nor an `include` that reaches
  `scripts/`, and a typed export costs nothing next to changing both.

---

## Task 1: The height model

**Files:**
- Create: `apps/mobile/src/components/rowHeightModel.ts`
- Create: `apps/mobile/src/components/rowHeightModel.test.ts`
- Create: `apps/mobile/src/components/rowHeightFixture.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `estimateRowHeight(input: RowHeightInput): number` where
  `RowHeightInput = { mode: 'mushaf' | 'translation'; arabicSize: number;
  listWidth: number; arabicChars: number; translationChars: number }`.

- [ ] **Step 1: Build the fixture from the spike log**

```bash
cd apps/mobile
python3 - <<'PY'
import json, re, sqlite3, random
db = sqlite3.connect('/home/claude/quran-data/quran.db')
ar = {(s, a): len(t or '') for s, a, t in db.execute(
    "select su.id, ay.ayah_number, ay.text_uthmani from ayahs ay "
    "join surahs su on su.id = ay.surah_id")}
en = {(s, a): len(t or '') for s, a, t in db.execute(
    "select su.id, ay.ayah_number, tr.text from translations tr "
    "join ayahs ay on ay.id = tr.ayah_id join surahs su on su.id = ay.surah_id "
    "where tr.language_code = 'en'")}
pat = re.compile(r'RHSPIKE (\w+) (\d+) (\d+):(\d+) (\d+) w(\d+)')
last = {}
for line in open('scripts/dump.txt'):
    m = pat.search(line)
    if m:
        last[(m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4)))] = (
            int(m.group(5)), int(m.group(6)))
rows = [{'mode': k[0], 'arabicSize': k[1], 'listWidth': w, 'surah': k[2],
         'ayah': k[3], 'arabicChars': ar[(k[2], k[3])],
         'translationChars': en.get((k[2], k[3]), 0), 'height': h}
        for k, (h, w) in sorted(last.items()) if (k[2], k[3]) in ar]
random.seed(6)  # fixed: the fixture must not change between runs
sample = []
for mode in ('mushaf', 'translation'):
    for size in (22, 28, 35, 42):
        group = [r for r in rows if r['mode'] == mode and r['arabicSize'] == size]
        group.sort(key=lambda r: r['arabicChars'])
        # Ends plus a spread through the middle: the tails are where a linear
        # model is worst, and an average-length-only fixture would hide that.
        idx = sorted({0, len(group) - 1, *random.sample(range(len(group)), 6)})
        sample += [group[i] for i in idx]
with open('src/components/rowHeightFixture.ts', 'w') as out:
    out.write(
        '// Generated from the 2026-09-06 device run -- see\n'
        '// scripts/ROW-HEIGHT-SPIKE.md. Do not hand-edit; regenerate.\n'
        'export interface MeasuredRow {\n'
        "  mode: 'mushaf' | 'translation';\n"
        '  arabicSize: number;\n  listWidth: number;\n  surah: number;\n'
        '  ayah: number;\n  arabicChars: number;\n  translationChars: number;\n'
        '  height: number;\n}\n\n'
        'export const measuredRows: MeasuredRow[] = '
        + json.dumps(sample, indent=2) + ';\n')
print(len(sample), 'rows')
PY
```

Expected: `64 rows`.

- [ ] **Step 2: Write the failing tests**

```ts
// apps/mobile/src/components/rowHeightModel.test.ts
import { measuredRows } from './rowHeightFixture';
import { estimateRowHeight, type RowHeightInput } from './rowHeightModel';

// The reference width each coefficient was fitted at (ROW-HEIGHT-SPIKE.md).
const MUSHAF_W = 334;
const TRANSLATION_W = 360;

describe('estimateRowHeight', () => {
  it('matches the measured device rows within the spike error bound', () => {
    const errors = measuredRows.map((row) => estimateRowHeight(row) - row.height);
    const rms = Math.sqrt(
      errors.reduce((sum, e) => sum + e * e, 0) / errors.length,
    );
    // Worst per-group rms in the spike was 30.0dp (translation, size 42).
    expect(rms).toBeLessThan(35);
  });

  it('never returns a height below the empty-card chrome', () => {
    expect(
      estimateRowHeight({
        mode: 'mushaf', arabicSize: 22, listWidth: MUSHAF_W,
        arabicChars: 0, translationChars: 0,
      }),
    ).toBeGreaterThanOrEqual(80);
  });

  it('grows with Arabic length, size, and translation length', () => {
    const base: RowHeightInput = {
      mode: 'translation', arabicSize: 28, listWidth: TRANSLATION_W,
      arabicChars: 100, translationChars: 100,
    };
    expect(estimateRowHeight({ ...base, arabicChars: 400 })).toBeGreaterThan(
      estimateRowHeight(base),
    );
    expect(estimateRowHeight({ ...base, arabicSize: 42 })).toBeGreaterThan(
      estimateRowHeight(base),
    );
    expect(estimateRowHeight({ ...base, translationChars: 400 })).toBeGreaterThan(
      estimateRowHeight(base),
    );
  });

  it('scales the Arabic term with size squared', () => {
    const at = (arabicSize: number) =>
      estimateRowHeight({
        mode: 'mushaf', arabicSize, listWidth: MUSHAF_W,
        arabicChars: 500, translationChars: 0,
      });
    // b goes as size^2 (spike: b/size^2 constant within +-5% across 8 groups),
    // so doubling the size roughly quadruples the text term.
    const chrome = estimateRowHeight({
      mode: 'mushaf', arabicSize: 21, listWidth: MUSHAF_W,
      arabicChars: 0, translationChars: 0,
    });
    expect((at(42) - chrome) / (at(21) - chrome)).toBeCloseTo(4, 0);
  });

  it('ignores translation length in mushaf mode', () => {
    const base: RowHeightInput = {
      mode: 'mushaf', arabicSize: 28, listWidth: MUSHAF_W,
      arabicChars: 200, translationChars: 0,
    };
    expect(estimateRowHeight({ ...base, translationChars: 900 })).toBe(
      estimateRowHeight(base),
    );
  });

  it('shrinks the text term as the list gets wider', () => {
    const at = (listWidth: number) =>
      estimateRowHeight({
        mode: 'mushaf', arabicSize: 28, listWidth,
        arabicChars: 500, translationChars: 0,
      });
    expect(at(600)).toBeLessThan(at(334));
  });

  it('is finite and positive for degenerate input', () => {
    // listWidth is 0 on the first commit, before the list has laid out.
    const h = estimateRowHeight({
      mode: 'translation', arabicSize: 28, listWidth: 0,
      arabicChars: 1213, translationChars: 1334,
    });
    expect(Number.isFinite(h)).toBe(true);
    expect(h).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run and watch them fail**

Run: `cd apps/mobile && npx jest src/components/rowHeightModel.test.ts`
Expected: FAIL — `Cannot find module './rowHeightModel'`.

- [ ] **Step 4: Write the model**

```ts
// apps/mobile/src/components/rowHeightModel.ts
import type { ReaderMode } from '@/settings/settingsStore';

export interface RowHeightInput {
  mode: ReaderMode;
  /** The reader's Arabic font size in dp -- useArabicSizes().reader. */
  arabicSize: number;
  /** The FlatList's own width. 0 before it has laid out. */
  listWidth: number;
  arabicChars: number;
  /** 0 in mushaf mode, where no translation is drawn. */
  translationChars: number;
}

// Every number here is fitted from the device run of 2026-09-06 -- see
// apps/mobile/scripts/ROW-HEIGHT-SPIKE.md, section 2. The plain linear form is
// used rather than a line-count form (`a + b * ceil(chars / cpl)`) because it
// scored the same or better on every group while staying interpretable: the
// line-count fits were degenerate, putting cpl at 58 in one group and 10 in the
// next for indistinguishable error.
//
// The card's fixed furniture. Barely moves with Arabic size in the
// measurements (92..101dp mushaf, 169..174dp translation), so it is a constant
// and the residual rides in the text term.
const CHROME_DP: Record<ReaderMode, number> = { mushaf: 94, translation: 170 };

// dp per Arabic character, at ARABIC_REFERENCE_WIDTH. Scales with size^2:
// line height grows with the size while characters per line fall as 1/size, so
// the per-character area goes as the square. Measured b/size^2 sits between
// 1.058e-3 and 1.108e-3 across all eight (mode, size) groups.
const ARABIC_DP_PER_CHAR_PER_SQ_DP = 0.00108;

// dp per translation character. Independent of the Arabic size (measured
// 0.70..0.78 across all four), because the English block never scales with it.
const TRANSLATION_DP_PER_CHAR = 0.72;

// The widths the coefficients were fitted at: the mushaf plate is inset, the
// translation card is not.
const REFERENCE_WIDTH: Record<ReaderMode, number> = { mushaf: 334, translation: 360 };

/**
 * An estimate of one ayah row's height, for `getItemLayout`.
 *
 * Deliberately an estimate. Worst cumulative drift over Al-Baqara was 512dp,
 * so the caller must correct against a real measurement before it reveals the
 * list -- see the landing loop in SurahReader.tsx. What this buys is a
 * FlatList that can jump to any index without first rendering everything above
 * it, which is what the old `initialNumToRender = initialIndex + 1` was for.
 */
export function estimateRowHeight({
  mode,
  arabicSize,
  listWidth,
  arabicChars,
  translationChars,
}: RowHeightInput): number {
  const reference = REFERENCE_WIDTH[mode];
  // Characters per line scale with the width, so dp per character scales with
  // its inverse. Only two widths were measured and they are confounded with
  // mode, so this half of the law is unverified -- the correction pass is what
  // makes that safe. Guarded because listWidth is 0 on the first commit.
  const widthFactor = listWidth > 0 ? reference / listWidth : 1;

  const arabic =
    ARABIC_DP_PER_CHAR_PER_SQ_DP * arabicSize * arabicSize * arabicChars * widthFactor;
  const translation =
    mode === 'translation' ? TRANSLATION_DP_PER_CHAR * translationChars * widthFactor : 0;

  return CHROME_DP[mode] + arabic + translation;
}
```

- [ ] **Step 5: Run the tests**

Run: `cd apps/mobile && npx jest src/components/rowHeightModel.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Mutation-check the model (§4.4)**

Delete the `* arabicSize * arabicSize` factor and re-run. Expected: the fixture
rms test FAILS. Restore by re-editing — never `git checkout` a mutation edit.
Then flip `widthFactor` to `listWidth / reference` and re-run: the width test
FAILS. Restore the same way. A fixture that passes both ways asserts nothing,
which has slipped through twice (PRs #71, #73).

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/components/rowHeightModel.ts \
        apps/mobile/src/components/rowHeightModel.test.ts \
        apps/mobile/src/components/rowHeightFixture.ts
git commit -m "feat(mobile/reader): a fitted row-height model for getItemLayout"
```

---

## Task 2: Give the list `getItemLayout`

**Files:**
- Modify: `apps/mobile/src/components/SurahReader.tsx`
- Modify: `apps/mobile/src/components/SurahReader.test.tsx`

**Interfaces:**
- Consumes: `estimateRowHeight` from Task 1.
- Produces: a `listWidth` state on the reader (0 until first layout), and a
  `getItemLayout` whose offsets Task 3's landing loop scrolls to.

- [ ] **Step 1: Write the failing test**

```tsx
// in apps/mobile/src/components/SurahReader.test.tsx
it('gives FlatList a getItemLayout so it can jump without measuring', () => {
  const { UNSAFE_getByType } = render(<SurahReader {...props} />);
  const list = UNSAFE_getByType(FlatList);
  const getItemLayout = list.props.getItemLayout;
  expect(getItemLayout).toBeInstanceOf(Function);

  const data = list.props.data;
  const first = getItemLayout(data, 0);
  const second = getItemLayout(data, 1);
  expect(first.offset).toBe(0);
  expect(first.length).toBeGreaterThan(0);
  // Offsets are cumulative: an index's offset is every earlier row summed.
  expect(second.offset).toBe(first.length);
});

it('stops widening initialNumToRender to cover a deep target', () => {
  // The old landing needed the target rendered on the first commit to be
  // measurable. getItemLayout removes that, and with it the cost of laying out
  // every row above a deep link (282 of them for 2:282).
  const { UNSAFE_getByType } = render(
    <SurahReader {...props} initialAyahNumber={282} />,
  );
  expect(UNSAFE_getByType(FlatList).props.initialNumToRender).toBe(10);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd apps/mobile && npx jest src/components/SurahReader.test.tsx -t getItemLayout`
Expected: FAIL — `getItemLayout` is undefined.

- [ ] **Step 3: Track the list's width**

```tsx
// near the other reader state
const [listWidth, setListWidth] = useState(0);
const onListLayout = useCallback((event: LayoutChangeEvent) => {
  setListWidth(event.nativeEvent.layout.width);
}, []);
```

Pass `onLayout={onListLayout}` to the `FlatList`.

- [ ] **Step 4: Build the cumulative offset table**

```tsx
// Cumulative, not per-row: scrollToIndex sums every preceding row, so the
// table is what FlatList actually reads. Rebuilt only when something it
// depends on changes -- a getItemLayout that returned different offsets for
// the same index between calls would move content under the user's finger.
const layout = useMemo(() => {
  const lengths = new Array<number>(data.ayahs.length);
  const offsets = new Array<number>(data.ayahs.length);
  let running = 0;
  for (let index = 0; index < data.ayahs.length; index += 1) {
    const item = data.ayahs[index];
    // noUncheckedIndexedAccess is on: the index came from this loop, but the
    // compiler cannot know that.
    if (!item) continue;
    offsets[index] = running;
    lengths[index] = estimateRowHeight({
      mode,
      arabicSize: arabicSizes.reader,
      listWidth,
      arabicChars: item.ayah.text_uthmani?.length ?? 0,
      translationChars: item.translation?.text.length ?? 0,
    });
    running += lengths[index];
  }
  return { lengths, offsets };
}, [data.ayahs, mode, arabicSizes.reader, listWidth]);

const getItemLayout = useCallback(
  (_: unknown, index: number) => ({
    length: layout.lengths[index] ?? 0,
    offset: layout.offsets[index] ?? 0,
    index,
  }),
  [layout],
);
```

- [ ] **Step 5: Wire it in and drop the widening**

Pass `getItemLayout={getItemLayout}` to the `FlatList`, and change
`initialNumToRender={initialIndex > 0 ? initialIndex + 1 : DEFAULT_INITIAL_RENDER}`
to `initialNumToRender={DEFAULT_INITIAL_RENDER}`. Rewrite the comment block
above `MAX_SCROLL_ATTEMPTS` to say what is now true: the row no longer has to
be rendered to be scrollable to, and the retry loop is no longer blind.

- [ ] **Step 6: Run the tests**

Run: `cd apps/mobile && npx jest src/components/SurahReader.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/components/SurahReader.tsx \
        apps/mobile/src/components/SurahReader.test.tsx
git commit -m "perf(mobile/reader): scroll to an ayah without rendering the ones above it"
```

---

## Task 3: Land in two bounded steps

**Files:**
- Modify: `apps/mobile/src/components/SurahReader.tsx:123` (the constants) and
  the landing effect around `:340-400`
- Modify: `apps/mobile/src/components/SurahReader.test.tsx`

**Interfaces:**
- Consumes: `getItemLayout` from Task 2.
- Produces: nothing outward. `onLanded` still fires exactly once per landing.

**Why this shape.** With `getItemLayout` the jump never *fails*, so the old
"did FlatList report a miss" signal is gone; the new signal is the target row's
own measured offset. That offset is not exact either — rows outside the render
window contribute model heights through FlatList's spacers — but the error is
now over the handful of rendered rows above the target rather than over all 282,
so it converges in one or two passes instead of grinding a 25-deep cap.

- [ ] **Step 1: Write the failing test**

```tsx
it('corrects the model jump against the target row real offset', async () => {
  const { UNSAFE_getByType } = render(
    <SurahReader {...props} initialAyahNumber={100} />,
  );
  const list = UNSAFE_getByType(FlatList);
  const scrollToOffset = jest.spyOn(list, 'scrollToOffset');

  // The model put the row here; it actually laid out 140dp lower.
  act(() => {
    list.props.getItemLayout(list.props.data, 99);
    fireTargetRowLayout({ y: modelOffsetFor(99) + 140 });
  });

  await waitFor(() =>
    expect(scrollToOffset).toHaveBeenCalledWith({
      offset: modelOffsetFor(99) + 140,
      animated: false,
    }),
  );
});

it('reveals the list only once the target row stops moving', async () => {
  const onLanded = jest.fn();
  render(<SurahReader {...props} initialAyahNumber={100} onLanded={onLanded} />);
  act(() => fireTargetRowLayout({ y: 5000 }));
  expect(onLanded).not.toHaveBeenCalled();   // still settling
  act(() => fireTargetRowLayout({ y: 5000 })); // unchanged: settled
  await waitFor(() => expect(onLanded).toHaveBeenCalledTimes(1));
});

it('gives up after the cap rather than hiding the reader forever', async () => {
  const onLanded = jest.fn();
  render(<SurahReader {...props} initialAyahNumber={100} onLanded={onLanded} />);
  // A row that never settles: a different y every pass.
  for (let pass = 0; pass < 10; pass += 1) {
    act(() => fireTargetRowLayout({ y: 5000 + pass * 40 }));
  }
  await waitFor(() => expect(onLanded).toHaveBeenCalledTimes(1));
});

it('does not record a reading position for ayahs the jump flies over', () => {
  const setReaderPosition = jest.fn();
  render(
    <SurahReader {...props} initialAyahNumber={100}
      setReaderPosition={setReaderPosition} />,
  );
  act(() => fireViewableItems([{ index: 12 }, { index: 13 }]));
  expect(setReaderPosition).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `cd apps/mobile && npx jest src/components/SurahReader.test.tsx -t 'corrects the model jump'`
Expected: FAIL — `scrollToOffset` never called.

- [ ] **Step 3: Capture the target row's measured offset**

In `renderItem`, only for the row being landed on — every other row pays
nothing:

```tsx
const isTarget = index === initialIndex;
return (
  <View
    {...(isTarget
      ? {
          onLayout: (event: LayoutChangeEvent) => {
            targetOffsetRef.current = event.nativeEvent.layout.y;
            onTargetMeasured();
          },
        }
      : {})}
  >
    {row}
  </View>
);
```

- [ ] **Step 4: Replace the attempt loop**

```tsx
// Three, not twenty-five. The old loop was blind -- it re-scrolled and asked
// whether the content height had stopped changing, because it had no way to
// see where the target actually was. This one scrolls to the row's measured
// offset, so a pass either moves it or proves it settled.
const MAX_LANDING_PASSES = 3;

const attempt = () => {
  if (cancelled) return;
  passesRef.current += 1;
  const measured = targetOffsetRef.current;
  if (measured === null) {
    // First pass: nothing measured yet, so jump on the model to bring the
    // target into the render window.
    listRef.current?.scrollToIndex({ index: initialIndex, animated: false });
    return;
  }
  if (measured === lastMeasuredRef.current) return reveal();  // settled
  lastMeasuredRef.current = measured;
  listRef.current?.scrollToOffset({ offset: measured, animated: false });
  if (passesRef.current >= MAX_LANDING_PASSES) return reveal();
};
```

`onTargetMeasured` calls `attempt` on the next tick (the existing
`SCROLL_RETRY_DELAY_MS` timer is the right amount of settle). Delete
`MAX_SCROLL_ATTEMPTS`, `failedRef`, `settledHeightRef` and `contentHeightRef`
along with `onContentSizeChange` if nothing else reads it — and keep
`onScrollToIndexFailed`, since FlatList still calls it if `data` changes under
a pending jump.

- [ ] **Step 5: Run the tests**

Run: `cd apps/mobile && npx jest src/components/SurahReader.test.tsx`
Expected: PASS.

- [ ] **Step 6: Mutation-check the landing (§4.4)**

Change `if (measured === lastMeasuredRef.current) return reveal();` to
`return reveal();` unconditionally. Expected: the "reveals only once the target
row stops moving" test FAILS. Restore by re-editing. Then remove the
`passesRef.current >= MAX_LANDING_PASSES` guard: the "gives up after the cap"
test must FAIL (hang or timeout). Restore the same way.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/components/SurahReader.tsx \
        apps/mobile/src/components/SurahReader.test.tsx
git commit -m "fix(mobile/reader): land a deep link in two passes, not twenty-five"
```

---

## Task 4: Quality gate

**Files:** none — this task only runs things.

- [ ] **Step 1: Full suite, lint, types**

```bash
cd apps/mobile && npx jest && npx tsc --noEmit && npx eslint .
```
Expected: all green. No `@ts-ignore`, no disabled rule without an inline
justification (§4.3).

- [ ] **Step 2: Confirm the module graph is untouched**

```bash
cd /home/claude/projects/quran-corpus-pwa/packages/data && npx jest tests/mobile-entry.test.ts
```
Expected: PASS. Nothing in this phase should reach `packages/data` at all; a
failure here means an import went somewhere it should not (§2).

---

## Task 5: Device verification

**Files:**
- Modify: this plan (the verification log below)

No emulator in CI, so this is the gate (§10). Run on the owner's phone, record
each result. "Implementation complete, verification pending" is a fail.

| # | Check | Pass criteria |
|---|-------|---------------|
| 181 | Open 2:282 from a bookmark | Lands with 2:282 at the top, first try, no visible scrolling |
| 182 | Same, at Arabic size X-Large | Same — this is the 512dp-drift config, the one the model is worst at |
| 183 | Open 2:282, then switch mode | The new mode lands on 2:282, not near it |
| 184 | Open a surah with no ayah param | Opens at the top with no jump and no flash |
| 185 | Open 16:90 from search | Lands on 16:90 (the ayah the abandoned recovery missed by 41) |
| 186 | After any of the above, check the reading position | Saved position is the ayah landed on, not one flown over |
| 187 | Scroll Al-Baqara top to bottom by hand | No stutter, no jump, no row drawn at the wrong height |
| 188 | Repeat 181 with Reduce animations on | Same landing, no motion |
| 189 | Deep-link into the surah already on screen | Re-lands without remounting |
| 190 | Turn to the previous/next surah with the chevrons | Still lands at ayah 1 |

**Verification log:** _(unfilled — fill on the device run, with the date and the
device, or this phase is not done)_

---

## Risks and rollback

| Risk | Signal | Response |
|------|--------|----------|
| The width law is unverified — only two widths were measured, and they are confounded with mode | A tablet or landscape lands far off while the phone is fine | The correction pass already absorbs it; if it does not, measure a third width by re-running the spike branch and refit |
| `getItemLayout` disagreeing with real layout makes FlatList misjudge its window, so rows blank while scrolling fast | Check 175 shows empty gaps | Raise `windowSize`; the model only has to be close, not right |
| The target row's `onLayout` never fires (it is outside the window after a bad jump) | The reader stays hidden, then reveals at the cap | The cap already covers it — this is why `reveal()` is on the cap path too |
| Translation length is language-dependent; the coefficient was fitted on English, and Russian runs to 5222 characters against English's 1334 | Landing gets worse after switching content language | `TRANSLATION_DP_PER_CHAR` is per character, so it scales already; if not, fit per language and key the constant on `contentLanguage` |
| A row's height changes after landing (a font swap, an image) | The reader lands then drifts | Known and out of scope — `document.fonts.ready` has no RN equivalent and Hafs is bundled |

**Rollback:** the three commits are independent. Reverting Task 3 restores the
25-attempt loop while keeping `getItemLayout`; reverting Task 2 as well restores
the widened `initialNumToRender`. Task 1 is inert on its own.

---

## Review

§5 does not trigger: no `packages/data` change, no trust boundary, no write to
the on-device user DB. Ships on §4's self-review plus lint, types, tests, and
the Task 5 device run.
