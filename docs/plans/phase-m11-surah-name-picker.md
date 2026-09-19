# Phase M11 — find a surah by name

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` or `superpowers:executing-plans`. Steps use `- [ ]`.

**Goal:** reach any surah without knowing its number, from every place a surah is asked for.

**Why:** all four entry points take digits only. `SurahJumpSheet` (reader, WbW) = two number fields. `PageJumpSheet` (mushaf) = segmented Page/Surah/Juz + one number field. Users know "Baqara", not 2.

**Architecture:** one pure matcher + one picker sheet. Three jump sheets gain a row that opens the picker; the Surahs tab and Search reuse the matcher directly, not the sheet.

**Tech:** existing only. No new dependency.

**Spec:** this file. Owner rulings below are the authority.

## Owner rulings (2026-09-19)

| # | Ruling |
|---|--------|
| R1 | Number fields stay untouched. A **separate "Browse surahs by name" row** under them opens the picker. Not a combo field. |
| R2 | Match **transliteration + meaning-in-UI-language + Arabic name**. |
| R3 | Tapping a surah **jumps straight to ayah 1** and closes both sheets. |
| R4 | Also: **Surahs tab filter field** and **Search screen suggestion**. Not bookmarks. |

**Consequence of R3, accepted:** name → a specific ayah is two passes. Browse al-Baqara, land 2:1, reopen Go-to (Sura now reads 2), type 255. Ayah-by-name in one pass was the cost of R3; R1 keeps the number path for anyone who knows it.

## Global constraints

- `packages/data` untouched. Matcher lives in `apps/mobile`. **If web ever needs it, promote to `@quran-corpus/data/client` — never copy it** (§2, §3 DRY).
- No new dependency (§12).
- UI strings through `t(uiLocale, key)`. Three locales: en, uz, ru.
- Matcher is a pure function, no client, no store. Untrusted input → §3 OWASP: it returns matches, never a query fragment.
- RTL/Arabic text through existing `AyahText`/`BrowseList` faces. No new font.
- Reduced motion respected by `BottomSheet` already.

## File structure

| File | Responsibility |
|---|---|
| `src/surah/matchSurah.ts` (new) | `normalizeLatin`, `normalizeArabic`, `matchSurahs(items, query)` → ranked `SurahListItem[]`. Pure. |
| `src/surah/matchSurah.test.ts` (new) | The matcher's whole contract. |
| `src/components/SurahPickerSheet.tsx` (new) | Filter field + `BrowseList` of 114. Calls `onPick(surahId)`. |
| `src/components/SurahPickerSheet.test.tsx` (new) | Renders, filters, picks. |
| `src/components/SurahJumpSheet.tsx` | Gains the browse row (R1) + `onPickSurah`. |
| `src/components/mushaf/PageJumpSheet.tsx` | Same row, surah kind only. |
| `src/components/SurahReader.tsx`, `src/screens/WbwScreen.tsx`, `src/screens/MushafScreen.tsx` | Own the picker's open state; route the jump. |
| `src/screens/SurahsScreen.tsx` | Filter field over `mode === 'surah'`. |
| `src/screens/SearchScreen.tsx` | Suggestion row above results. |
| `src/i18n/uiStrings.ts` | New keys ×3 locales. |
| `src/data/surahNames.ts` (new, only if needed) | One cached `getSurahList` read shared by picker call sites. Decide in Task 3, not before. |

## Risks

| Risk | Mitigation |
|---|---|
| Arabic match finds nothing (NFC + diacritics), exactly like the form/lemma join | `normalizeArabic` NFCs **both sides in one pass** and strips harakat + tatweel. Test asserts a diacritic-free query hits a diacritic-bearing name. See `form-lemma-nfc-mismatch`. |
| Meaning arm matches everything ("The …") | Rank: translit prefix > translit substring > Arabic > meaning. Meaning never outranks a translit hit. |
| Sheet-over-sheet: picker opened from a jump sheet | Picker replaces the jump sheet rather than stacking — jump sheet closes on open, both stay closed after a pick (R3). |
| `useAnimatedKeyboard` reads 0 inside a Modal | Reuse `SearchScreen`'s keyboard handling, not Reanimated's. See `reanimated-keyboard-blind-in-modal`. |
| 114 rows re-render per keystroke | Debounce like `SearchScreen`; `useMemo` the filtered array. Measure only if device check 3 shows lag. |
| Metro watcher dead here | Every device build: `expo start --clear`. |

## Rollback

Each task is one commit. The picker is additive — reverting Tasks 3-7 leaves the number fields exactly as they ship today.

---

### Task 1: the matcher

**Files:** Create `src/surah/matchSurah.ts`, `src/surah/matchSurah.test.ts`.

**Interfaces — Produces:**
```ts
export function matchSurahs(items: readonly SurahListItem[], query: string): SurahListItem[];
```
Empty/whitespace query → `items` unchanged (the picker shows all 114 at rest).

- [ ] **Step 1: failing test.** Cases, each asserting ids:
  - `'baqara'`, `'Baqarah'`, `'bakara'`, `'al-baqara'`, `'AL BAQARA'` → all include 2 first.
  - `'cow'` (en meaning) → 2. `'sigir'` under a uz row → 2.
  - `'البقرة'` and `'البقره'`-without-harakat → 2.
  - `'2'` → 2 first (digits still work inside the picker).
  - `'yasin'`, `'ya-sin'`, `'yaseen'` → 36.
  - `''` → all 114, original order.
  - `'zzzz'` → `[]`.
  - Rank: a query that is a translit prefix of one surah and appears in another's meaning puts the translit hit first.
- [ ] **Step 2:** `npx vitest run src/surah/matchSurah.test.ts` → FAIL, module not found.
- [ ] **Step 3: implement.** `normalizeLatin`: lowercase, NFD-strip combining marks, drop `-'ʿʾ` and whitespace, drop a leading `al`, then fold `aa→a ee→i ii→i oo→u uu→u q→k th→t dh→d kh→h gh→g` — **fold both query and candidate**, so `bakara`/`baqarah` collapse to one key. `normalizeArabic`: NFC, strip `ً-ْٰـ`, drop the `ال` prefix. Rank as the risk table states; stable sort by id inside a rank.
- [ ] **Step 4:** tests PASS.
- [ ] **Step 5: mutation-check (§4.4).** Delete the leading-`al` strip → `'al-baqara'` case must fail. Delete the NFC in `normalizeArabic` → the Arabic case must fail. Restore **by re-editing**, never `git checkout` (`never-git-stash-for-a-baseline`).
- [ ] **Step 6: commit.** `feat(mobile): match a surah by transliteration, meaning or Arabic name`

### Task 2: the picker sheet

**Files:** Create `src/components/SurahPickerSheet.tsx`, `.test.tsx`.

**Interfaces — Consumes:** `matchSurahs`. **Produces:**
```ts
export interface SurahPickerSheetProps {
  surahs: readonly SurahListItem[];
  uiLocale: UiLocaleCode;
  onPick: (surahId: number) => void;   // R3: caller jumps to ayah 1
  onClose: () => void;
}
```

- [ ] **Step 1: failing test.** Renders 114 rows at rest; typing `baqara` leaves one; tapping it calls `onPick(2)`; a no-match query renders the empty line, not a blank sheet.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implement.** `BottomSheet` + `SheetHeader` + a `TextInput` styled like `SurahJumpSheet`'s fields + `BrowseList` fed by `SurahList`'s existing row mapping (glyph, translit, meaning·count). **Reuse `SurahList`, do not re-map rows.** `accessibilityLabel` per row stays the translit — a PUA glyph announces as nothing.
- [ ] **Step 4:** tests PASS.
- [ ] **Step 5: commit.** `feat(mobile): a surah picker sheet, filtered by name`

### Task 3: surah list, once

**Files:** Modify whichever call sites need it; create `src/data/surahNames.ts` only if two or more screens would otherwise each load the list.

- [ ] **Step 1:** check what `SurahsScreen`, `SurahReader`, `WbwScreen`, `MushafScreen` already hold. `SurahsScreen` loads `getSurahList` already.
- [ ] **Step 2:** if ≥2 new loaders would appear, add a tiny cached reader keyed by `nameLanguage`; otherwise load in each screen and say so in the commit body. **Decide from what you find, do not build the cache speculatively.**
- [ ] **Step 3:** tests for whatever you added. No cache → no test, nothing new to break.
- [ ] **Step 4: commit.** `refactor(mobile): one surah-name read for the picker's call sites` (skip the commit entirely if nothing was extracted)

### Task 4: the three jump sheets

**Files:** Modify `SurahJumpSheet.tsx`, `mushaf/PageJumpSheet.tsx` and their tests.

- [ ] **Step 1: failing tests.** Each sheet renders a `browse-surahs` row; pressing it fires `onBrowse`. `PageJumpSheet`'s row appears in **every** kind (it sets the surah, then jumps by surah) — assert it is present on `page` too, and that pressing it does not submit the number field.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implement.** New optional prop `onBrowse?: () => void`; render the row under the fields behind a divider, above `SheetActions`. Optional so a caller that has no picker mounted renders no dead row.
- [ ] **Step 4:** tests PASS.
- [ ] **Step 5: commit.** `feat(mobile): a browse-by-name row on the jump sheets`

### Task 5: wire the three screens

**Files:** Modify `SurahReader.tsx`, `WbwScreen.tsx`, `MushafScreen.tsx` + their tests.

- [ ] **Step 1: failing tests.** Per screen: open jump sheet → press browse → jump sheet gone, picker shown → pick 36 → picker gone and the screen navigated to 36:1 (mushaf: to 36's page). Assert **both** sheets are closed after a pick — sheet-over-sheet is the named risk.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implement.** One `'jump' | 'picker' | null` state per screen, never two booleans — two booleans is how both end up open. Mushaf routes through its existing `onJump('surah', id)`, so no new page lookup.
- [ ] **Step 4:** tests PASS.
- [ ] **Step 5: mutation-check.** Make the pick handler leave the jump sheet open → the "both closed" assertion must fail.
- [ ] **Step 6: commit.** `feat(mobile): browse to a surah from the reader, WbW and mushaf`

### Task 6: Surahs tab filter (R4)

**Files:** Modify `src/screens/SurahsScreen.tsx` + `SurahsTab.test.tsx`.

- [ ] **Step 1: failing test.** A filter field shows in `surah` mode and **not** in juz/page/revealed mode; typing narrows the list; switching mode clears the query; an empty result renders the empty line.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implement.** Local `query` state, `useMemo(matchSurahs)`, cleared in the existing mode-change effect. Sections untouched — this is the flat `surah` mode only.
- [ ] **Step 4:** tests PASS.
- [ ] **Step 5: commit.** `feat(mobile): filter the surah index by name`

### Task 7: Search suggestion (R4)

**Files:** Modify `src/screens/SearchScreen.tsx` + `SearchScreen.test.tsx`.

- [ ] **Step 1: failing test.** Query `baqara` renders one "Go to Al-Baqara" row **above** the text results; tapping it opens 2:1; a query matching no surah renders no row; the row never replaces or suppresses the text results.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implement.** Top match only, `matchSurahs(...)[0]`, rendered above the list. Search still means "find these words" — the row is an addition, never a redirect.
- [ ] **Step 4:** tests PASS.
- [ ] **Step 5: commit.** `feat(mobile): offer the matching surah above search results`

### Task 8: strings + full gate

**Files:** `src/i18n/uiStrings.ts`, any test asserting key completeness.

- [ ] **Step 1:** add `surahPicker.browse`, `surahPicker.title`, `surahPicker.filter`, `surahPicker.empty`, `search.goToSurah` in en/uz/ru. Uzbek and Russian written, not English placeholders.
- [ ] **Step 2:** `npx tsc --noEmit`, `npx eslint src`, `npx vitest run` — all green.
- [ ] **Step 3: commit.** `feat(mobile): strings for the surah picker`

---

## Acceptance criteria

1. `matchSurahs` is the only matcher in the app; no screen filters names itself.
2. `'bakara'`, `'baqarah'`, `'al-baqara'`, `'cow'`, `'البقرة'` all reach surah 2.
3. Every jump sheet offers the browse row; picking jumps to ayah 1 and leaves no sheet open.
4. Surahs tab filters in `surah` mode only; Search offers the surah above its results.
5. `packages/data` unchanged — `git diff --stat main -- packages/` is empty.
6. tsc, eslint and vitest green.
7. Device checks below all pass on a release APK (§10).

## Device checks (owed on hardware, §10)

| # | Check |
|---|---|
| 380 | Reader → Go to → Browse: the jump sheet closes as the picker opens. No stacked scrims. |
| 381 | Type `baqara` with the keyboard up: results visible above the keyboard, sheet not clipped (`reanimated-keyboard-blind-in-modal`). |
| 382 | Typing is smooth across all 114 rows — no dropped frames per keystroke. |
| 383 | Pick al-Baqara: reader lands on 2:1, both sheets gone. |
| 384 | Same from WbW, and from mushaf Go-to → the page holding 2:1. |
| 385 | Arabic query: type `البقرة` with an Arabic keyboard → surah 2. |
| 386 | Under Uzbek UI, the meaning arm matches the Uzbek meaning, and the glyph column still renders. |
| 387 | Surahs tab: filter narrows, switching to Juz clears it and shows the full juz list. |
| 388 | Search `baqara`: the go-to row sits above the text results and both work. |
| 389 | TalkBack: each picker row announces its translit, and the filter field is labelled. |

## Verification log

_Empty until the device run. "Implementation complete, verification pending" is not a pass (§10)._
