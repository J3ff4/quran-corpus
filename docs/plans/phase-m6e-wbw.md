# M6e Word-by-Word Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current word grid with the two layouts the owner chose —
`2c` hybrid as the default and `2d` dense as a second density mode — switchable
from a header chip that is remembered across launches.

**Architecture:** Two renderers over one data shape. `WbwScreen` keeps its
paging, its loader and its sheet; only the row renderer changes. Both layouts
draw the Arabic through the **existing** `SegmentedWord`, which already solves
Android's shaping break across nested `<Text>` (`joinSegmentRuns` + ZWJ,
`f409ed0`) — that component is reused, never re-implemented. One cell per word
in both layouts, and a tap opens the existing `WordSheet`.

**Tech Stack:** as M6a. `apps/mobile` only. No `packages/data` change, no
schema change, no new dependency.

**Spec:** `docs/plans/phase-m6-glass-redesign.md`, decisions 25–29. Mockups
`1f`, `2c`, `2d`; `2d` derives from the owner's reference photo
`uploads/photo_2026-08-17_22-16-37.jpg` in the handoff bundle.

## Global Constraints

Inherited from the umbrella plan. Sub-phase specifics:

- **Decision 28 is the hard one.** Any Arabic word rendered with per-segment
  colour goes through `SegmentedWord`. Do not colour segments by nesting
  `<Text>` yourself in a new layout — Android shapes each nested run
  separately and the word visibly falls apart. This has shipped as a bug once.
- **Decision 27:** one cell per word. No phrase grouping, in either layout.
- **Decision 29:** tap opens the bottom sheet. No inline panel, no pinned
  detail pane.
- **Decision 25:** `2a` is dropped. Do not build a third layout.
- **No §5 trigger.** UI only.
- Branch: `feat/m6e-wbw`. Device checks 73–78.

---

### Task 1: Persist the density

**Files:**
- Modify: `apps/mobile/src/settings/settingsStore.tsx`
- Modify: `apps/mobile/src/settings/settingsStore.test.tsx`

**Interfaces:**
- Produces: `wbwDensity: WbwDensity` and `setWbwDensity(density)` on
  `AppSettingsContextValue`, where
  `export type WbwDensity = 'hybrid' | 'dense'`. Default `'hybrid'`
  (decision 25).

Global, not per-screen (decision 26): the chip is a reading preference, and a
user who wants dense wants it in every surah.

- [ ] **Step 1: Write the failing test**

```tsx
it('restores a persisted density', async () => {
  const settings = await loadPersistedAppSettings(clientWith({ wbwDensity: 'dense' }));
  expect(settings.wbwDensity).toBe('dense');
});

it('falls back to hybrid for a value it does not recognise', async () => {
  for (const bad of ['2c', 'DENSE', '', 'compact']) {
    expect((await loadPersistedAppSettings(clientWith({ wbwDensity: bad }))).wbwDensity).toBe('hybrid');
  }
});
```

- [ ] **Step 2: Run it, watch it fail, implement, re-run**

Same shape as M6d Task 1 — `isWbwDensity` guard beside the others, key in
`settingKeys`, entry in `defaultSettings`, setter on the context.

- [ ] **Step 3: Mutation-check (§4)**

Drop the guard. Expected: the fallback test FAILS. Restore by re-editing.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/settings/settingsStore.tsx apps/mobile/src/settings/settingsStore.test.tsx
git commit -m "feat(mobile): persist the word-by-word density"
```

---

### Task 2: The `2c` hybrid layout

**Files:**
- Create: `apps/mobile/src/components/WbwHybrid.tsx`
- Create: `apps/mobile/src/components/WbwHybrid.test.tsx`
- Modify: `apps/mobile/src/i18n/uiStrings.ts`

**Interfaces:**
- Produces: `<WbwHybrid page uiLocale onWordPress glosses />` with the same
  props `WbwGrid` takes today, plus the gloss map.
- Consumes: `SegmentedWord`, `GlassSurface`, `usePressScale`,
  `useArabicSizes`, `getGlossesWithFallback` (already fetched by `WbwScreen`).

Layout, per mockup `2c`: the whole ayah reads as continuous Arabic across the
top of a glass plate, then beneath it a wrapped RTL run of word cells, each
cell = the word in POS colour over its gloss. The ayah line is the "hybrid"
part — it is what `2b`/`2d` lose and `1f` never had.

- [ ] **Step 1: Write the failing tests**

```tsx
it('renders one cell per word, in mushaf order', () => {
  render(<WbwHybrid page={PAGE_2_255} {...noop} />);

  const cells = screen.getAllByTestId('wbw-cell');
  expect(cells).toHaveLength(PAGE_2_255.words.length);
  // Decision 27. Grouping "Allahu la ilaha" into one phrase cell is the design
  // the owner rejected, and it reads as plausible unless the count is checked.
  expect(cells[0]?.getAttribute('aria-label')).toBe(PAGE_2_255.words[0]!.text_arabic);
});

it('colours segments through SegmentedWord, not by nesting Text itself', () => {
  render(<WbwHybrid page={PAGE_2_255} {...noop} />);

  // Decision 28. SegmentedWord is what applies joinSegmentRuns; a layout that
  // nests its own coloured <Text> renders each segment as a separate shaping
  // run and the word comes apart on Android -- correct in this DOM shim, broken
  // on the device.
  expect(screen.getAllByTestId('segmented-word').length).toBeGreaterThan(0);
});

it('shows each word its own gloss', () => {
  render(<WbwHybrid page={PAGE_2_255} glosses={GLOSSES} {...noop} />);

  // The same "plausible but wrong" hazard WbwGrid already documents for
  // segments: handing every cell the ayah's whole gloss list looks fine.
  expect(screen.getByTestId('wbw-gloss-1').textContent).toBe(GLOSSES.get(1));
  expect(screen.getByTestId('wbw-gloss-2').textContent).toBe(GLOSSES.get(2));
});

it('opens the sheet on a word press', () => {
  const onWordPress = vi.fn();
  render(<WbwHybrid page={PAGE_2_255} onWordPress={onWordPress} {...noop} />);

  fireEvent.click(screen.getAllByTestId('wbw-cell')[0]!);
  expect(onWordPress).toHaveBeenCalledWith(PAGE_2_255.words[0]);
});

it('keeps a word with no analysed segments', () => {
  render(<WbwHybrid page={PAGE_WITH_UNANALYSED_WORD} {...noop} />);
  // Dropping it silently shortens the ayah -- WbwGrid's existing comment.
  expect(screen.getAllByTestId('wbw-cell')).toHaveLength(PAGE_WITH_UNANALYSED_WORD.words.length);
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @quran-corpus/mobile test WbwHybrid`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
        <Pressable
          key={word.id}
          testID="wbw-cell"
          accessibilityRole="button"
          // The whole word, not word + gloss + POS: TalkBack reading three
          // strings per cell turns one ayah into eighty announcements. The
          // sheet is where the detail lives.
          accessibilityLabel={word.text_arabic}
          onPress={() => onWordPress(word)}
          style={{ minHeight: touchTargets.minimum, alignItems: 'center', gap: 2, paddingHorizontal: 6 }}
        >
          <SegmentedWord
            word={word}
            segments={page.segments.get(word.id) ?? []}
            fontSize={arabic.reader}
          />
          <Text
            testID={`wbw-gloss-${word.position}`}
            numberOfLines={2}
            style={{ color: theme.mutedText, fontSize: typography.caption, textAlign: 'center' }}
          >
            {glosses.get(word.id) ?? ''}
          </Text>
        </Pressable>
```

The cells sit in a `flexDirection: 'row-reverse'`, `flexWrap: 'wrap'` container
inside one `GlassSurface` per ayah — not one card per word. That is the visual
difference from today's grid and the reason `2c` reads as a verse rather than a
table.

- [ ] **Step 4: Run the tests, then mutation-check (§4)**

Run: `pnpm --filter @quran-corpus/mobile test WbwHybrid` → PASS.
Then change `glosses.get(word.id)` to `[...glosses.values()][0]`. Expected: the
gloss test FAILS on the second word. Restore by re-editing.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/WbwHybrid.tsx apps/mobile/src/components/WbwHybrid.test.tsx \
        apps/mobile/src/i18n/uiStrings.ts
git commit -m "feat(mobile): add the 2c hybrid word-by-word layout"
```

---

### Task 3: The `2d` dense layout

**Files:**
- Create: `apps/mobile/src/components/WbwDense.tsx`
- Create: `apps/mobile/src/components/WbwDense.test.tsx`

Per mockup `2d` and the reference photo: no per-ayah plate, no ayah line — a
tight interlinear run where each word sits directly above its gloss and the
lines pack close. Same cells, much less air: no card, smaller gaps, gloss at
`typography.caption`, one line.

- [ ] **Step 1: Write the failing tests**

```tsx
it('renders one cell per word, like the hybrid layout', () => {
  render(<WbwDense page={PAGE_2_255} {...noop} />);
  expect(screen.getAllByTestId('wbw-cell')).toHaveLength(PAGE_2_255.words.length);
});

it('colours segments through SegmentedWord', () => {
  // Decision 28 again, and deliberately not shared with the hybrid suite: the
  // two layouts are separate components and a regression in one says nothing
  // about the other.
  render(<WbwDense page={PAGE_2_255} {...noop} />);
  expect(screen.getAllByTestId('segmented-word').length).toBeGreaterThan(0);
});

it('clamps the gloss to a single line', () => {
  render(<WbwDense page={PAGE_2_255} glosses={LONG_GLOSSES} {...noop} />);
  // The density mode's whole point. A two-line gloss makes it the hybrid
  // layout with tighter padding.
  expect(screen.getByTestId('wbw-gloss-1').getAttribute('data-lines')).toBe('1');
});

it('opens the sheet on a word press', () => {
  const onWordPress = vi.fn();
  render(<WbwDense page={PAGE_2_255} onWordPress={onWordPress} {...noop} />);
  fireEvent.click(screen.getAllByTestId('wbw-cell')[0]!);
  expect(onWordPress).toHaveBeenCalledWith(PAGE_2_255.words[0]);
});
```

`numberOfLines` is destructured away by `@/testing/rnHosts` (it has no DOM
equivalent). Map it to a `data-lines` attribute in the shim so the third test
can see it — that is a one-line change in `rnHosts.ts` and it is the only way
this assertion is not vacuous.

- [ ] **Step 2: Run them, watch them fail, implement, re-run**

- [ ] **Step 3: Mutation-check (§4)**

Set `numberOfLines={2}`. Expected: the clamp test FAILS. Restore by re-editing.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/WbwDense.tsx apps/mobile/src/components/WbwDense.test.tsx \
        apps/mobile/src/testing/rnHosts.ts
git commit -m "feat(mobile): add the 2d dense word-by-word layout"
```

---

### Task 4: The density chip, and retiring WbwGrid

**Files:**
- Modify: `apps/mobile/src/screens/WbwScreen.tsx`
- Delete: `apps/mobile/src/components/WbwGrid.tsx`
- Delete: `apps/mobile/src/components/WbwGrid.test.tsx`
- Modify: `apps/mobile/src/test/routes/words.test.tsx`
- Modify: `apps/mobile/src/test/routes/morphologyTab.test.tsx`

Delete `WbwGrid`, do not leave it beside the new pair. Decision 25 dropped `2a`;
a third layout nothing renders is exactly the dead code that gets "fixed" later
by someone who does not know it is dead.

- [ ] **Step 1: Write the failing test**

```tsx
it('renders the hybrid layout by default and remembers a switch to dense', async () => {
  const { setWbwDensity } = renderWbw({ density: 'hybrid' });

  expect(screen.getByTestId('wbw-hybrid')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Dense'));

  // Decision 26: the chip writes the setting, it does not hold local state --
  // otherwise the choice is forgotten on every navigation.
  expect(setWbwDensity).toHaveBeenCalledWith('dense');
});

it('renders the dense layout when the setting says so', () => {
  renderWbw({ density: 'dense' });
  expect(screen.getByTestId('wbw-dense')).toBeTruthy();
  expect(screen.queryByTestId('wbw-hybrid')).toBeNull();
});
```

- [ ] **Step 2: Run it, watch it fail, implement**

`SegmentedControl` in the WBW header with two options; `onChange` calls
`setWbwDensity`. The renderer is picked from `wbwDensity`, straight off
`useAppSettings()`. Keep `WbwScreen`'s paging, the `WBW_PAGE_SIZE` window and
the sheet exactly as they are.

- [ ] **Step 3: Run the whole suite**

Run: `pnpm --filter @quran-corpus/mobile test && pnpm -r type-check && pnpm -r lint`
Expected: PASS. The route suites will need their `WbwGrid` assertions swapped.

- [ ] **Step 4: Mutation-check (§4)**

Hardcode the renderer to `WbwHybrid`. Expected: the second test FAILS. Restore
by re-editing.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/WbwScreen.tsx apps/mobile/src/test/routes
git rm apps/mobile/src/components/WbwGrid.tsx apps/mobile/src/components/WbwGrid.test.tsx
git commit -m "feat(mobile): switch word-by-word density from the header"
```

---

### Task 5: Build and device run

- [ ] **Step 1: Build.**

```bash
cd apps/mobile && pnpm prebuild:assert-db && eas build --platform android --profile preview
```

- [ ] **Step 2: Run checks 73–78 and record every result below.**

| # | Check | Pass condition |
| --- | --- | --- |
| 73 | Hybrid layout, 2:255 | Ayah line reads as continuous Arabic; cells wrap RTL; gloss under each word |
| 74 | **Shaping**, both layouts, on a word with 3+ segments (e.g. `فَسَيَكْفِيكَهُمُ`, 2:137) | The word reads as **one joined word**, not as separated letter groups. This is decision 28's gate |
| 75 | Dense layout | Visibly tighter than hybrid; one-line glosses; more words per screen |
| 76 | Switch density, leave the screen, come back, kill and reopen the app | Density is remembered every time |
| 77 | Tap a word in each layout | The existing word sheet opens with the right word |
| 78 | Segment colours, both themes | Every POS colour is AA-legible on the glass surface |

## Verification Log

| Check | Build | Date | Result | Notes |
| --- | --- | --- | --- | --- |
| 73 | | | | |
| 74 | | | | |
| 75 | | | | |
| 76 | | | | |
| 77 | | | | |
| 78 | | | | |
