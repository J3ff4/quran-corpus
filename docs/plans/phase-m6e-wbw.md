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

- [x] **Step 1: Write the failing test** — done 2026-08-25. Written against the
      suite's real settings client (`requireSettingsClient` + `saveSetting`),
      not the plan's `clientWith` sketch, which this file has never had.

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

- [x] **Step 2: Run it, watch it fail, implement, re-run** — done 2026-08-25,
      17/17. `WbwDensity` gained a THIRD value, `'rail'`, for the layout trial
      in Task 2; it is temporary and goes with the loser.

Same shape as M6d Task 1 — `isWbwDensity` guard beside the others, key in
`settingKeys`, entry in `defaultSettings`, setter on the context.

- [x] **Step 3: Mutation-check (§4)** — done. Guard replaced by an `as` cast;
      the fallback test failed, 16/17. Restored by re-editing.

- [x] **Step 4: Commit** — `44be20b`.

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

- [x] **Step 1-3: tests + implementation** — done 2026-08-25. Written in one
      pass rather than red-then-green, because the shape changed: **both** the
      mockup's horizontal rail and the plan's wrapped run ship, behind a `rail`
      prop, for the owner to choose between on the device (their call,
      2026-08-25). §4's mutation-checks below are what hold the tests honest.

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

**Deviations, all deliberate:**

- The plan says `WbwScreen` already fetches the glosses. It does not — they
  were lazy inside `useWordSummaryLoader` and only arrived on the first word
  tap. Fetched in the screen's existing load effect instead (Task 4).
- Three files, not one: `WbwCell` (the cell every layout shares) and
  `WbwAyahLine` (the continuous mushaf line) sit under `WbwHybrid`, so the
  dense layout in Task 3 reuses the cell rather than copying it.
- The fixture sets `form_arabic`. The old grid's fixture left it null, which
  sends `SegmentedWord` down its unjoined fallback — a decision-28 test over
  that fixture would never touch the joined path at all.
- Cells carry the POS tag the mockup draws (`ADJ`), from `word.pos_tag`.

- [x] **Step 3: Implement** — done

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

- [x] **Step 4: Run the tests, then mutation-check (§4)** — 10/10 pass. Three
      mutations, each killed its own test and nothing else:
      `glosses.get(word.id)` → `[...glosses.values()][0]` failed the gloss
      test; `page.segments.get(word.id)` → first entry failed the per-cell
      segments test; `{rail ? …}` → `{false ? …}` failed the rail test.
      Restored by re-editing.

- [x] **Step 5: Commit** — `a546420`.

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

- [x] **Step 1-2: tests + implementation** — done 2026-08-25, 8/8.
      `WbwDense` is `WbwCell` in `compact` mode: no border, no POS tag,
      one-line gloss. The mockup groups `لَآ إِلَٰهَ إِلَّا` into one phrase
      cell; decision 27 overrides it, one cell per word.

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

- [x] **Step 3: Mutation-check (§4)** — two mutations. `glossLines={2}` failed
      the clamp test; `showPos` failed the dropped-tag test. Restored by
      re-editing. `rnHosts` now maps `numberOfLines` to `data-lines` and
      `horizontal` to `data-horizontal`; both were being destructured away, so
      without the first the clamp assertion would have passed against a
      two-line gloss.

- [x] **Step 4: Commit** — `a972473`.

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

- [x] **Step 1-2: test + implementation** — done 2026-08-25, 18/18 in the route
      suite. The chip is in the SCREEN, above the list, not in the nav header:
      that bar already carries the surah name and the pager, and a third
      control leaves the pager no room at 390pt. Three segments while the rail
      is on trial. `morphologyTab.test.tsx` needed no change after all.

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

`SegmentedControl` in the WBW header with two options; `onChange` calls
`setWbwDensity`. The renderer is picked from `wbwDensity`, straight off
`useAppSettings()`. Keep `WbwScreen`'s paging, the `WBW_PAGE_SIZE` window and
the sheet exactly as they are.

- [x] **Step 3: Run the whole suite** — mobile 71 files / 597 tests green,
      `pnpm -r type-check` clean, mobile lint clean.

- [x] **Step 4: Mutation-check (§4)** — renderer hardcoded to `WbwHybrid`; the
      dense-layout test failed, 17/18. Restored by re-editing.

- [x] **Step 5: Commit** — `b187e92`.

```bash
git add apps/mobile/src/screens/WbwScreen.tsx apps/mobile/src/test/routes
git rm apps/mobile/src/components/WbwGrid.tsx apps/mobile/src/components/WbwGrid.test.tsx
git commit -m "feat(mobile): switch word-by-word density from the header"
```

---

### Task 5: Build and device run

**Step 1 is DEFERRED to 2026-09-01** — the EAS free-plan quota, the same window
M6c Task 4 Step 4 and M6d Task 6 Step 1 wait on. The device run goes through
Expo Go, as M6c's and M6d's did.

- [ ] **Step 1: Build.**

```bash
cd apps/mobile && pnpm prebuild:assert-db && eas build --platform android --profile preview
```

- [x] **Step 2: Run checks 73–79** — done 2026-08-25 over Expo Go on the
      owner's OnePlus 7 Pro (GM1917, Android 12), bundle 2076 modules, both
      themes. 73–78 PASS. **79 is open: it is the owner's call.**

| # | Check | Pass condition |
| --- | --- | --- |
| 73 | Hybrid layout, 2:255 | Ayah line reads as continuous Arabic; cells wrap RTL; gloss under each word |
| 74 | **Shaping**, both layouts, on a word with 3+ segments (e.g. `فَسَيَكْفِيكَهُمُ`, 2:137) | The word reads as **one joined word**, not as separated letter groups. This is decision 28's gate |
| 75 | Dense layout | Visibly tighter than hybrid; one-line glosses; more words per screen |
| 76 | Switch density, leave the screen, come back, kill and reopen the app | Density is remembered every time |
| 77 | Tap a word in each layout | The existing word sheet opens with the right word |
| 78 | Segment colours, both themes | Every POS colour is AA-legible on the glass surface |
| 79 | **Rail vs wrapped**, same ayah, both ways | The owner picks one. The loser's branch, its `'rail'` density value, its i18n keys and its tests are deleted in a follow-up commit |

## Verification Log

| Check | Build | Date | Result | Notes |
| --- | --- | --- | --- | --- |
| 73 | Expo Go, Metro 2076 mod. | 2026-08-25 | PASS | 2:91 and 2:137. Ayah reads as one continuous line, per-word POS colour intact, cells wrap RTL with the gloss under each word. |
| 74 | " | 2026-08-25 | **PASS** | `فَسَيَكْفِيكَهُمُ` (2:137), five segments, renders as ONE joined word in the ayah line AND in its cell, in all three layouts. Decision 28's gate. |
| 75 | " | 2026-08-25 | PASS | 2:91's 26 words fit one screen in dense against roughly a third of that in verse. Glosses hold to one line. |
| 76 | " | 2026-08-25 | PASS | Switched to dense, force-stopped Expo Go, relaunched: still dense. Later switched back to verse on the pushed route and that persisted too. |
| 77 | " | 2026-08-25 | PASS | Tapped `قَالُوا` in dense; the sheet opened on that word, gloss "they say,", segments `قَالُ` Verb + `وا` Personal pronoun. |
| 78 | " | 2026-08-25 | PASS | Both themes. Light: noun blue, verb red, prep green, pron olive on the paper plate. Dark unchanged from M6c's measured set. |
| 79 | " | 2026-08-25 | **OPEN — owner's call** | Both layouts are on the device behind the chip's first two segments. See below. |

### Check 79: rail vs wrapped, what the device shows

- **Verse (wrapped)** puts the whole ayah's glosses on screen with a short
  scroll: at 2:137, ten cells were visible under the plate without scrolling.
- **Rail (mockup 2c)** shows three cells at a time and needs a sideways swipe
  per ayah, while taking the same vertical space as the wrapped run's first
  row. `scrollToEnd` on content-size change works: the rail opens on word 1 at
  the right, as an Arabic reader expects.

The mockup's own tradeoff note called this "the neighbourhood, not the whole
ayah", and on hardware that is exactly how it reads. Nothing here is a defect
in either one; it is a design choice.

## Defects found

None in M6e's own code. Nothing was fixed during this run.

## Observed, not defects (pre-existing, and NOT introduced by M6e)

- **The morphology tab draws no header at all**, so `WbwScreen`'s
  `headerTitle` and its `VersePicker` go nowhere there: no surah name and **no
  way to change the ayah range from that tab**. `app/(tabs)/_layout.tsx` sets
  `headerShown: false` for every tab (M6a, so the screen can draw over the
  bloom), and the tab has rendered `WbwScreen` since M3. The pushed route
  `/surah/[id]/words` has a proper header — back arrow, "Al-Baqara", the
  `137–146` pager — and was verified working in this run. M6e makes the gap
  more visible, since the density chip is now the tab's only control. Worth an
  issue; out of M6e's scope.
- The floating tab pill overlays the bottom of the word sheet on that tab
  (the Root row sits behind it). Also pre-existing; `WordSheet` is untouched by
  M6e.
- Expo's dev-menu FAB covers the top-right of every screen, as in M6c and M6d.

Device state restored: system night mode back to `yes`, app Theme back to Dark.
