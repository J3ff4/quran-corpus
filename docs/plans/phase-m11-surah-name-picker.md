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
| R5 | **Label the Go-to fields.** Two bare boxes showing `1-114` and `1-286` never said which was which, and the placeholder -- the only hint -- is gone on the first keystroke. |
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

### Task 0: name the Go-to fields (R5) — DONE, `7cc1477`

Landed ahead of the rest: it is a two-line fix to a defect the picker does not
solve, and the picker's browse row goes under these same fields.

- [x] Caption above each field in `SurahJumpSheet`, from the existing
  `jump.surah` / `jump.ayah` strings (already written in en/uz/ru, so no i18n
  work). `importantForAccessibility="no"` on the caption: each input already
  carries its name **and** its range in `accessibilityLabel`, so an announced
  caption would say "Surah" twice before the range.
- [x] Test: both names render on screen. Mutation-checked — deleting the Sura
  caption fails it.
- [x] `PageJumpSheet` needs nothing: its segmented control names the kind its
  single field is asking for.

### Task 1: the matcher — DONE, `38a236e`, reworked in `5c170fd`

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

### Task 2: the picker sheet — DONE, `d611a4d`

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

### Task 3: surah list, once — DONE, `0aaf2c5`

**Files:** Modify whichever call sites need it; create `src/data/surahNames.ts` only if two or more screens would otherwise each load the list.

- [ ] **Step 1:** check what `SurahsScreen`, `SurahReader`, `WbwScreen`, `MushafScreen` already hold. `SurahsScreen` loads `getSurahList` already.
- [ ] **Step 2:** if ≥2 new loaders would appear, add a tiny cached reader keyed by `nameLanguage`; otherwise load in each screen and say so in the commit body. **Decide from what you find, do not build the cache speculatively.**
- [ ] **Step 3:** tests for whatever you added. No cache → no test, nothing new to break.
- [ ] **Step 4: commit.** `refactor(mobile): one surah-name read for the picker's call sites` (skip the commit entirely if nothing was extracted)

### Task 4: the three jump sheets — DONE, `ea14dbb`

**Files:** Modify `SurahJumpSheet.tsx`, `mushaf/PageJumpSheet.tsx` and their tests.

- [ ] **Step 1: failing tests.** Each sheet renders a `browse-surahs` row; pressing it fires `onBrowse`. `PageJumpSheet`'s row appears in **every** kind (it sets the surah, then jumps by surah) — assert it is present on `page` too, and that pressing it does not submit the number field.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implement.** New optional prop `onBrowse?: () => void`; render the row under the fields behind a divider, above `SheetActions`. Optional so a caller that has no picker mounted renders no dead row.
- [ ] **Step 4:** tests PASS.
- [ ] **Step 5: commit.** `feat(mobile): a browse-by-name row on the jump sheets`

### Task 5: wire the three screens — DONE, `fe56f6f`

**Files:** Modify `SurahReader.tsx`, `WbwScreen.tsx`, `MushafScreen.tsx` + their tests.

- [ ] **Step 1: failing tests.** Per screen: open jump sheet → press browse → jump sheet gone, picker shown → pick 36 → picker gone and the screen navigated to 36:1 (mushaf: to 36's page). Assert **both** sheets are closed after a pick — sheet-over-sheet is the named risk.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implement.** One `'jump' | 'picker' | null` state per screen, never two booleans — two booleans is how both end up open. Mushaf routes through its existing `onJump('surah', id)`, so no new page lookup.
- [ ] **Step 4:** tests PASS.
- [ ] **Step 5: mutation-check.** Make the pick handler leave the jump sheet open → the "both closed" assertion must fail.
- [ ] **Step 6: commit.** `feat(mobile): browse to a surah from the reader, WbW and mushaf`

### Task 6: Surahs tab filter (R4) — DONE, `0ef55ba`

**Files:** Modify `src/screens/SurahsScreen.tsx` + `SurahsTab.test.tsx`.

- [ ] **Step 1: failing test.** A filter field shows in `surah` mode and **not** in juz/page/revealed mode; typing narrows the list; switching mode clears the query; an empty result renders the empty line.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implement.** Local `query` state, `useMemo(matchSurahs)`, cleared in the existing mode-change effect. Sections untouched — this is the flat `surah` mode only.
- [ ] **Step 4:** tests PASS.
- [ ] **Step 5: commit.** `feat(mobile): filter the surah index by name`

### Task 7: Search suggestion (R4) — DONE, `0f0d1fa`, mostly pre-existing

**Files:** Modify `src/screens/SearchScreen.tsx` + `SearchScreen.test.tsx`.

- [ ] **Step 1: failing test.** Query `baqara` renders one "Go to Al-Baqara" row **above** the text results; tapping it opens 2:1; a query matching no surah renders no row; the row never replaces or suppresses the text results.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implement.** Top match only, `matchSurahs(...)[0]`, rendered above the list. Search still means "find these words" — the row is an addition, never a redirect.
- [ ] **Step 4:** tests PASS.
- [ ] **Step 5: commit.** `feat(mobile): offer the matching surah above search results`

### Task 8: strings + full gate — DONE, folded into `d611a4d`

**Files:** `src/i18n/uiStrings.ts`, any test asserting key completeness.

- [ ] **Step 1:** add `surahPicker.browse`, `surahPicker.title`, `surahPicker.filter`, `surahPicker.empty`, `search.goToSurah` in en/uz/ru. Uzbek and Russian written, not English placeholders.
- [ ] **Step 2:** `npx tsc --noEmit`, `npx eslint src`, `npx vitest run` — all green.
- [ ] **Step 3: commit.** `feat(mobile): strings for the surah picker`

---

## What the build actually did, and why it differs

Three things the plan did not know. Each is a deviation from the text above;
the text above is left as written so the difference is visible.

**1. The picker is a full-screen Modal, not a BottomSheet.** `BottomSheet`'s pan
gesture wraps its whole children tree with no `simultaneousWithExternalGesture`
composition, so a scrolling list inside it fights the sheet's own drag -- the
same reason `ReciterSheet` has no ScrollView. Ten reciter rows fit without one;
114 surahs and a keyboard do not. Composing those gestures is surgery on a
component every sheet in the app depends on, for a list that wants the whole
screen anyway. File is `SurahPicker.tsx`, not `SurahPickerSheet.tsx`.

**2. The fold was already written, in `packages/data`.** Task 1 shipped its own
normalizer; `packages/data/src/text/surahName.ts` has existed since `1aca65a`,
where `search.ts` resolves typed surah names with it, and it is strictly better:
Uzbek `o` dual readings (`Rahmon`/`Rahman`), a sun-letter article table, and the
rule that keeps English meanings out of the Arabic fold -- which my meaning arm
was violating in exactly the way its comment warns about (`moon` folds onto
surah 76's `The Man`). `5c170fd` deletes the duplicate and re-exports the shared
functions through `mobile.ts`. Two behaviours moved to match search rather than
beat it: `yaseen` no longer resolves, and a two-letter fragment no longer
matches (`SURAH_NAME_MIN_PREFIX` is 3). One answer in both places beats a better
answer in one.

**This is the plan's own Global Constraint being broken deliberately**: it said
`packages/data` untouched. What landed there is five re-export lines of pure
string modules with no runtime imports -- no schema, no query, no validation --
and the entry-point guards (`mobile-entry.test.ts`, `client-entry.test.ts`) pass
unchanged. Under §5 that is not a trigger; it is named here so the call is
visible rather than buried.

**3. Task 7 was mostly already shipped.** `search.ts` has folded surah names
since `1aca65a`, so `baqara` always produced a jump card -- labelled with a bare
number, which for a surah-level jump is the entire label. What Task 7 added is
the name beside it. No new query, no second matcher, and the verse results
underneath are untouched.

## Acceptance criteria

1. `matchSurahs` is the only matcher in the app; no screen filters names itself.
2. `'bakara'`, `'baqarah'`, `'al-baqara'`, `'cow'`, `'البقرة'` all reach surah 2.
3. The Go-to fields are named on screen (R5). Every jump sheet offers the browse row; picking jumps to ayah 1 and leaves no sheet open.
4. Surahs tab filters in `surah` mode only; Search offers the surah above its results.
5. ~~`packages/data` unchanged~~ — superseded, see deviation 2: five re-export
   lines, no schema, no query, no validation, entry-point guards green.
6. tsc, eslint and vitest green.
7. Device checks below all pass on a release APK (§10).

## Device checks (owed on hardware, §10)

| # | Check |
|---|---|
| 379 | Go to, from the reader: the Sura and Ayah fields are named on screen, and the names stay visible while typing. Same under Uzbek and Russian, where "Sura"/"Oyat" and "Сура"/"Аят" must not clip at the field width. |
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
| 390 | Picker: one tap on a row opens the surah while the keyboard is still up -- not two. Same on the Surahs tab with the filter typed in. (keyboardShouldPersistTaps; review finding 1.) |
| 391 | Picker: the title sits one normal gap below the status bar, not a status bar's worth of dead space. Check with the clock visible, and in dark mode. (statusBarTranslucent; review finding 2 -- the Modal shim renders a Fragment, so no unit test can defend this.) |

## Verification log

### Run 1 — 2026-09-21, vc24 release APK, OnePlus 7Pro (GM1917), Android 13, dark mode

11 pass, 1 partial, 1 blocked.

| # | Result | Evidence |
|---|---|---|
| 379 | PASS | English `Surah`/`Ayah`, Uzbek `Sura`/`Oyat`, Russian `Сура`/`Аят` — all named above their fields, none clipped. Labels stay visible while typing: the sheet lifts above the keyboard and the row keeps both label and field on screen. |
| 380 | PASS | Reader → title → `Find a surah by name`: the jump sheet is gone when the picker paints. One surface, no stacked scrim. |
| 381 | PASS | `baqara` typed with the keyboard up — the single result sits well clear of the keyboard, nothing clipped. |
| 382 | PASS | `dumpsys gfxinfo framestats`, 3 passes of 6 keystrokes over the full 114-row list: frame duration median 11.8/12.2/12.0 ms, deadline misses 3/0/5 of ~27 frames, worst frame 32.1 ms. One late frame in the worst pass, no per-keystroke stutter. (Vsync *gaps* are the 350 ms typing cadence, not jank — duration is the measure here.) |
| 383 | PASS | From surah 2, picked Ya-Sin → reader opens at 36:1, both sheets gone. See the defect note below for the same-surah case. |
| 384 | PASS | WbW (Ya-Sin → `nuh` → Nuh 1-10, ayah 1) and mushaf (Go to → `ikhlas` → page 604, which holds 112:1). |
| 385 | BLOCKED | `adb shell input text 'البقرة'` → `java.lang.NullPointerException: Attempt to get length of null array`. adb cannot inject non-ASCII; needs an Arabic keyboard typed by hand. Owed. |
| 386 | PASS | Uzbek UI: rows read `Baqara / Sigir · 286 oyat`, `sigir` matches surah 2, glyph column renders throughout. |
| 387 | PASS | `light` narrows to An-Nur; switching to Juz drops the filter field and shows Juz 1-30 in full. |
| 388 | PASS | `cow`: `GO TO → 2 Al-Baqara` above `VERSES → 2:69, 2:67`. Both arms live; the go-to row opens 2:1 on one tap. (`baqara` alone returns the go-to row and no verses — correct, no translation contains the word.) |
| 389 | PARTIAL | Machine half verified from the a11y tree: every row is a Button with `content-desc` = translit + ayah count (`Al-Baqara, 286 аятов`), the filter is an EditText labelled `Название или смысл`, the close button is `Закрыть`. Spoken output not verified — enabling TalkBack needs `settings put secure`, which is blocked in this session. Same standing gap as issue #34. |
| 390 | PASS | Both halves. Picker: one tap on `Al-Baqara` under the open keyboard opened the reader. Surahs tab: one tap on the `light` → An-Nur row under the open keyboard opened An-Nur. The review's two-tap defect is gone. |
| 391 | PASS | Measured on the raw screenshot: status-bar clock spans y 48-92 px, the `Surahs` title starts at y 200 px — a 108 px (~27 dp) gap at density 640. A doubled inset would have put the title near y 300. Dark mode, clock visible. |

### Findings from the run (neither blocks M11)

1. **Russian surah names fall back to English.** Under a Russian UI the rows read `Al-Fatiha / The Opening · 7 аятов` — only the ayah-count unit localizes. Not a picker bug: `surah_names` holds `uz` (114) and `uz-Cyrl` (114) and nothing else, so `nameLang='ru'` has no rows to find and the surahs table's own English is what comes back. A data gap, tracked separately.
2. **Picking the surah you are already reading does nothing.** From surah 2 at ayah 5, picking al-Baqara in the picker closed both sheets and left the scroll position untouched, rather than landing on 2:1. `jumpTo` only navigates on its cross-surah arm. Check 383 is written for the cross-surah case and passes there; this is the same-surah case the check does not cover.

No stray writes to the user DB: a mis-tap landed on ayah 2:6's bookmark control mid-run, and the bookmarks screen afterwards read `0 oyat · 0 sura`.

### Run 2 — 2026-09-21, vc33/vc34 release APKs, OnePlus 7Pro (GM1917), Android 12

Ran against the three commits after Run 1: `2c0380c` (Cyrillic fold),
`33fea40` (the five defects the independent read found), `2d1f538` (m11b).
Bundle contents probed from the Hermes string table before each install, not
assumed from a timestamp — `[Ѐ-ӿ]` present **once** (shared romanizer in,
mobile's duplicate gone), `FROM reading_days`/`FROM root_views` present,
`m11b` present and `m11a` absent.

| # | Result | Evidence |
|---|--------|----------|
| Cyrillic search (Run 1 finding, and the defect the owner reported) | PASS | `бакара` typed by hand in Search finds al-Baqara. Owner-confirmed. adb cannot inject non-ASCII (check 385's blocker), so this half is human-only and stays that way. |
| Cleanup loop vs the user DB (#92/#96) | PASS | vc34, 23:13:13 `[corpus db] removing stale extract quran-corpus-m11a.db`, then 23:13:14 `[user db] backed up 7 rows to .../backups/quran-corpus-user.db.backup`. First time that loop has run on hardware since the guard was fixed; it swept the old 134 MB extract and the user DB came through it. |
| Widened empty-guard count | PASS | 7 rows, where vc33 logged 6. The two extra are `reading_days` and `root_views` — the tables `countUserRows` omitted, so a device holding only a reading streak counted zero and `backUp` declined to protect it. |
| Install retains data | PASS | `adb install -r --user 0`, `update=1`, `firstInstallTime` unchanged at 2026-08-31 across both installs. |
| No crash / no schema miss | PASS | Zero `FATAL`, zero `AndroidRuntime` for the package, no `no such table` after the re-extract. (`SQLiteLog` double-quoted-literal warnings in the same log are pid 4052, another app.) |

**Still owed, and why.**

1. **The `.partial` staging race is test-verified only.** `restoreIfMissing`
   stages to `quran-corpus-user.db.partial`, which matched the extract
   pattern while the skip guard tested `=== name` plus a `-` arm — a dot
   matched neither. Both run unsequenced at launch and the loop only runs on
   a version-bump launch, which is exactly when a restore happens. It is a
   race, so Run 2 could not reproduce the collision either way; what it
   proves is the loop's normal path.
2. **The restore path has never run on hardware.** Provoking it means
   deleting the live user DB, and a non-debuggable release build gives no
   route into app storage. `[user db] ... has been RESTORED from ...` has
   never printed on device.
3. **#96's original cause is still unexplained.** The install, the cleanup
   loop, storage pressure and the app's own write path were each ruled out
   with evidence, and the owner did not clear the data. What changed is
   containment, not diagnosis: a recurrence now has a copy to come back from.
4. Check 385 (Arabic typed by hand) and check 389's spoken TalkBack output
   (issue #34) remain owed from Run 1.
