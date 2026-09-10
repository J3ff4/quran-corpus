# Phase M7d — Mushaf as its own tab

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (or `superpowers:executing-plans`). Steps are checkboxes.

**Goal:** Move the mushaf out of the surah reader into a full-screen tab of its own, with chrome that hides, long-press for the word sheet, and page furniture where print puts it.

**Architecture:** The mushaf stops being a reader *mode* and becomes a screen. `SurahReader` loses `ReaderMode` and its layer machine with it; `MushafScreen` owns the pager, its own page state, its own reading position, and its own ayah actions keyed by `surah:ayah` rather than by a route param it no longer has. Chrome visibility is one shared value the screen, the page and the tab bar all read.

**Tech Stack:** Expo Router tabs, React Native, Reanimated, existing `src/mushaf/*` (composition, scale, fonts, highlights) unchanged where possible.

**Spec:** owner rulings, §0 below. No separate spec doc — these were given live 2026-09-09 and this file is their record.

## Global Constraints

- User DB migrations **additive only** (CLAUDE.md, decision 34). Nothing new leaves the device.
- `@quran-corpus/data/mobile` for corpus reads, `/user-db` for writes. Never the barrel.
- §5 independent review triggers: `packages/data` schema/queries, trust boundaries, on-device user-DB writes. Tasks 3 and 9 touch the last one.
- No new dependency without asking (§12). This phase needs none.
- Every task: lint + type-check + all three suites green, mutation-check new branches, conventional commit.
- Device gate is real hardware (§10). Expo Go for iteration, release APK for the run.
- Portrait only. 15-line grid. Fonts are per-page and register at runtime.

---

## §0 Rulings (owner, 2026-09-09)

1. Mushaf gets its **own bottom tab**. Morphology moves into **Menu** — five tabs stay five.
2. Surah reader **drops the Mushaf chip**. Chips become **Translation | Words**.
3. **Single tap = toggle chrome only.** No word opens on tap.
4. **Long-press a word = word sheet**, and the pressed word **highlights** while pressed.
5. Sheet does **bookmark, note, play**, all re-keyed by `surah:ayah` (this is #61).
6. Chrome carries a **jump control (page / surah / juz)** and **search**. No identity row.
7. Chrome **auto-hides on a timer** as well as on tap.
8. **Page number: odd → right corner, even → left corner.**
9. **Juz → top-right corner. Surah name → top-left**, opposite it. Both painted on the page, so they survive the chrome hiding.
10. **Surah number in the band's two medallion cutouts** — Arabic numerals in one, Latin in the other.
11. **Numerals follow the UI locale everywhere.**
12. Ayah-by-ayah translation is **not in this batch**.
13. **One reading position** shared by both readers. Deep links keep opening the **surah reader**.
14. Wrapping/ellipsis defect: already fixed in M7c (`c24a3e1`). Not in scope.

### Ruling 11 as built

All three UI locales (en, uz, ru) use Western digits. Nothing in the app renders Arabic-Indic numerals today, and no locale we ship asks for them. So ruling 11 is already satisfied by every `{n}` in the codebase, and **this phase adds no numeral formatter** (YAGNI). The two deliberate exceptions, both from ruling 10: the band's Arabic cutout, and the page's own printed ayah markers, which are glyphs in the KFGQPC font and not ours to localise. If an Arabic UI locale is ever added, a formatter goes in `src/i18n/` then — one place, and this note is the pointer.

---

## §1 File structure

**New**
- `apps/mobile/app/(tabs)/mushaf.tsx` — route. Thin, like every other tab route.
- `apps/mobile/app/morphology.tsx` — the morphology tab's body, now a stack route under Menu.
- `apps/mobile/src/screens/MushafScreen.tsx` — the screen. Owns page state, index, position, actions.
- `apps/mobile/src/mushaf/chromeVisibility.tsx` — the shared visible/hidden value + auto-hide timer.
- `apps/mobile/src/components/mushaf/MushafChrome.tsx` — the compact header: back-less title, jump, search.
- `apps/mobile/src/components/mushaf/PageJumpSheet.tsx` — page / surah / juz jump.
- `apps/mobile/src/components/mushaf/PageCorners.tsx` — juz, surah name, page number, painted on the page.

**Modified**
- `app/(tabs)/_layout.tsx`, `src/components/GlassTabBar.tsx` — tab swap, bar hides with chrome.
- `src/screens/MenuScreen.tsx` — morphology row.
- `src/components/SurahReader.tsx` — mushaf mode ripped out, layer machine collapses.
- `src/components/ReaderHeader.tsx`, `src/settings/settingsStore.tsx` — `ReaderMode` goes.
- `src/components/mushaf/MushafPage.tsx`, `MushafLineRow.tsx`, `PageFooter.tsx`, `MushafPager.tsx`.
- `src/mushaf/highlights.ts` — a fourth state, per word not per ayah.
- `src/components/mushaf/MushafReader.tsx` — becomes MushafScreen's inner half or is absorbed by it.

**Deleted**
- `app/(tabs)/morphology.tsx` (moves), reader-mode plumbing across the reader.

---

## Task 1: The tab swap

**Files:** create `app/(tabs)/mushaf.tsx`, `app/morphology.tsx`; delete `app/(tabs)/morphology.tsx`; modify `app/(tabs)/_layout.tsx`, `src/components/GlassTabBar.tsx`, `src/screens/MenuScreen.tsx`, `src/i18n/uiStrings.ts`; test `src/components/GlassTabBar.test.tsx`, `src/screens/MenuScreen.test.tsx`.

**Interfaces:** produces route `/mushaf` (tab) and `/morphology` (stack). `TABS` in GlassTabBar gains `mushaf: { icon: 'book'…, label: 'tabs.mushaf' }` and loses `morphology`.

- [ ] **Step 1** — failing test in `GlassTabBar.test.tsx`: a route named `mushaf` renders with its label; a route named `morphology` renders nothing (the map no longer knows it).

```tsx
it('carries the mushaf tab and no longer the morphology one', () => {
  render(<GlassTabBar {...barProps(['index', 'surahs', 'mushaf', 'dictionary', 'menu'])} />);
  expect(screen.getByLabelText('Mushaf')).toBeTruthy();
  expect(screen.queryByLabelText('Morphology')).toBeNull();
});
```

- [ ] **Step 2** — run it, expect FAIL (`Unable to find a label 'Mushaf'`).
- [ ] **Step 3** — add `tabs.mushaf` to all three locales in `uiStrings.ts`. Pick an icon that is not `book` (Surahs owns it) — `pages` if the set has one, else add a glyph to `icons/Icon.tsx`. Swap the `TABS` entry and the `<Tabs.Screen>` list. Route order: `index, surahs, mushaf, dictionary, menu`.
- [ ] **Step 4** — move `app/(tabs)/morphology.tsx` to `app/morphology.tsx` verbatim, minus the tab-specific comment. Add a `MenuScreen` row above Bookmarks: `{ href: '/morphology', icon: 'words', label: 'menu.morphology', sub: 'menu.morphologySub' }` + strings.
- [ ] **Step 5** — a stack route draws a native header, a tab route does not. Check `app/_layout.tsx`'s `<Stack>` options and give `/morphology` the same treatment `/bookmarks` gets, so the screen does not paint two headings.
- [ ] **Step 6** — `mushaf.tsx` renders `<MushafScreen />`; stub it as a `<View testID="mushaf-screen" />` for now, real in Task 3.
- [ ] **Step 7** — run tests, lint, type-check. Commit `feat(mobile): give the mushaf its own tab, move morphology to the menu`.

**Trap:** `lazy: false` on Surahs exists because that tab opens with a SQLite read (M6k). The mushaf tab opens with a SQLite read *and* a font registration — do **not** copy `lazy: false` onto it. Two eager tabs move both costs into startup, and the mushaf's is the larger. It stays lazy; Task 3's landing cross-fade covers the gap.

---

## Task 2: Chrome that hides

**Files:** create `src/mushaf/chromeVisibility.tsx` + test; modify `src/components/GlassTabBar.tsx`, `app/(tabs)/_layout.tsx`.

**Interfaces:** produces
```ts
export function ChromeVisibilityProvider(props: { children: ReactNode }): JSX.Element;
export function useChromeVisibility(): {
  visible: boolean;
  toggle: () => void;
  show: () => void;   // also (re)starts the idle timer
  hide: () => void;
};
```
Consumed by Tasks 3, 5, 8 and by `GlassTabBar`.

**Where the provider goes:** `app/_layout.tsx`, above the `<Stack>` — the tab bar is rendered by the tabs navigator and has to read the same value the screen writes. A provider inside `MushafScreen` is below the bar and cannot reach it.

- [ ] **Step 1** — failing test: `toggle` flips; `show` restarts the timer; after `CHROME_IDLE_MS` of no call, `visible` is false; `hide` is immediate; the timer does not fire after unmount.

```tsx
it('hides itself after the idle window and not before', () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useChromeVisibility(), { wrapper: ChromeVisibilityProvider });
  act(() => result.current.show());
  act(() => vi.advanceTimersByTime(CHROME_IDLE_MS - 1));
  expect(result.current.visible).toBe(true);
  act(() => vi.advanceTimersByTime(1));
  expect(result.current.visible).toBe(false);
});
```

- [ ] **Step 2** — run, expect FAIL (module missing).
- [ ] **Step 3** — implement. `CHROME_IDLE_MS = 3500`. One `setTimeout`, cleared on every `show`/`toggle`/unmount. **Only the mushaf screen ever calls `hide`/`toggle`** — the value defaults to `visible: true` so every other screen's bar is unaffected.
- [ ] **Step 4** — `GlassTabBar` reads `visible` and animates out: `useAnimatedStyle` on `opacity` + `translateY: visible ? 0 : barHeight + insets.bottom + 12`, 220ms. **`pointerEvents="none"` while hidden**, or an invisible bar keeps eating taps at the bottom of the page.
- [ ] **Step 5** — `prefers-reduced-motion`: `useReducedMotion()` → no transition, straight cut. Ruling 24 (M7c) exempts only the page turn.
- [ ] **Step 6** — mutation-check: delete the `clearTimeout` in `show`; the restart test must fail.
- [ ] **Step 7** — gate, commit `feat(mobile/mushaf): one visibility value for the chrome and the tab bar`.

**Trap:** the tab bar is the app's only way out of the mushaf. Auto-hide takes it away, so the tap that brings chrome back must cover the **whole page including the bar's own strip** — Task 5's tap target is the full screen, not the text column.

---

## Task 3: MushafScreen

**Files:** create `src/screens/MushafScreen.tsx` + test; modify `app/(tabs)/mushaf.tsx`, `src/components/mushaf/MushafReader.tsx`.

**Interfaces:** consumes `useMushafIndex`, `MushafPager`, `useChromeVisibility`. Produces a screen taking no props; the corpus client comes from the same context the other tabs use.

Own the things the reader used to hand down: `initialPage` (from `getLastReadingPosition().page`, else 1), `page` state, `focusPage`, `bookmarkedKeys`, `playingAyah`, `uiLocale`.

- [ ] **Step 1** — failing test: mounts, reads the last position, opens the pager on that page; with no stored position opens page 1; records a position on a page turn.

```tsx
it('opens where the reader left off and records where it goes', async () => {
  getLastReadingPosition.mockResolvedValue({ surahId: 5, ayahNumber: 3, page: 106 });
  render(<MushafScreen />);
  expect(await screen.findByTestId('mushaf-pager')).toHaveAttribute('data-page', '106');
  act(() => firePageChange(107));
  expect(recordReadingPosition).toHaveBeenCalledWith(expect.anything(), { surahId: 5, ayahNumber: 1, page: 107 });
});
```

- [ ] **Step 2** — run, FAIL.
- [ ] **Step 3** — implement. Lift `MushafReader`'s body in: the `surahIds` range (four-page window, `LAST_SURAH_ID` fallback), `ayahTexts`, `juzByPage`, the landing pulse, the font-ready cross-fade. `MushafReader` itself is deleted once nothing imports it — Task 4 removes the last caller.
- [ ] **Step 4** — reading position: reuse `latestReadingPositionRecorder`. Ruling 13 — **one** position, so the mushaf writes the same row the surah reader does, with the page's first ayah as the coordinate. Additive only: no schema change, `recordReadingPosition` already takes a page (M7c, `e668c8d`).
- [ ] **Step 5** — restore on focus, not on mount: the tab stays mounted, and a reader session in another tab moves the position under it. `useUserDbOnFocus`, and **do not** re-seed `page` while the pager is mid-swipe — seed only when the screen regains focus on a page other than the one it is parked on.
- [ ] **Step 6** — mutation-check: return `null` from the position read; the "opens on page 1" test must fail.
- [ ] **Step 7** — gate, commit `feat(mobile/mushaf): a screen of its own, opening where the reader left off`.

**§5:** this task writes the on-device user DB. Independent review before merge.

---

## Task 4: Rip the mode out of the reader

**Files:** modify `src/components/SurahReader.tsx`, `src/components/ReaderHeader.tsx`, `src/settings/settingsStore.tsx`, `app/surah/[surahId].tsx`, their tests; delete `src/components/mushaf/MushafReader.tsx` + test.

**Interfaces:** `ReaderMode` and `readerMode`/`setReaderMode` are **gone**. `ReaderHeader` loses `mode`/`onChangeMode` and takes `onOpenWbw` alone.

The reader had two modes; one has left. What that deletes:

- `SegmentedControl` options collapse to Translation | Words, and Words was always a navigation (decision 17), so the control is now **one chip and a door**. Keep the segmented control — the owner asked for two chips, and Words still has to look like the alternative it is.
- The **layer machine** (`layers`, `incoming`, the cross-fade, `MushafPlate`'s ghost) existed to land a mode switch under the mode already on screen (`2fafaae`, `0a178e3`, `8e183d4`). With one rendering mode there is no switch. Delete it and the reader renders one list.
- `readerMode` leaves the settings store. A device with `'mushaf'` persisted: the key is simply no longer read, and `settingKeys` drops it. **No migration, no deletion of the row** — additive-only cuts both ways, and an unread key costs nothing.

- [ ] **Step 1** — failing test in `ReaderHeader.test.tsx`: the control offers exactly Translation and Words; there is no Mushaf option.
- [ ] **Step 2** — run, FAIL.
- [ ] **Step 3** — cut `ReaderHeader`'s mushaf option and the `mode === 'translation'` guards around the translation toggle and language button (always true now).
- [ ] **Step 4** — cut the layer machine from `SurahReader`. Watch what it also carried: `seedAyah`, the landing anchor, `estimateRowHeight`'s `mode: 'translation'` literal (now the only mode — inline it), and the header title's `readerMode === 'mushaf'` branch that named the *page's* surah.
- [ ] **Step 5** — cut `readerMode` from the store, the route, and `isReaderMode`.
- [ ] **Step 6** — mutation-check is not available for a deletion. Instead: run the full suite and confirm the count drops only by the mode tests you deliberately deleted. **List them in the commit body.** A silently vanished test is how a deletion hides a regression.
- [ ] **Step 7** — gate, commit `refactor(mobile/reader): one rendering mode, so drop the layer machine`.

**Trap:** the reader's word sheet, bookmarks, audio and search all still work in translation mode. This task must not touch them. If the diff reaches `AyahCard`, `AyahControls` or `WordSheet`, it has gone too far — those are Task 9's.

---

## Task 5: Tap toggles, long-press opens

**Files:** modify `src/components/mushaf/MushafLineRow.tsx`, `MushafPage.tsx`, `src/mushaf/highlights.ts`, `src/screens/MushafScreen.tsx`, tests for each.

**Interfaces:** `HighlightInput` gains `pressed: { surahId: number; ayahNumber: number; position: number } | null`. `colorForAyah` becomes `colorForWord(surahId, ayahNumber, position)` — the pressed state is the only per-word one, and a per-ayah signature cannot express it.

Precedence, highest first: **pressed → playing → landing → bookmarked → plain**. Pressed wins because it is the only one the user is causing *right now*.

- [ ] **Step 1** — failing tests in `highlights.test.ts`: a pressed word takes the pressed colour while its ayah is playing; its neighbours in the same ayah keep the playing colour.

```ts
it('tints the pressed word alone, over every other state', () => {
  const color = colorForWord({ ...input, playing: '2:5', pressed: { surahId: 2, ayahNumber: 5, position: 3 } }, theme);
  expect(color(2, 5, 3)).toBe(theme.accent);
  expect(color(2, 5, 4)).toBe(theme.playingText);
});
```

- [ ] **Step 2** — run, FAIL.
- [ ] **Step 3** — widen `highlights.ts`. Keep it pure and keep its memo shape: the colour is resolved per word in JS on every render of three mounted pages (M7c's `PULSE_STEPS` note), so no allocation per word inside the loop.
- [ ] **Step 4** — `MushafLineRow`: `onPress` → `onLongPress` on the inner `<Text>`, plus `delayLongPress={280}` and an `onPressIn`/`onPressOut` pair that sets and clears `pressed`. Nested `<Text>` supports all four on Android.
- [ ] **Step 5** — the page-wide tap: a `<Pressable>` **behind** the line stack (not over it — an overlay steals the long-press), `style={StyleSheet.absoluteFill}`, `onPress={toggle}`. The lines sit above it and swallow their own touches, so a tap on a word must also toggle: give the inner `<Text>` an `onPress` that calls `toggle` and nothing else (ruling 3).
- [ ] **Step 6** — clear `pressed` when the sheet closes, and on a page turn. A stuck highlight on a page the user has left is the failure this state invites.
- [ ] **Step 7** — mutation-check: drop `pressed` from the precedence chain; the neighbour assertion must fail.
- [ ] **Step 8** — gate, commit `feat(mobile/mushaf): tap for the chrome, long-press for the word`.

---

## Task 6: The word hit test is off — DEFERRED to the device run

**Ruling (2026-09-09):** step 1 of this task is a measurement on real hardware,
and the phone under adb is the session's own display. Guessing at branch A
without the log would be a style change to a component that renders every glyph
of the Qur'an, made on a hunch. So Task 6 runs inside Task 10, as checks 224 and
224a, with the owner present. Everything below stands as written.

Two candidates worth checking first, both free: the parent `<Text>` carries
`lineHeight` and `textAlign: 'center'` on a `numberOfLines={1}` run, and it
sets no `writingDirection` -- QCF glyphs are Private Use Area codepoints, whose
Bidi class is L, so Android resolves the paragraph direction from them rather
than from the Arabic they draw.

## Task 6 (as planned)

**Files:** modify `src/components/mushaf/MushafLineRow.tsx` and, only on branch B, add a generated table under `src/mushaf/`.

The device run found taps landing on a neighbouring word. Cause unknown — **measure before fixing.**

- [ ] **Step 1** — instrument: log `word.position` and the touch `locationX` for every long-press on a known page (46, whose metrics are already measured). Ten presses left to right across one line.
- [ ] **Step 2** — classify the error from the log:
  - **Constant or proportional shift** (every press lands N words the same direction, or the error grows across the line) → **branch A**.
  - **Mirrored** (the error is the line reflected — press left, get the right-hand word) → **branch A**, RTL span mapping.
  - **Unpredictable, varying per word** → **branch B**.
- [ ] **Step 3A** — branch A: the fix is layout, not data. Suspects in order: `lineHeight` set on the parent `<Text>` and not the child, `textAlign: 'center'` on a `numberOfLines={1}` run, and the parent's `writingDirection` being unset so Android resolves it from content. Fix, then re-run step 1 and show the error gone.
- [ ] **Step 3B** — branch B: per-word x-ranges. The advances already exist — `scraper mushaf-metrics` measures every glyph to produce `pageMetrics.generated.ts`. Emit cumulative per-word offsets per line, resolve the touch against them in `MushafLineRow` with one `<Text>` and an `onTouchEnd`, and drop the nested per-word `<Text>` entirely. **Cost: ~150-250KB generated, on an APK already 211.6MB over Play's ceiling.** Take this branch only if A is disproved, and say so in the commit body.
- [ ] **Step 4** — either branch: a unit test over the resolver with a fixture line, asserting the word returned for an x inside each word's span, including the first and last.
- [ ] **Step 5** — mutation-check: shift the resolver by one word; the fixture test must fail.
- [ ] **Step 6** — gate, commit `fix(mobile/mushaf): select the word that was actually pressed`.

**Rollback:** branch B is additive and revertible on its own commit. Branch A is a style change to one component.

---

## Task 7: Page furniture

**Files:** create `src/components/mushaf/PageCorners.tsx` + test; modify `MushafPage.tsx`, `PageFooter.tsx`, `SurahBand.tsx`, `PageChrome.test.tsx`.

Rulings 8, 9, 10.

- [ ] **Step 1** — failing tests: page 47 (odd) puts its number on the right, page 48 (even) on the left; the juz sits top-right and the surah name top-left on both; both survive `visible: false`.

```tsx
it('puts an odd page-s number on the right and an even one on the left', () => {
  expect(cornerSideOf(render(<PageCorners page={47} … />))).toBe('right');
  expect(cornerSideOf(render(<PageCorners page={48} … />))).toBe('left');
});
```

- [ ] **Step 2** — run, FAIL.
- [ ] **Step 3** — `PageCorners`: absolutely positioned, `pointerEvents="none"`, drawn **inside** the page and never inside the chrome (ruling 9 — they survive the hiding). The footer's centred medallion moves to the outer corner; the juz label leaves the footer for the top-right.
- [ ] **Step 4** — the surah name in the top-left is the surah **the page opens with**, which `MushafScreen` already resolves for the window. On a two-surah page print names the one the page opens with; match it.
- [ ] **Step 5** — the band's cutouts (ruling 10). **Prototype before committing:** the band is a single fixed 8.16:1 path whose two medallion cutouts are ~18dp across at a 15-line grid, and M7c's own doc calls them 5dp at the height it was then drawn. Render a two-digit Latin and a three-digit Arabic-Indic numeral in one and screenshot it. If it is not legible at 114 (the widest case), **say so in the plan's verification log and leave the cutouts empty** — a smudge in an ornament is worse than an ornament.
- [ ] **Step 6** — mutation-check: flip the odd/even test in the corner side; the page-47 assertion must fail.
- [ ] **Step 7** — gate, commit `feat(mobile/mushaf): put the page-s furniture where print puts it`.

---

## Task 8: The compact chrome

**Files:** create `src/components/mushaf/MushafChrome.tsx`, `PageJumpSheet.tsx` + tests; modify `MushafScreen.tsx`.

Ruling 6: jump (page / surah / juz) and search. No identity row — the surah name is on the page now (ruling 9).

- [ ] **Step 1** — failing test: the chrome renders a jump button and a search button and nothing else; hidden when `visible` is false; the jump sheet accepts a page, a surah and a juz, and rejects out-of-range input.

```tsx
it('refuses a page outside the mushaf', () => {
  render(<PageJumpSheet onJump={onJump} … />);
  fireEvent.changeText(screen.getByTestId('jump-page-input'), '605');
  fireEvent.press(screen.getByTestId('jump-go'));
  expect(onJump).not.toHaveBeenCalled();
  expect(screen.getByTestId('jump-error')).toBeTruthy();
});
```

- [ ] **Step 2** — run, FAIL.
- [ ] **Step 3** — build it on `SheetHeader`/`SheetActions`/`SheetRow` (M6j). Do not invent sheet chrome.
- [ ] **Step 4** — **input validation is a trust boundary (§3 OWASP).** Page 1-604, surah 1-114, juz 1-30, integers only. `getMushafPage` validates too (M7b), but a rejected value must never reach it as a thrown error the user sees — reject in the sheet, with a message.
- [ ] **Step 5** — surah → its first page and juz → its first page both come from the loaded index; no new query.
- [ ] **Step 6** — search reuses `SearchHeaderButton`'s route. Same door as the reader's.
- [ ] **Step 7** — the chrome sits over the page: opaque backing, not a translucent one (there is no `backdrop-filter` in RN, and a docked bar over scrollable content needs an opaque ground — the lesson four sub-phases of M6 kept re-learning).
- [ ] **Step 8** — mutation-check: widen the page bound to 605; the rejection test must fail.
- [ ] **Step 9** — gate, commit `feat(mobile/mushaf): a compact chrome that jumps and searches`.

---

## Task 9: Ayah actions with no route surah (#61)

**Files:** modify `src/screens/MushafScreen.tsx`, `src/components/WordSheet.tsx`, `src/components/AyahControls.tsx`, `app/surah/[surahId].tsx`, `src/components/SurahReader.tsx`, tests.

Ruling 5, and the issue the M7c review widened: **everything is keyed to the route's surah** — `bookmarkedKeys`, `prevSurahId`/`nextSurahId`, the audio hook's `surah`. A tab has no route surah.

- [ ] **Step 1** — failing test: on a page holding two surahs, bookmarking an ayah of the *second* one records that surah's coordinate and washes that ayah.

```tsx
it('bookmarks the ayah-s own surah, not the page-s first', async () => {
  render(<MushafScreen />);          // page 106: An-Nisa into Al-Ma-idah
  await longPressWord({ surahId: 5, ayahNumber: 2, position: 1 });
  fireEvent.press(screen.getByTestId('word-sheet-bookmark'));
  expect(setBookmark).toHaveBeenCalledWith(expect.anything(), { surahId: 5, ayahNumber: 2 });
});
```

- [ ] **Step 2** — run, FAIL.
- [ ] **Step 3** — `MushafScreen` holds **all** bookmarks as a `Set<'surah:ayah'>`, not a `Set<number>` scoped to one surah. `getBookmarks` already returns every row; the reader narrows it, the screen must not.
- [ ] **Step 4** — audio: `useRecitation(surah, ayahCount, …)` reads `surah` at `startAyah` time, so the screen passes the **playing ayah's** surah as state and its ayah count from the index. Continuous play advances **within a surah only** — at its last ayah it stops, exactly as it does today. Crossing a surah boundary mid-page is out of scope; note it in the log.
- [ ] **Step 5** — `WordSheet` already takes `ayahActions` + `ayahLabel` (M7c, `e15e6da`). The screen builds an `AyahControls` keyed by the word's own surah. No new sheet prop.
- [ ] **Step 6** — the reader's own half of #61: `prevSurahId`/`nextSurahId` and `bookmarkedKeys` follow the *displayed* surah. With the mushaf gone from the reader (Task 4) the reader shows one surah again and this collapses to what it always was — **verify, then close #61 with both halves named.**
- [ ] **Step 7** — mutation-check: key the bookmark off the page's first surah; the two-surah test must fail.
- [ ] **Step 8** — gate, commit `fix(mobile/mushaf): act on the ayah-s own surah, not the page-s first`.

**§5:** on-device user-DB writes. Independent review before merge, with Task 3.

---

## Task 10: Device run

**Files:** modify `docs/plans/phase-m7d-mushaf-tab.md` (this file, verification log).

- [ ] **Step 1** — full gate: lint, type-check, all three suites.
- [ ] **Step 2** — release APK, `taskset -c 7,8` (mandatory — an unconstrained Gradle run hit load 136).
- [ ] **Step 3** — **coordinate with the owner.** The phone under adb is also this session's display; never drive it unattended.
- [ ] **Step 4** — run checks 219-240 (numbering continues M7c's). At minimum:
  - 219 mushaf tab opens where the reader left off; 220 and back again from the reader
  - 221 tap hides chrome and the tab bar; 222 tap restores both; 223 auto-hide after ~3.5s
  - 224 long-press opens the sheet on **the word pressed**, ten presses across one line
  - 225 the pressed word highlights, and stops when the sheet closes
  - 226 bookmark / 227 note / 228 play, each on a page holding two surahs, on an ayah of the second
  - 229 page number right on odd, left on even; 230 juz top-right, surah name top-left; 231 both survive the chrome hiding
  - 232 band cutouts legible at surah 114, or recorded as dropped
  - 233 jump by page, 234 by surah, 235 by juz; 236 out-of-range refused with a message
  - 237 morphology reachable from Menu; 238 reader chips are Translation | Words
  - 239 TalkBack: chrome, jump sheet, and an ayah's label naming its surah
  - 240 Remove animations: chrome cut, no fade
- [ ] **Step 5** — write the verification log here: device, build, a row per check, every defect with its fix commit.
- [ ] **Step 6** — **stop and ask the owner to run `/code-review`** (§4 step 5, §5 triggers from Tasks 3 and 9). The agent cannot launch it.
- [ ] **Step 7** — **do not open a PR.** The owner's call.

---

## §2 Risks

| Risk | Mitigation |
|---|---|
| Auto-hide takes away the only exit from the tab | Full-screen tap target, Task 2 step 4 + check 221/222 |
| Task 4 deletes a regression's only test with the mode | Commit body lists every deleted test, step 6 |
| Hit-test branch B costs 150-250KB on an APK already over Play's ceiling | Measure first; branch A is free; APK size is M8's problem either way |
| Band cutouts illegible at ~18dp | Prototype in Task 7 step 5, allowed to end in "leave them empty" |
| Mushaf tab's SQLite read + font registration at first tap | Stays lazy, landing cross-fade covers it; do not copy Surahs' `lazy: false` |
| Two readers writing one position row | One recorder, page's first ayah as the coordinate; ruling 13 |

**Rollback:** every task is one commit on `feat/m7d-mushaf-tab`. Task 4 is the only irreversible-feeling one (it deletes the layer machine) and it is recoverable from `9c487be`.

## §3 Acceptance criteria

1. Mushaf is a tab; Morphology is a Menu row; five tabs.
2. Reader chips are Translation | Words; `ReaderMode` no longer exists in the codebase.
3. Chrome and tab bar hide on tap and on a 3.5s idle, and come back on tap.
4. Long-press opens the sheet on the pressed word, highlighted; tap never opens it.
5. Bookmark, note and play work on an ayah whose surah is not the page's first — proved on a two-surah page.
6. Page number odd-right / even-left; juz top-right; surah name top-left; all painted on the page.
7. Jump by page, surah or juz; out-of-range refused in the sheet.
8. One reading position, shared; deep links still open the surah reader.
9. Full gate green; device run logged here; #61 closed with both halves named.

## §4 Open for the owner

1. **Ruling 11 reads as already-satisfied** — see §0. If "Arabic numerals everywhere in the mushaf" was meant instead (page number, juz, and the band in Arabic-Indic, matching print), say so: it is a small change, but it is the opposite of what the ruling says and I am not guessing.
2. **Tab icon and label.** `book` belongs to Surahs. Proposing "Mushaf" with a page-spread glyph; the icon set may need one drawn.
3. **The mushaf tab keeps its own page** while Surahs keeps its own scroll position — two places the app remembers where you are, one row in the database. Intended, per ruling 13, but worth one look.

---

## Implementation log (2026-09-09)

Tasks 1-5 and 7-9 are implemented and committed on `feat/m7d-mushaf-tab`.
Task 6 is deferred into the device run (see its ruling above); Task 10 is the
device run itself, which needs the owner and the phone.

| Task | Commit | Note |
|---|---|---|
| 1 Tab swap | `613d91e` | Mushaf tab in, Morphology to Menu. `tabs.morphology` deleted -- the i18n suite fails an unused key |
| 2 Chrome visibility | `d3c7c3f` | Module state, not a context: the tab bar is a sibling of the screen |
| 3 MushafScreen | `96b6456` | Own client, index, page, position, bookmarks, word sheet |
| 4 Mode ripped out | `a55b0a4` | **-824 lines.** `ReaderMode` gone from the codebase; 20 tests deleted and named in the commit body |
| 5 Gestures | `8e3c1ea` | Tap toggles chrome, long-press opens the sheet, pressed word washes |
| 7 Furniture | `65f0e36`, `bdd783f` | Corners + band cutouts; the band's medallion geometry moved into `packages/config` so both apps read one measurement |
| 8 Chrome | `cf2d5ff` | Jump (page/surah/juz) + search; `pageForJump` extracted so it is not buried behind a mocked sheet |
| 9 Ayah actions | `d072b56` | Keyed to the pressed word's surah. #61 closed, both halves |

**Gate:** mobile 99 files / all tests, `packages/data` 32, web 81, scraper 825
-- all pass. Type-check and lint clean in all three TS packages.

Two mutation-checks earned their keep:

- Deleting `Math.min` in the band's width fit failed the new column test.
- Deleting the whole pressed-word branch in `colorForWord` left the first
  version of its test GREEN -- it asserted the pressed colour on a *playing*
  ayah, where the accent is what `playing` returns anyway. Rewritten against a
  bookmark, where the two differ.

### Owed

1. **Task 10, the device run** -- checks 219-240, plus Task 6's measurement as
   224/224a. Needs the owner and the phone.
2. **`/code-review`** -- §5 triggers: on-device user-DB writes in Tasks 3 and 9.
   User-triggered; the agent cannot launch it.
3. **No PR.** The owner's call.

## Review pass (2026-09-09)

`/code-review` on the branch. Eight findings, all real, all fixed:
`912802b` (surah jump dead for 17 surahs), `88ca21d` (audio: first press
silent, cross-surah press wrong file), `d68791c` (tab bar hidden on other
tabs; stale bookmarks; opens on the Fatiha after a reader session; recorder
dep), `84a0e5b` (gloss cache thrash on two-surah pages), `234bd0b` (corner
row height).

One half declined: the reading position stays a mount-time read. Re-reading
it on focus would move the pager under a reader who turned pages here and
stepped away.

Eight mutation-checks run, one per fix, each confirmed red. Gate: 99 files /
1022 tests, type-check and lint clean.

Still owed: the device run (219-240, plus 224/224a), and the PR.

## Owner screenshot pass (2026-09-10)

Six screenshots, six complaints, all against the m7d APK. Five fixed here,
one deferred with a ruling.

**Rulings taken before any code was written** (the owner was asked; nothing
below was assumed):

| Question | Ruling |
| --- | --- |
| What does the ornament band carry? | The Arabic calligraphic name INSIDE the cartouche, both number cutouts kept and properly centred. Use the surah-name face the web app already uses. |
| Chrome on arrival | Hidden — the tab bar with it. Tap toggles; the 3.5s idle timer stays. |
| Which pages are centred | 1 and 2 only, as a block, line spacing unchanged. |
| Drop shadow | Mushaf chrome and the tab bar. |
| `root_buckwalter` vs `root_arabic` | **Deferred.** Issue #65. |

### The five fixes

1. **`68b4acb` — mushaf Play did nothing.** `useRecitation` stopped the driver
   in a cleanup keyed on the `surah` prop; a cleanup closes over the OLD surah
   and fires on every change. The reader never changes it. The mushaf sets it
   in the same tick it starts the ayah, so the commit that carried the surah
   paused the ayah it had just started — Pause icon, straight back to Play,
   silence. Now compared against the surah the driver is actually loaded with,
   in the effect body where both values are visible.
2. **`c7de7c7` — only glyphs brought the chrome back, and it was up on
   arrival.** The tap target was a `Pressable` painted *behind* the text column
   as a sibling. A touch on a line slot is claimed by that slot's View and
   bubbles up its React ancestors; a sibling underneath is not one. It is the
   page's ancestor now. Chrome hides on focus rather than showing.
3. **`9338627` — pages 1-2 hung from the top.** They are the only two pages the
   layout does not fill (lines 2-8 and 3-8). The grid on those two is the
   occupied block, and the column centres it. Closes #62.
4. **`d3512e8` — empty cartouche over a Latin caption.** The name goes inside,
   in surah-name-v2 (v4 for surah 102, the one glyph v2 lacks). Mapping shared
   at `@quran-corpus/config/ornaments/surahName`; web re-exports it. TTF, not
   WOFF2. Both numerals moved into a View each — `alignItems`/`justifyContent`
   are flex *container* properties and a `<Text>` is not one, which is why they
   sat high and left inside their cutouts. Credited in About (§11).
5. **`0993451` — docked bars read as painted on.** `docked` now picks a deeper
   shadow as well as the opaque backing.

**The shim was blind to shadows.** React puts the style object onto
`node.style`, where `shadowOpacity` and `elevation` are not properties and
vanish silently — no test could tell a wrong shadow from no shadow, in either
direction. `rnHosts` now folds RN's shadow props into a `boxShadow` the DOM
holds. Same shape as `accessible` on a View, and part of why the tab bar
shipped four sub-phases flat.

Also cleared two pre-existing gate failures on this branch (issue #54): a test
fixture missing `ayahCounts`, an extensionless relative import under node16,
and an unused import left in `SurahFrame` by `bdd783f`.

Six mutation-checks run, one per behavioural fix, each confirmed red. Gate: 99
files / 1029 tests, type-check and lint clean across the workspace.

§5: no independent review. Nothing here touches `packages/data` schema or
queries, a trust boundary, or the on-device user DB.

### Build

`assembleRelease` from `0993451`, arm64-v8a, debug-signed, versionCode 1,
211,941,075 bytes. 613 TTFs in the APK against the previous build's 611 — the
two surah-name faces are really in there. Served at
`http://100.70.26.76:3938/quran-corpus-m7d-2.apk`.

Still owed: the device run (219-240, 241-248, 224/224a, and M7c's 217/218),
plus the new checks below, and the PR.

| # | Check | Expect |
| --- | --- | --- |
| 249 | Open the Mushaf tab | No bars at all on the first frame — page only |
| 250 | Tap blank paper below the last line | Both bars return, then leave after 3.5s |
| 251 | Tap the ornament band, then a page margin | Same — neither is deaf |
| 252 | Long-press a word | Sheet opens; the chrome does not toggle |
| 253 | Any surah-opening page | Arabic name inside the cartouche, both numerals centred in their circles |
| 254 | Page 602 (Quraysh / Al-Maun / Al-Kawthar) | Three bands, three names, no missing-glyph boxes |
| 255 | Surah 102, At-Takathur | A name, not a tofu box (v2 has no glyph; v4 is the fallback) |
| 256 | Pages 1 and 2 | Text block centred, not hanging from the top |
| 257 | Page 3 | Still a full 15-line grid — the centring is those two pages only |
| 258 | Long-press → Play, fresh launch | Sound on the first press, Pause icon stays |
| 259 | Tab bar on any tab, and the mushaf chrome | Reads as floating; a visible shadow under the edge |
