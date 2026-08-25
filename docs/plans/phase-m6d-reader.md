# M6d Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the reader to mockups `1e` (night mushaf + docked recitation
bar) and `1j` (light translation), and add the three-way mode chip — Mushaf,
Translation, Word-by-word — that decision 17 puts in the header.

**Architecture:** One reader, three renderings. Mode is a persisted setting, so
the app reopens in the mode the user last read in. Mushaf and Translation are
two row renderers inside the existing `SurahReader` `FlatList`; Word-by-word is
**not** a third renderer — the chip pushes the existing `/surah/[id]/words`
route, so both WBW doors (chip and Morphology tab) reach one screen. The docked
recitation bar ships here as chrome over today's play/pause behaviour; scrub,
continuous play and background playback are M6f.

**Tech Stack:** as M6a. `apps/mobile` only. No `packages/data` change, no
schema change, no new dependency.

**Spec:** `docs/plans/phase-m6-glass-redesign.md`, decisions 17 and 20.
Mockups `1e`, `1f`, `1j`.

## Global Constraints

Inherited from the umbrella plan. Sub-phase specifics:

- **No §5 trigger.** No `packages/data` change, no user-DB *schema* change. The
  new `readerMode` key is a row in the existing `settings` table, which
  `saveSetting` already writes — that is not a schema change and does not need
  a migration.
- Decision 20 again: **no paged mushaf.** "Mushaf mode" here means *Arabic
  without translation, continuous scroll*. It does not mean fixed 15-line
  pages. If a task starts drifting toward line-fitting, stop.
- The reader's deep-link landing behaviour (M5c, `d48888c`) and its
  font-swap re-scroll (`[[font-swap-breaks-mount-scroll]]`) are load-bearing.
  Re-run the M5c landing tests after every change to `SurahReader`; do not
  simplify the render-then-scroll sequence while re-skinning around it.
- Branch: `feat/m6d-reader`. Device checks 65–72.

---

### Task 1: Persist the reader mode

**Files:**
- Modify: `apps/mobile/src/settings/settingsStore.tsx`
- Modify: `apps/mobile/src/settings/settingsStore.test.tsx`

**Interfaces:**
- Produces: `readerMode: ReaderMode` and `setReaderMode(mode)` on
  `AppSettingsContextValue`, where
  `export type ReaderMode = 'mushaf' | 'translation'`.

Two values, not three: `'wbw'` is a navigation, not a rendering (see
Architecture), and storing it would reopen the app onto a screen the user left
by pressing back.

- [x] **Step 1: Write the failing test**

```tsx
it('restores a persisted reader mode', async () => {
  const settings = await loadPersistedAppSettings(clientWith({ readerMode: 'mushaf' }));
  expect(settings.readerMode).toBe('mushaf');
});

it('falls back to translation for a value it does not recognise', async () => {
  // Same keyed-not-positional hazard the file already documents: an unvalidated
  // read puts an arbitrary stored string into a switch and renders nothing.
  for (const bad of ['wbw', 'MUSHAF', '', 'null']) {
    const settings = await loadPersistedAppSettings(clientWith({ readerMode: bad }));
    expect(settings.readerMode).toBe('translation');
  }
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @quran-corpus/mobile test settingsStore`
Expected: FAIL — no `readerMode`.

- [x] **Step 3: Implement**

Add `readerMode` to `AppSettings`, to `defaultSettings` (`'translation'`), to
`settingKeys`, an `isReaderMode` guard beside the others, the read in
`loadPersistedAppSettings`, and `setReaderMode` to the context value. Follow the
file's existing shape exactly — the keyed-not-positional read is deliberate and
documented; do not restructure it.

- [x] **Step 4: Run the tests, then mutation-check (§4)**

Run: `pnpm --filter @quran-corpus/mobile test settingsStore` → PASS.
Then drop the `isReaderMode` guard and return the raw string. Expected: the
fallback test FAILS. Restore by re-editing.

Done 2026-08-25. 15/15 in `settingsStore`, 563/563 across the mobile suite,
type-check clean. Mutation ran as written — guard replaced by
`(persistedReaderMode ?? default) as ReaderMode`, and exactly the fallback test
failed (1 failed / 14 passed). The tests use this file's own `saveSetting`
helper rather than the plan's sketched `clientWith`, which does not exist here.

- [x] **Step 5: Commit**

```bash
git add apps/mobile/src/settings/settingsStore.tsx apps/mobile/src/settings/settingsStore.test.tsx
git commit -m "feat(mobile): persist the reader mode"
```

---

### Task 2: The glass reader header

**Files:**
- Modify: `apps/mobile/src/components/SurahReader.tsx:145-230` (the
  `navigation.setOptions` header block)
- Create: `apps/mobile/src/components/ReaderHeader.tsx`
- Create: `apps/mobile/src/components/ReaderHeader.test.tsx`
- Modify: `apps/mobile/src/i18n/uiStrings.ts`

**Interfaces:**
- Produces:

```ts
export interface ReaderHeaderProps {
  mode: ReaderMode;
  onChangeMode: (mode: ReaderMode) => void;
  onOpenWbw: () => void;
  onOpenLanguage: () => void;
  onOpenSearch: () => void;
  uiLocale: UiLocaleCode;
}
```

- Consumes: `SegmentedControl` (M6c Task 2), `GlassSurface`, `Icon`.

The header becomes: a glass bar holding the three-way mode control on the left
and the search / language icons on the right. The current `headerRight` triple
(search, globe, words) collapses into it — "words" is now the chip's third
segment.

New `uiStrings` keys: `reader.mode`, `reader.modeMushaf`,
`reader.modeTranslation`, `reader.modeWbw`.

- [x] **Step 1: Write the failing tests**

```tsx
it('reports the chosen mode', () => {
  const onChangeMode = vi.fn();
  render(<ReaderHeader mode="translation" onChangeMode={onChangeMode} {...noop} uiLocale="en" />);

  fireEvent.click(screen.getByLabelText('Mushaf'));
  expect(onChangeMode).toHaveBeenCalledWith('mushaf');
});

it('navigates rather than switching mode for word-by-word', () => {
  // Decision 17: both WBW doors reach one screen. Rendering a third mode inline
  // would be a second word-by-word implementation to keep in step.
  const onChangeMode = vi.fn();
  const onOpenWbw = vi.fn();
  render(<ReaderHeader mode="translation" onChangeMode={onChangeMode} onOpenWbw={onOpenWbw} {...noop} uiLocale="en" />);

  fireEvent.click(screen.getByLabelText('Word by word'));
  expect(onOpenWbw).toHaveBeenCalledTimes(1);
  expect(onChangeMode).not.toHaveBeenCalled();
});

it('closes the word sheet before navigating', () => {
  // The existing header comment records why: this button sits in the native
  // toolbar, outside the sheet's backdrop, so leaving the sheet mounted holds
  // the list at no-hide-descendants behind the pushed screen.
  const calls: string[] = [];
  renderReaderWithSheetOpen({ onCloseSheet: () => calls.push('close'), onOpenWbw: () => calls.push('push') });

  fireEvent.click(screen.getByLabelText('Word by word'));
  expect(calls).toEqual(['close', 'push']);
});
```

- [x] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @quran-corpus/mobile test ReaderHeader`
Expected: FAIL — module not found.

- [x] **Step 3: Implement**

`SegmentedControl` with three options; `onChange` routes `'wbw'` to
`onOpenWbw()` and the other two to `onChangeMode()`. Keep every `closeSheet()`
call that exists in the current header — each one has a comment explaining a
bug it fixed. Wire the header through `navigation.setOptions` as today, with
`headerTransparent` from M6a so the bloom shows behind it.

- [x] **Step 4: Run the tests, then mutation-check (§4)**

Run: `pnpm --filter @quran-corpus/mobile test` → PASS.
Then route `'wbw'` into `onChangeMode` as well. Expected: the second test
FAILS. Restore by re-editing.

Done 2026-08-25. 6/6 in `ReaderHeader`, 569/569 across mobile, type-check and
lint clean. Mutation ran as written and exactly the WBW test failed.

Three deviations from this task as planned, all deliberate:

1. **The header replaces the native one** (`navigation.setOptions({ header })`),
   rather than filling `headerRight`. Owner ruling 2026-08-25, asked because
   mockup `1e` draws one glass bar and a native toolbar cannot be one. So
   `ReaderHeaderProps` also carries `surahName`, `titleStyle` and `onBack` --
   the back affordance and the scroll-linked name are this component's job now.
   The reader keeps authoring the animated style, so the M3b/M5c title fade is
   unchanged.
2. **Two rows inside the one bar.** The mockup's chip has two segments and no
   search or globe beside it; ours has three plus both actions, and five
   controls in a 390pt row leaves the name about 34pt.
3. **The tests query by text and testID, not `getByLabelText`.**
   `SegmentedControl` labels the group, and each segment announces its own
   visible text -- there is no per-segment `accessibilityLabel` to match, and
   asserting on one would have meant adding a label the device does not use.
   The sheet-ordering case is covered by the two reader-level tests that already
   assert it (`closes an open word sheet before ...`), rather than by the plan's
   sketched `renderReaderWithSheetOpen`, which does not exist.

- [x] **Step 5: Commit**

```bash
git add apps/mobile/src/components/ReaderHeader.tsx apps/mobile/src/components/ReaderHeader.test.tsx \
        apps/mobile/src/components/SurahReader.tsx apps/mobile/src/i18n/uiStrings.ts
git commit -m "feat(mobile): put a mode chip in a glass reader header"
```

---

### Task 3: Mushaf mode

**Files:**
- Modify: `apps/mobile/src/components/AyahCard.tsx`
- Create: `apps/mobile/src/components/MushafAyah.tsx`
- Create: `apps/mobile/src/components/MushafAyah.test.tsx`
- Modify: `apps/mobile/src/components/SurahReader.tsx`
- Modify: `apps/mobile/src/components/SurahReader.test.tsx`

**Interfaces:**
- Produces: `<MushafAyah ayah bookmarked onToggleBookmark onPressWord ... />`
  — Arabic only, ayah medallion inline at the end of the text, no translation
  block, no card chrome. Rows flow into one continuous plate rather than
  standing as separate cards (mockup `1e`).
- Consumes: `AyahText`, `AyahMedallion` (both unchanged), `GlassSurface` for
  the plate.

- [x] **Step 1: Write the failing tests**

```tsx
it('renders the Arabic without a translation block', () => {
  render(<MushafAyah ayah={AYAH_WITH_TRANSLATION} {...noop} />);

  expect(screen.getByText(AYAH_WITH_TRANSLATION.textUthmani)).toBeTruthy();
  // Mushaf mode is the *reason* the mode chip exists. A renderer that still
  // draws the translation is the translation mode with different padding.
  expect(screen.queryByText(AYAH_WITH_TRANSLATION.translation)).toBeNull();
});

it('keeps the ayah medallion reachable as a control', () => {
  render(<MushafAyah ayah={AYAH_WITH_TRANSLATION} {...noop} />);
  expect(screen.getByLabelText(/Ayah 255/)).toBeTruthy();
});

it('still marks a bookmarked ayah', () => {
  render(<MushafAyah ayah={AYAH_WITH_TRANSLATION} bookmarked {...noop} />);
  expect(screen.getByTestId('ayah-2-255-bookmark').getAttribute('aria-pressed')).toBe('true');
});
```

- [x] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @quran-corpus/mobile test MushafAyah`
Expected: FAIL — module not found.

- [x] **Step 3: Implement, then switch on mode in the reader**

In `SurahReader`, `renderItem` picks `MushafAyah` or the restyled `AyahCard` by
`readerMode`. Everything else in that component — the landing sequence, the
viewability tracking, the sheet, the retry loop — is untouched. Both renderers
must expose the same `testID`s for bookmark and word presses, or the M5c
landing tests and the M3 word-sheet tests fail against mushaf mode.

- [x] **Step 4: Run the whole mobile suite**

Run: `pnpm --filter @quran-corpus/mobile test && pnpm -r type-check && pnpm -r lint`
Expected: PASS, **including** the M5c deep-link landing tests. If those fail,
the re-skin broke the scroll sequence — fix that before continuing.

- [x] **Step 5: Mutation-check (§4)**

Make `renderItem` always return `AyahCard`. Expected: the first MushafAyah test
still passes (it renders the component directly) but the reader-level mode test
FAILS. If no reader-level test fails, add one — the switch is the logic.
Restore by re-editing.

Done 2026-08-25. 576/576 across mobile, type-check and lint clean, M5c landing
tests included. Mutation ran as written: `renderItem` forced to `AyahCard` left
MushafAyah's own five tests passing and failed exactly the reader-level mode
test, which is why that test was added.

Two notes on how it was built:

- The medallion is inline **inside the text run**, via a new `trailing` slot on
  `AyahText`. A marker in a sibling View sits at the end of the *block*, so a
  one-line ayah showed it a full line below the words it closes. Only one text
  run gets native Arabic line breaking, which is the same reason `AyahText`
  nests `<Text>` rather than laying out a row of Views. Device check 66 is the
  gate on whether an inline View disturbs Android's shaping at the run's end.
- `AyahCard` gained the same `ayah-{surah}-{ayah}-bookmark` / `-audio` testIDs
  MushafAyah carries, so a reader-level test reaches whichever renderer the
  mode mounted.

- [x] **Step 6: Commit**

```bash
git add apps/mobile/src/components/MushafAyah.tsx apps/mobile/src/components/MushafAyah.test.tsx \
        apps/mobile/src/components/AyahCard.tsx apps/mobile/src/components/SurahReader.tsx \
        apps/mobile/src/components/SurahReader.test.tsx
git commit -m "feat(mobile): add mushaf mode to the reader"
```

---

### Task 4: Translation mode in glass, and the surah plate

**Files:**
- Modify: `apps/mobile/src/components/AyahCard.tsx`
- Modify: `apps/mobile/src/components/Bismillah.tsx`
- Modify: `apps/mobile/src/components/AyahMedallion.tsx`
- Modify: `apps/mobile/src/components/SurahReader.tsx`

Per mockups `1e`/`1j`:

- Each ayah is a `GlassSurface` card: Arabic right-aligned in `fonts.arabic` at
  `useArabicSizes()`, a hairline rule, then the translation in the UI face.
- The surah opens on a plate — Arabic name in `fonts.arabic`, transliteration
  and translation in `fonts.display`, ayah count and revelation type as muted
  caption, Bismillah beneath.
- The medallion keeps its rosette; recolour it to the glass palette rather than
  redrawing it. **The M2 rosette carry-over check is superseded by M6a** and the
  redraw is not in scope here.
- Bookmark and play controls become icon buttons in the card's footer row, each
  ≥ `touchTargets.minimum`, each with an `accessibilityLabel`.

- [ ] **Step 1: Restyle, running the existing suites as you go**

There is no new logic in this task — it is styling over components that already
have tests. §4's mutation-check does not apply to a style constant. The gate is
the existing suites staying green plus device checks 65–68.

Run after each file: `pnpm --filter @quran-corpus/mobile test`

- [ ] **Step 2: Check contrast on the real surface**

Every colour used on a card must be measured against
`composite(glass[mode].fill, bloom)`, not against `theme.background` — M6a Task
2 added `composite` for exactly this. Add assertions to `tokens.test.ts` for any
*new* colour pairing this task introduces. Do not introduce a new hex without
one.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/src/components
git commit -m "feat(mobile): glass ayah cards and a surah opening plate"
```

---

### Task 5: The docked recitation bar (chrome only)

**Files:**
- Create: `apps/mobile/src/components/RecitationBar.tsx`
- Create: `apps/mobile/src/components/RecitationBar.test.tsx`
- Modify: `apps/mobile/src/components/SurahReader.tsx`

**Interfaces:**
- Produces:

```ts
export interface RecitationBarProps {
  ayahNumber: number | null;   // null = nothing playing
  playing: boolean;
  onTogglePlay: () => void;
  uiLocale: UiLocaleCode;
}
```

Mockup `1e`'s bar, wired to the reader's **existing** `toggleAyah`. M6f replaces
this props shape with the full transport (scrub, next/previous, reciter). Ship
the surface now so M6f is a behaviour change on a component that already has a
device-verified layout.

- [ ] **Step 1: Write the failing tests**

```tsx
it('is not rendered when nothing is playing', () => {
  render(<RecitationBar ayahNumber={null} playing={false} onTogglePlay={() => {}} uiLocale="en" />);
  expect(screen.queryByTestId('recitation-bar')).toBeNull();
});

it('names the ayah it is playing', () => {
  render(<RecitationBar ayahNumber={255} playing onTogglePlay={() => {}} uiLocale="en" />);
  // A bar that says only "Pause" gives a screen-reader user no way to tell
  // which ayah is sounding.
  expect(screen.getByTestId('recitation-bar').getAttribute('aria-label')).toContain('255');
});

it('toggles playback', () => {
  const onTogglePlay = vi.fn();
  render(<RecitationBar ayahNumber={255} playing onTogglePlay={onTogglePlay} uiLocale="en" />);
  fireEvent.click(screen.getByLabelText('Pause'));
  expect(onTogglePlay).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run them and watch them fail; implement; re-run**

`GlassSurface radius="pill"`, absolutely positioned above the tab pill's
clearance, `usePressScale` on the transport button. Nothing new in
`useAyahAudioController`.

- [ ] **Step 3: Mutation-check (§4)**

Render the bar unconditionally. Expected: the first test FAILS. Restore by
re-editing.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/RecitationBar.tsx apps/mobile/src/components/RecitationBar.test.tsx \
        apps/mobile/src/components/SurahReader.tsx
git commit -m "feat(mobile): dock a glass recitation bar in the reader"
```

---

### Task 6: Build and device run

- [ ] **Step 1: Build.**

```bash
cd apps/mobile && pnpm prebuild:assert-db && eas build --platform android --profile preview
```

- [ ] **Step 2: Run checks 65–72 and record every result below.**

| # | Check | Pass condition |
| --- | --- | --- |
| 65 | Translation mode, both themes | Glass cards over the bloom; Arabic and translation both AA-legible |
| 66 | Mushaf mode | Arabic only, continuous plate, medallions inline; no translation anywhere |
| 67 | Kill and reopen the app | Reader reopens in the mode last used |
| 68 | Word-by-word segment of the chip | Opens the WBW screen; back returns to the reader in the previous mode |
| 69 | Morphology tab | Still reaches the same WBW screen (decision 17: both doors) |
| 70 | Deep link into 16:90 from the concordance | Lands **on** 16:90, no flash-scroll — the M5c fix still holds |
| 71 | Bookmark and play from a card, both modes | Both work; targets are comfortably tappable |
| 72 | Recitation bar | Appears on play, names the ayah, pauses; clears the tab pill |

## Verification Log

| Check | Build | Date | Result | Notes |
| --- | --- | --- | --- | --- |
| 65 | | | | |
| 66 | | | | |
| 67 | | | | |
| 68 | | | | |
| 69 | | | | |
| 70 | | | | |
| 71 | | | | |
| 72 | | | | |
