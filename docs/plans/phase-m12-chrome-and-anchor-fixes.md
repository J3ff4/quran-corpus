# Phase M12 — Chrome, Anchor and Search-Field Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans`. Steps use `- [ ]` checkboxes.

**Goal:** Six device-reported defects: reader loses its place on a language
switch, mushaf sheets slide down when chrome hides, morphology has no kebab,
Uzbek morphology glosses sit at different heights, the Search field looks
unlike every other, and no search field can be cleared.

**Architecture:** One shared `SearchField` replaces three hand-rolled fields.
Two bugs are one-line-class fixes at the right layer (`useStableInsets` in
`BottomSheet`, span padding in `WbwSpan`). The reader re-anchors off the
`queryLanguage` it already re-queries on. Morphology gains the reader's
kebab+curtain pattern, already built as `Collapsible`.

**Tech stack:** Expo RN, Reanimated, existing `@/components/*`. No new deps.

**Spec:** this file. Owner rulings 2026-09-22, recorded below verbatim.

---

## Global constraints

- **No new dependency** without asking (CLAUDE.md §12). None needed.
- **No `packages/data` change.** Every task is `apps/mobile` UI. If a task
  reaches for `packages/data`, stop — that is a §5 trigger and a scope error.
- `apps/mobile` tsconfig **excludes `**/*.test.ts`**. The gate is
  `pnpm run type-check` (both projects) or `pnpm exec turbo type-check lint test`.
  `npx tsc --noEmit` is blind to test files and has shipped CI-red twice.
- Metro's watcher is dead here: every device build needs `expo start --clear`.
- Gradle: `taskset -c 7,8`, `--no-daemon`, arm64 only. Never while Metro runs.
- `versionCode` lives in `apps/mobile/app.json` (`android/` is gitignored
  prebuild output). Bump it per device build.
- §4 mutation-check every branch/guard: delete the fix, prove a test fails.
- Restore a mutated file **by re-editing or from a saved copy** — never
  `git checkout` / `git restore`, never `git stash`.

## Owner rulings (2026-09-22)

| # | Ruling |
|---|--------|
| R1 | Reader holds the **topmost visible ayah** on a language switch. |
| R2 | Re-anchor covers the **language switch and the Uzbek script toggle** — and only those. NOT the translation toggle, NOT Arabic font size. (Both are the same `queryLanguage` value, so one mechanism serves both.) |
| R3 | Mushaf sheet drop is fixed by **freezing the sheet's bottom inset** while it is open. Chrome behaviour is unchanged. |
| R4 | Morphology layout: **kebab up, density into the curtain.** Native back strip kept. Row 1 = name ▾ + ⋮. Row 2 = ‹ ayah pager ›. |
| R5 | Morphology kebab holds **search, gloss language, density**. No translation toggle (nothing to toggle), no Uzbek script toggle (global setting, would read as screen-scoped). |
| R6 | Morphology search is **global** — pushes `/search`, exactly as the reader's magnifier does. |
| R7 | Gloss alignment: **match span rhythm to cell.** Not the Arabic line box, not a two-row grid. |
| R8 | `✕` **clears and keeps typing** — field stays focused, keyboard stays up. |
| R9 | Shared `SearchField` adopted by **Search screen, Surahs tab filter, Surah picker sheet, Dictionary**. |
| R10 | Search screen gains a **"Go to verse" button opening the existing `SurahJumpSheet`** — not web's always-visible picker block. One go-to control across the app. |
| R11 | **One phase, M12.** One branch, one device run at the end. |

## What the code actually says (read 2026-09-22, before planning)

- **Reader drift.** `SurahReader.tsx:433` — `anchorKey` is
  `${surah.id}:${seedAyah}:${seedNonce}`. Language is absent, so a language
  change re-queries and re-renders with different row heights under an
  unchanged scroll offset. `lastVisibleRef` (`:680`) already holds
  `viewableItems[0]` = the topmost visible ayah, which is exactly R1.
- **Sheet drop.** `MushafScreen.tsx:616` — `<NavigationBar hidden={mushafFocused && !chromeVisible} />`.
  Chrome hides → nav bar hides → `insets.bottom` → 0 → `BottomSheet.tsx:256`
  `paddingBottom: bottomPadding + bottomInset` shrinks → sheet shortens → its
  top edge slides down. Same mechanism as the 2026-09-16 player dip, whose fix
  note sits at `BottomSheet.tsx:209`.
- **Gloss misalignment.** A plain `WbwCell` is `paddingVertical: 9` → Arabic →
  `gap: 3` → POS → `gap: 3` → gloss. A `WbwSpan` is `paddingVertical: 4` →
  compact cell (`paddingVertical: 2`, `gap: 0`, `hideGloss`) → `WbwSpanGloss`.
  Different offsets, so a shared gloss sits lower than a single-word one.
  **English is clean because English has no `gloss_group`** — every word is its
  own cell, so no spans exist and nothing can differ. Uzbek (Tasnim) has them.
- **Three search fields.** Dictionary = glass row + `✕`, no magnifier
  (`DictionaryScreen.tsx:369`). Search = accent-bordered glass, no icon, no
  clear (`SearchScreen.tsx:201`). Surahs tab / picker = chip radius + hairline
  border, no icon, no clear (`SurahsScreen.tsx:351`, `SurahPicker.tsx:112`).
  Home's pill (the one that looks right) has the magnifier.

## File structure

| File | Responsibility |
|------|----------------|
| `src/components/SearchField.tsx` | **NEW.** The one search field: glass pill, leading magnifier, inline `✕`. |
| `src/components/SearchField.test.tsx` | **NEW.** Clear visibility, clear behaviour, focus retention. |
| `src/screens/SearchScreen.tsx` | Adopt `SearchField`; add the Go-to-verse button + `SurahJumpSheet`. |
| `src/screens/SurahsScreen.tsx` | Adopt `SearchField`. |
| `src/components/SurahPicker.tsx` | Adopt `SearchField`. |
| `src/screens/DictionaryScreen.tsx` | Adopt `SearchField` (drops its own `✕`). |
| `src/components/SurahReader.tsx` | Re-anchor on `queryLanguage` change. |
| `src/components/BottomSheet.tsx` | Freeze the bottom inset while open. |
| `src/components/WbwSpan.tsx` | Span vertical rhythm == cell rhythm. |
| `src/screens/WbwScreen.tsx` | Kebab + curtain; pager to its own row. |

---

### Task 1: the shared `SearchField`

**Files:** Create `src/components/SearchField.tsx`, `src/components/SearchField.test.tsx`.

**Interfaces — Produces:**
```ts
export interface SearchFieldProps {
  value: string;
  onChangeText: (next: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  clearAccessibilityLabel: string;
  autoFocus?: boolean;
  testID?: string;
  clearTestID?: string;
}
export function SearchField(props: SearchFieldProps): JSX.Element;
```

- [ ] **Step 1: failing test** — `SearchField.test.tsx`:
```tsx
it('shows no clear button while the field is empty', () => {
  render(<SearchField {...base} value="" />);
  expect(screen.queryByTestId('search-field-clear')).toBeNull();
});
it('clears the field and keeps the keyboard up', () => {
  const onChangeText = vi.fn();
  render(<SearchField {...base} value="baqara" onChangeText={onChangeText} />);
  fireEvent.click(screen.getByTestId('search-field-clear'));
  expect(onChangeText).toHaveBeenCalledWith('');
  // R8: focus is retained, so the next keystroke goes into the field.
  expect(screen.getByTestId('search-field').getAttribute('data-focused')).toBe('true');
});
```
  Focus assertion depends on the rnHosts shim exposing focus; if it does not,
  assert `inputRef.current.focus` was called via a spy on the ref object
  instead. **Do not assert nothing** — a test that passes with the `focus()`
  call deleted is vacuous (§4, and this has slipped twice).
- [ ] **Step 2:** run it, confirm it fails (`SearchField` not defined).
- [ ] **Step 3: implement.** `GlassSurface` row: `Icon name="search"` at
      `color={theme.mutedText}`, `TextInput` with `flex: 1`, then the clear
      `Pressable` when `value.length > 0`. Clear calls `onChangeText('')` then
      `inputRef.current?.focus()` (R8). Clear target keeps the
      `touchTargets.minimum` floor — a bare `✕` glyph is ~14pt, which is the
      note already written at `DictionaryScreen.tsx:392`.
- [ ] **Step 4:** tests pass.
- [ ] **Step 5: mutation-check** — delete the `focus()` call; the focus test
      must fail. Delete the `value.length > 0` guard; the empty-field test must
      fail. Restore by re-editing.
- [ ] **Step 6: commit** `feat(mobile): one search field for every search`

### Task 2: roll `SearchField` out to four screens (R9)

**Files:** Modify `src/screens/SearchScreen.tsx`, `src/screens/SurahsScreen.tsx`,
`src/components/SurahPicker.tsx`, `src/screens/DictionaryScreen.tsx`.

Same-shape work across four files — **one dispatch, one review**, not four.

- [ ] **Step 1:** replace each hand-rolled field with `<SearchField … />`,
      keeping each screen's existing `testID` on the input so existing suites
      keep passing (`search-input`, `dictionary-search`, and the picker's).
- [ ] **Step 2:** delete `DictionaryScreen`'s own `✕` block and its
      `dictionary-search-clear` Pressable — the component owns it now. Keep the
      i18n key; pass it as `clearAccessibilityLabel`.
- [ ] **Step 3:** `SearchScreen` keeps `autoFocus`. The accent border does NOT
      survive: one field everywhere (R9). If that reads wrong on device it is a
      one-line `emphasis` prop later, not now.
- [ ] **Step 4:** add i18n keys for any screen that lacks a clear label
      (`*.clearSearch`) in `src/i18n/uiStrings.ts`, all three locales.
- [ ] **Step 5:** run the four screens' suites. Fix fallout.
- [ ] **Step 6: commit** `refactor(mobile): every search field is the same field`

### Task 3: Go to verse, from the Search screen (R10)

**Files:** Modify `src/screens/SearchScreen.tsx`.

**Consumes:** `SurahJumpSheet` (`{ uiLocale, surahId, ayahCountOf, onClose, onJump, onBrowse? }`),
`useSurahIndex(nameLanguage)` → `{ surahs, ayahCountOf }`, `getReaderPosition`.

- [ ] **Step 1: failing test** — pressing `search-goto` opens the jump sheet;
      `onJump(2, 255)` routes to the reader at 2:255.
- [ ] **Step 2:** run, confirm fail.
- [ ] **Step 3:** add a `Go to verse` button under the field, opening
      `SurahJumpSheet`. Seed `surahId` from `getReaderPosition`'s surah if there
      is one, else `1`. Seeding matters: a jump sheet that always opens at
      al-Fatiha makes the reader's own position invisible.
- [ ] **Step 4:** tests pass.
- [ ] **Step 5: mutation-check** — make `onJump` a no-op; the routing test must
      fail.
- [ ] **Step 6: commit** `feat(mobile/search): go to a verse without typing it`

### Task 4: the reader holds its place (R1, R2)

**Files:** Modify `src/components/SurahReader.tsx`.

- [ ] **Step 1: failing test** — render at 2:10, change `queryLanguage`
      `'uz'` → `'uz-Cyrl'`, assert `scrollToIndex` is called with the index of
      ayah 10. A second case: the same switch while `lastVisibleRef` is null
      (nothing viewable yet) must NOT scroll — landing mid-mount is how the
      saved position gets overwritten with an ayah nobody read.
- [ ] **Step 2:** run, confirm fail (today no scroll happens at all).
- [ ] **Step 3: implement.** On a `queryLanguage` change, re-anchor to
      `lastVisibleRef.current` with `nonce + 1`:
```ts
const previousQueryLanguage = useRef(queryLanguage);
useEffect(() => {
  if (previousQueryLanguage.current === queryLanguage) return;
  previousQueryLanguage.current = queryLanguage;
  const held = lastVisibleRef.current;
  if (held === null) return;
  setAnchor((current) => ({ ...current, ayah: held, nonce: current.nonce + 1 }));
}, [queryLanguage]);
```
      **Compare in the effect body, not in a cleanup** — a cleanup fires with
      the OLD value on every change and cannot see the new one; that exact
      shape broke mushaf Play once.
      The existing landing effect (`:515`) already handles `nonce > 0`, so the
      scroll path is reused rather than duplicated.
- [ ] **Step 4:** tests pass.
- [ ] **Step 5: mutation-check** — delete the `nonce + 1` bump (leave the
      `setAnchor`); the landing test must fail, because an unchanged nonce
      re-lands nothing when the target ayah is the one already anchored. Then
      delete the `held === null` guard; the second test must fail.
- [ ] **Step 6: commit** `fix(mobile/reader): a language switch holds your place`

### Task 5: a sheet does not move when chrome leaves (R3)

**Files:** Modify `src/components/BottomSheet.tsx`.

- [ ] **Step 1: failing test** — open a sheet with `insets.bottom = 48`, drop
      the live inset to `0` (the nav bar hiding), assert the sheet's
      `paddingBottom` is unchanged.
- [ ] **Step 2:** run, confirm fail.
- [ ] **Step 3:** swap `useSafeAreaInsets().bottom` for
      `useStableInsets().bottom` at `:94`. That hook already holds the last
      non-zero inset and exists for exactly this class of bug — it was written
      when the mushaf's chrome dragged the tab scene around.
- [ ] **Step 4:** tests pass.
- [ ] **Step 5: mutation-check** — put `useSafeAreaInsets` back; the test must
      fail. (If it passes both ways the fake is not driving the inset and the
      test asserts nothing.)
- [ ] **Step 6: commit** `fix(mobile): a sheet keeps its height when the nav bar goes`

### Task 6: a shared gloss sits where a single one does (R7)

**Files:** Modify `src/components/WbwSpan.tsx`. Possibly
`src/components/WbwCell.tsx` if the constants want naming.

- [ ] **Step 1: failing test** — render a `WbwDense` run holding one plain cell
      and one two-word span, and assert the two gloss nodes report the same
      `paddingTop`-derived offset. If the shim cannot measure layout, assert
      instead that the span's outer `paddingVertical` and its inner compact
      cell's `paddingVertical` **sum to the plain cell's** — the arithmetic IS
      the fix, and it is checkable without layout.
- [ ] **Step 2:** run, confirm fail (`4 + 2 = 6`, against a cell's `9`).
- [ ] **Step 3:** give the span the plain cell's rhythm. Extract the numbers
      into named constants in `WbwCell.tsx` and import them, so the two cannot
      drift apart again — the drift IS the bug.
- [ ] **Step 4:** tests pass.
- [ ] **Step 5: mutation-check** — change the span's padding back to `4`; the
      test must fail.
- [ ] **Step 6: commit** `fix(mobile/wbw): a shared gloss lines up with its neighbours`

### Task 7: the morphology kebab (R4, R5, R6)

**Files:** Modify `src/screens/WbwScreen.tsx`.

**Consumes:** `Collapsible`, `SearchHeaderButton`, `Icon name="kebab" | "close" | "globe"`,
`SegmentedControl`, `LanguageSheet` (whatever `ReaderHeader`'s globe opens).

- [ ] **Step 1: failing test** — the kebab is present; pressing it reveals a
      row holding search, globe and the density control; pressing search pushes
      `/search` (R6); the density control is **absent** from the resting chrome.
- [ ] **Step 2:** run, confirm fail.
- [ ] **Step 3: implement.** Row 1 = name ▾ (unchanged `wbw-surah-jump`) + the
      kebab. Row 2 = `‹ prev surah` + `VersePicker` + `next surah ›`. Curtain =
      `Collapsible` holding search, gloss language, density. Mirror
      `ReaderHeader.tsx:203-330` rather than inventing a second pattern — including
      its `Icon name={actionsOpen ? 'close' : 'kebab'}` swap.
- [ ] **Step 4:** tests pass. Check `WbwScreen.test.tsx` for suites that assert
      the density control's resting position and update them deliberately.
- [ ] **Step 5: mutation-check** — make the kebab's `onPress` a no-op; the
      reveal test must fail.
- [ ] **Step 6: commit** `feat(mobile/wbw): the reader's kebab, on morphology`

---

## Risks

| Risk | Mitigation |
|------|------------|
| `useStableInsets` holds a **stale** bottom inset if a device legitimately changes it (rotation, gesture↔button nav switch) while a sheet is open. | Bounded: the sheet is short-lived and re-reads on the next open. Accepted — the alternative is the bug. |
| Dropping the Search screen's accent border may read as a downgrade on device. | Device check 394 looks at it explicitly. Reversible as an `emphasis` prop, one line. |
| Re-anchor fires during the mount landing and fights it. | The `held === null` guard plus the existing `liveRef` gate. Device check 392 covers a switch immediately after opening a surah. |
| Morphology header churn breaks the M6e fix (issue #25: a tab screen's `setOptions` publishes nowhere). | The header stays **drawn in the screen**. No `setOptions` is introduced. Asserted by the existing suite. |
| Span padding change alters WBW row heights → the M6l fitted row-height model drifts. | WBW is not the reader's `getItemLayout` list. Confirm no `rowHeightModel` fixture references span padding before landing Task 6. |

## Rollback

Per-task commits, so any one reverts alone. Task 2 is the only wide one; it is
a pure call-site swap with `SearchField` left in place, so reverting it does not
strand the new component.

## Acceptance criteria (testable)

1. `SearchField` shows no clear control when empty; shows one when not; pressing
   it empties the field and the field is still focused.
2. All four screens render `SearchField`; no screen defines its own clear button.
3. Search screen's Go-to button opens `SurahJumpSheet` seeded from the saved
   reading position, and a jump routes to that ayah.
4. Changing `queryLanguage` in the reader calls `scrollToIndex` with the index
   of the topmost visible ayah; with nothing visible yet, it does not scroll.
5. A `BottomSheet`'s `paddingBottom` does not change when the live bottom inset
   collapses to 0 while it is open.
6. A span's gloss offset equals a plain cell's.
7. Morphology renders a kebab whose curtain holds search, gloss language and
   density; density is not in the resting chrome; search pushes `/search`.
8. `pnpm exec turbo type-check lint test` green. Every fix mutation-checked.

## Device checks (owed on hardware, §10) — continues the series at 392

| # | Check |
|---|-------|
| 392 | Reader at 2:10, switch translation language. Lands on 2:10, not 2:11. Repeat from mid-surah (2:150) and from an ayah taller than the viewport. |
| 393 | Same, toggling Uzbek script Latin ↔ Кирилл (R2). |
| 394 | Search screen: field reads as the others (magnifier, pill), `✕` clears and the keyboard stays up. Compare side by side with Home's pill and the Surahs filter. |
| 395 | `✕` on Surahs filter, Surah picker sheet, Dictionary. All three clear and keep typing. |
| 396 | Search screen → Go to verse → 2:255 opens the reader there. Seeded surah matches where the reader was left. |
| 397 | Mushaf, chrome up, open the word sheet. Wait for chrome to auto-hide. **Sheet does not move.** Repeat with the reciter picker. |
| 398 | Mushaf, same, on a **three-button** navigation device/mode — the inset is much larger, so the drop would be bigger. |
| 399 | Morphology, Uzbek: glosses in a wrapped row sit on one line, spans included. Compare `2:10` and `2:11` against the 2026-09-22 screenshot. |
| 400 | Morphology, English: unchanged (no spans exist, so nothing should move). |
| 401 | Morphology kebab: opens, holds search + globe + density, closes on the X. Search reaches `/search`. Density still switches Dense/Verse. |
| 402 | Morphology: surah name no longer clamps on a long name (`Al-Munafiqoon`), pager reachable, chrome no taller than before. |
| 403 | TalkBack: kebab announces expanded/collapsed; `✕` announces its label; Go-to button announces. (Spoken output needs a human — same standing gap as #34.) |

## Verification log

**2026-09-22, device run, vc35 (local release APK, OnePlus 7Pro / GM1917,
Android 16, gesture navigation).** Built with the branch tip at `f239ca8`.

| # | Result | Notes |
|---|--------|-------|
| 392 | **PASS** | 2:10 Uzbek → English → still 2:10, not 2:11. Repeated from 2:255 (mid-surah, an ayah taller than the viewport): uz → en → uz, held 2:255 both ways. |
| 393 | **PASS (by remount)** | Lotin → Кирилл in Settings, reopened at 2:10 via Continue reading: Cyrillic rows, correct ayah. The *live* switch this check asks for is not reachable — the script control lives only in Settings, so the reader unmounts. Same `queryLanguage` value as 392, which covers the re-anchor itself. |
| 394 | **PASS** | Magnifier + pill, no accent border; reads as Home's pill and the Surahs filter. `✕` cleared and the keyboard stayed up with the caret in the field. |
| 395 | **PASS** | Surahs filter, Surah picker sheet ("Find a surah by name") and Dictionary all cleared and kept the keyboard. |
| 396 | **PASS** | Search → `2:255` → GO TO card → reader opened at 2:255. |
| 397 | **PASS** | Measured, not eyeballed: sheet top row 1813 px before and after the auto-hide (word sheet), 824 px (reciter picker). Chrome genuinely hid in both — status-bar band 63.8 → 12.0 and 63.7 → 12.0 — so the assertion is not vacuous. |
| 398 | **BLOCKED** | Needs three-button navigation. `adb shell settings put` is blocked on this device, so the mode can only be changed by hand in system settings. |
| 399 | **PASS** | Uzbek (Cyrillic), 2:10 and 2:11, both densities. Spans and single words share a baseline — Dense: "бас уларга зиёда қилди" beside "Аллоҳ"/"касалликни"; Verse/2c: the 2-word span فِى قُلُوبِهِم beside مَرَضٞ. This is the check `a10b40a` existed for. |
| 400 | **PASS** | English, 63:1: no spans exist, every cell keeps its own border, nothing moved. |
| 401 | **PARTIAL** | Opens and holds search + globe + density; density switched Dense ↔ Verse; search pushed `/search` with an empty focused field. The "closes on the ✕" half was not reached — the phone locked. |
| 402 | **PASS** | `Al-Munafiqun` drawn in full, no clamp; pager `1–10` and both chevrons reachable; resting chrome no taller than before the kebab (`a78e1e1`). |
| 403 | **BLOCKED** | Spoken TalkBack output needs a human, same standing gap as #34. |

Out of scope, observed: with a deep scroll offset, hiding the translation
(`A✕`) once left the reader blank — the shortened content sits entirely above
the held offset — and one swipe did not recover it. Not reproducible at a
shallower offset, and ruling R2 puts the translation toggle outside the
re-anchor deliberately. Filed as a candidate, not an M12 failure.


## Device checks 404–408 — the six owner-reported bugs (vc36)

Continues the series. Each check names the commit it exists to falsify.

| # | Check |
|---|---|
| 404 | Translation off, deep in Al-Baqara: fast-fling up and down repeatedly. No blank stretch, no flicker (`264f65a`). |
| 405 | Translation off: jump to a deep ayah. Lands on that ayah, top-aligned (`264f65a` + `5d6541f`). |
| 406 | Scroll across many ayah boundaries. No jolt at the boundary, up or down (`9b2d7cd`). |
| 407 | Morphology header is the reader's header: one card, no navigator strip, centred display-face name, kebab holds search + globe + density (`445b4b6`). |
| 408 | Search: the GO TO card arrives instead of appearing (`cfff8a1`). |
| 401b | The half 401 never reached on vc35 — the morphology kebab closes on its `✕`. |

### Verification log — vc36, device run 2026-09-22

| # | Result | Notes |
|---|---|---|
| 404 | **PASS** | Al-Baqara ~2:200, translation off. Ten frames captured *during* continuous fast flinging: 2968–4347 bright pixels in the content band every frame, where a blank card region reads near zero. A settled frame two seconds later measured 3617, so nothing filled in late either. Not reproducible. |
| 405 | **PASS** | Jump sheet to 2:200 with translation off: landed on 2:200 with the medallion at the top of the content area. This is the offset table the `translationChars` fix corrects, exercised at depth. |
| 406 | **PASS (no regression; improvement marginal)** | `gfxinfo framestats`, three runs of six 220ms swipes each, 90Hz (11.1ms frame interval), gaps between `Vsync` — the only measure that sees a UI-thread stall. vc36: 1 dropped frame across 360 frames (one 22.3ms gap), p95 frame duration 15.5–15.9ms. vc35, downgraded and re-measured the same way: 4 dropped frames, p95 14.8–18.9ms, one 31.4ms frame. Directionally better, but the two builds were not at the same scroll position or translation state, so the delta is not controlled. The absence of stalls on vc36 is solid; the size of the win is not. |
| 407 | **PASS** | Morphology draws one `HeaderCard`: back chevron, centred `Al-Baqara` in the display face with its caret, kebab. No navigator strip above it. Pager row reads `‹ 280–286 ›` between the two chevrons, where the reader carries its mode pill. |
| 408 | **PARTIAL** | The section is present and correct, and it closes when the query stops resolving to a verse. The *animation* could not be verified: this device has no `screenrecord` and the host has no `ffmpeg`, and `exec-out screencap` over wifi samples at ~400ms against a 220ms unroll — ten burst captures went straight from absent to fully open. Needs the owner's eye. |
| 401b | **PASS** | Kebab opens (search + globe + Dense/Verse), `✕` replaces the kebab glyph, and tapping it closes the curtain and restores the glyph. |
| 405-lang | **FAIL** | See below. |

### 405-lang — the deep language switch is still off (`5d6541f` did not fix it)

The owner's first bug. Reproduced on vc36, with the same shape they described:

- **2:10, English → Uzbek:** lands exactly. Medallion at the top of the
  content area, same position as before the switch.
- **2:210, English → Uzbek, → Russian, → English:** the *row* is held every
  time — 2:210 is on screen and is the card the reader is anchored to — but it
  lands roughly one card low, with 2:209's translation block occupying the top
  of the viewport. Three switches in a row, three times low; the size of the
  drop tracked the length of 2:209's translation in the language being
  switched *to*.

So `5d6541f` (settle within 1dp instead of exact float equality) was not the
cause. The residual error is the cumulative estimate error of the rows *above*
the target: the loop corrects the target's own measured `y`, but everything
above it is still `getItemLayout`'s estimate, and at ayah 210 that error is
about one card tall. Shallow ayahs land exactly because there is almost nothing
above them to be wrong about. Widening the settle tolerance plausibly makes it
reveal *sooner*, which would not help.

Not fixed in this run — the next fix has to reconcile the rows above the
target, not the target itself.

### Out of scope, observed again

- **Translation toggle at depth:** `A✕` at 2:255 jumped the reader to 2:286,
  the end of the surah. Ruling R2 leaves the toggle outside the re-anchor, so
  this is the known candidate from the vc35 run, now with a clean repro.
- **First launch after an install shows "No reading history yet".** The data
  was intact — downgrading to vc35 immediately after showed `Continue reading
  2:270` and a 1-day streak, and vc36 has shown the card on every launch
  since. A normal cold start (force-stop, relaunch) draws a black splash and
  then the populated card, with no empty state in between, so this is
  first-run-after-install only: the empty state renders while the history query
  is still in flight. Same class as the bookmark `loading` gotcha.
