# Phase M7f — Surah Jump & Calligraphic Surah Names Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reach any surah+ayah from the reader and morphology headers by tapping the surah name, and draw the surah index in the V4 calligraphic face.

**Architecture:** Two independent pieces of the owner's original item list that M7e did not deliver. One new sheet (`SurahJumpSheet`) modelled on the mushaf's `PageJumpSheet`, wired into both headers behind the surah name; one new optional field on `BrowseItem` so a row can draw its Arabic in the surah-name face instead of the reading face. No new dependency, no schema change.

**Spec:** none. Authority is the owner's 2026-09-11 rulings (S1-S4 below), transcribed verbatim.

## Global Constraints

- Mobile only. `apps/web` untouched.
- **No new npm dependency** (§12). Everything here is servable by what is installed.
- No `packages/data` schema or query change, no trust boundary beyond the jump sheet's own input validation, no on-device user-DB write. **§5 independent review applies to the jump sheet's parser only** — it is user input reaching a query (§3 OWASP). The rest ships on §4.
- `packages/config` stays free of web/Next/Expo/RN imports (§2).
- Reduced motion respected via `useReducedMotion` (§8).
- WCAG AA: ≥48dp targets, `accessibilityLabel` on every icon-only control, state via `accessibilityState` (§8).
- No new English string without Uzbek and Russian beside it. `uiStrings.test.ts` greps sources for literal keys — **write keys out, never assemble them**.
- Conventional Commits, one logical change each (§9).
- Branch `feat/m7f-jump-and-glyphs`. **Base: `feat/m7e-header-polish`**, because T3/T4 edit the header rows M7e built and PR #69 is still open. Rebase onto `main` if #69 merges first.

## Owner Rulings (2026-09-11)

| # | Ruling |
|---|---|
| S1 | Surah index: the V4 glyph **replaces the right-hand Arabic name**. Row layout otherwise unchanged. |
| S2 | Jump by **surah + ayah**. |
| S3 | **Tap the surah name** to open the jump sheet. No new button. The `‹ ›` chevrons stay for stepping one surah. |
| S4 | **Both** the reader and morphology get it. |

Standing, from M7e: colour-v4 is dead (no CPAL palette control from RN, no licence grant). This phase uses the **monochrome** `SurahNameV4.ttf` already bundled and already registered in `openCorpusDb.ts`.

## Facts established before planning (do not re-derive)

- `SurahNameV4.ttf` covers **all 114** PUA codepoints — verified 2026-09-11. `needsSurahNameFallback` exists for **V2**'s missing surah 102 and is **not** needed here.
- Both faces are registered already (`openCorpusDb.ts:171-172`); `fonts.surahNameAlt` is the V4 family.
- `surahNameGlyph(id)` in `@quran-corpus/config/ornaments/surahName` returns the PUA character. The glyph draws the whole phrase (`سورة الفاتحة`), not the bare name.
- The mushaf's `parseJumpTarget` (`PageJumpSheet.tsx`) is the validation shape to follow: digits only, integer, in range, `null` otherwise.
- `getSurahList` (`corpusRepository.ts:102`) is the only existing source of per-surah `ayahCount`.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `apps/mobile/src/components/BrowseList.tsx` | `arabicFace?: 'reading' \| 'surahName'` on a row | T1 |
| `apps/mobile/src/components/SurahList.tsx` | passes the glyph + face | T1 |
| `apps/mobile/src/data/useSurahAyahCounts.ts` | **new** — id → ayahCount, loaded once | T2 |
| `apps/mobile/src/components/SurahJumpSheet.tsx` | **new** — surah + ayah, validated | T2 |
| `apps/mobile/src/screens/WbwScreen.tsx` | name becomes the jump control | T3 |
| `apps/mobile/src/components/ReaderHeader.tsx` | same, plus the faded-title guard | T4 |
| `apps/mobile/src/components/SurahReader.tsx` | owns the sheet, applies the jump | T4 |
| `apps/mobile/src/i18n/uiStrings.ts` | new keys ×3 locales | T2 |

## Pre-flight conflict scan

| Pair / task | Shared surface | Finding |
|---|---|---|
| T1 ↔ T5 (M7e) | `BrowseItem` | M7e added `children`; T1 adds `arabicFace`. Both optional, no overlap. Clean. |
| T1 ↔ juz children | `arabic` field | Juz children carry no `arabic`, so S1 does not reach them. Clean — and it is what the owner asked for, index only. |
| T2 ↔ T3, T2 ↔ T4 | `SurahJumpSheet` | Both consumers. T2 first. Clean. |
| T3 ↔ M7e T4 | `wbw-title-row` | T3 wraps the existing `<Text>` in a Pressable. Same row, no restructure. Clean. |
| T4 ↔ M7e T3 | reader row 1 | The name is an `Animated.Text` faded by `titleStyle`, owned by `SurahReader`. **Conflict:** a tappable control at opacity 0 is an invisible hit target at the top of every surah. **Ruling: the reader's name is only tappable once it has faded in.** `SurahReader` already computes the fade, so it passes a `titleVisible` boolean and `ReaderHeader` sets `disabled` + `pointerEvents` from it. Cost if wrong: one tap does nothing at the very top of a surah, where the list's own heading is on screen and the name is legible there instead. |
| T2 self | ayah range | Max ayah is per-surah (2:286 vs 1:7), so the parser cannot use one constant. `useSurahAyahCounts` supplies it; **while it is still loading the sheet accepts surah only** and the ayah field is disabled, rather than validating against a guess. |

---

### Task 1: The surah index in the calligraphic face

**Files:**
- Modify: `apps/mobile/src/components/BrowseList.tsx`
- Modify: `apps/mobile/src/components/SurahList.tsx`
- Test: `apps/mobile/src/components/BrowseList.test.tsx`, `apps/mobile/src/components/SurahList.test.tsx`

**Interfaces:**
- Consumes: `surahNameGlyph` from `@quran-corpus/config/ornaments/surahName`, `fonts.surahNameAlt`.
- Produces: `BrowseItem.arabicFace?: 'reading' | 'surahName'`. Absent = today's reading face, so juz/page/revealed rows are untouched.

- [ ] **Step 1: Write the failing tests**

```tsx
it('draws the surah name in the calligraphic face', () => {
  // Ruling S1. The face is the point: in the reading face this row shows the
  // same string every other Arabic run uses, and the surah index is the one
  // list where the name is a title rather than text to be read.
  render(<SurahList surahs={[alFatihah]} uiLocale="en" onOpenSurah={vi.fn()} />);

  const arabic = screen.getByTestId('browse-arabic-surah-1');
  expect(arabic.style.fontFamily).toContain('SurahNameV4');
  // 0xE000 + 1. The glyph, not the name -- a row still passing nameArabic
  // would render الفاتحة in a font that has no glyph for it, i.e. tofu.
  expect(arabic.textContent).toBe(String.fromCodePoint(0xe001));
});

it('leaves every other browse row in the reading face', () => {
  // Juz, page and revealed rows carry no arabicFace, and a default that
  // reached them would put a surah-name font on text it has no glyphs for.
  render(<BrowseList items={[item({ arabic: 'البقرة' })]} />);
  expect(screen.getByTestId('browse-arabic-juz-1').style.fontFamily).not.toContain('SurahName');
});
```

`Icon`-style `testID` needs adding to the `arabic` `<Text>` in `Row` (`browse-arabic-${item.key}`) — it has none today.

- [ ] **Step 2: Run, confirm fail.** `npx vitest run src/components/BrowseList.test.tsx src/components/SurahList.test.tsx`

- [ ] **Step 3: Implement**

`BrowseItem` gains:

```ts
  /** Which face the `arabic` slot is drawn in.
   *
   *  'surahName' is the calligraphic V4 face, whose glyphs live in a private
   *  use area -- it has NO glyph for ordinary Arabic text, so a row passing
   *  real Arabic with this face renders tofu. Only pass it with the output of
   *  `surahNameGlyph` (ruling S1). Absent = the reading face. */
  arabicFace?: 'reading' | 'surahName';
```

In `Row`, the `arabic` Text:

```tsx
        {item.arabic ? (
          <Text
            testID={`browse-arabic-${item.key}`}
            style={{
              color: theme.text,
              fontFamily: item.arabicFace === 'surahName' ? fonts.surahNameAlt : fonts.arabic,
              // The calligraphic glyph carries its own generous side bearings
              // and sits on its own baseline, so it needs more box than a
              // 26pt reading run to avoid clipping its tail.
              fontSize: item.arabicFace === 'surahName' ? 30 : 26,
              textAlign: 'right',
            }}
          >
            {item.arabic}
          </Text>
        ) : null}
```

**V4, not V2** (`fonts.surahNameAlt`, not `fonts.surahName`): V2 has no glyph for surah 102 and would draw tofu on At-Takathur. V4 covers all 114 — verified 2026-09-11, see the facts section. Do not "simplify" this to the mushaf band's V2.

In `SurahList`, replace `arabic: surah.nameArabic` with:

```tsx
        arabic: surahNameGlyph(surah.id),
        arabicFace: 'surahName',
```

The `accessibilityLabel` does **not** change: it already names the surah in the UI locale, and a PUA codepoint announces as nothing.

- [ ] **Step 4: Run, confirm pass.** Then `npx tsc --noEmit && npx eslint src --max-warnings=0`.

- [ ] **Step 5: Mutation-check**

1. Swap `fonts.surahNameAlt` → `fonts.arabic`; the face test must FAIL.
2. Restore `arabic: surah.nameArabic` in `SurahList`; the glyph assertion must FAIL.
3. Make `arabicFace` default to `'surahName'`; the other-rows test must FAIL.

Restore by re-editing each time — never `git checkout`.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/BrowseList.tsx apps/mobile/src/components/SurahList.tsx \
        apps/mobile/src/components/BrowseList.test.tsx apps/mobile/src/components/SurahList.test.tsx
git commit -m "feat(mobile/browse): name each surah in its own calligraphy"
```

---

### Task 2: SurahJumpSheet

**Files:**
- Create: `apps/mobile/src/data/useSurahAyahCounts.ts`
- Create: `apps/mobile/src/components/SurahJumpSheet.tsx`
- Modify: `apps/mobile/src/i18n/uiStrings.ts`
- Test: `apps/mobile/src/components/SurahJumpSheet.test.tsx`

**Interfaces:**
- Consumes: `BottomSheet`, `SheetHeader`, `SheetActions`, `getSurahList`.
- Produces:
  ```ts
  export function parseSurahJump(
    raw: string, max: number,
  ): number | null;
  export interface SurahJumpSheetProps {
    uiLocale: UiLocaleCode;
    surahId: number;              // where the reader is now — seeds the field
    ayahCountOf: (surahId: number) => number | null;  // null = not loaded yet
    onClose: () => void;
    onJump: (surahId: number, ayahNumber: number) => void;
  }
  ```

- [ ] **Step 1: Write the failing parser tests first** (pure, no render)

```ts
describe('parseSurahJump', () => {
  it('takes an integer inside the range', () => {
    expect(parseSurahJump('7', 114)).toBe(7);
    expect(parseSurahJump(' 7 ', 114)).toBe(7);
  });

  it('rejects everything that is not one', () => {
    // Every one of these reaches a query if it passes: a decimal, a sign, a
    // number past the end, empty, and a numeral the parser must not coerce.
    for (const raw of ['', ' ', '0', '115', '7.5', '-7', '+7', '٧', '7a', '1e2']) {
      expect(parseSurahJump(raw, 114)).toBeNull();
    }
  });

  it('takes its ceiling from the surah, not from a constant', () => {
    // al-Fatihah has 7 ayahs and al-Baqarah 286. One constant would either
    // reject 8:1's real ayahs or accept 1:200.
    expect(parseSurahJump('8', 7)).toBeNull();
    expect(parseSurahJump('8', 286)).toBe(8);
  });
});
```

- [ ] **Step 2: Run, confirm fail** (module not found).

- [ ] **Step 3: Implement the parser**

```ts
/** Digits only, an integer, inside 1..max. Anything else -- a decimal, a sign,
 *  whitespace, Eastern Arabic numerals, 115 -- is null, and the sheet says so
 *  rather than handing it on. Same contract as the mushaf's parseJumpTarget;
 *  the ceiling is a parameter because it is per-surah here (§3 OWASP: reject
 *  at the boundary rather than pass through and clamp downstream). */
export function parseSurahJump(raw: string, max: number): number | null {
  if (!/^\d{1,3}$/.test(raw.trim())) return null;
  const value = Number(raw.trim());
  return value >= 1 && value <= max ? value : null;
}
```

- [ ] **Step 4: `useSurahAyahCounts`**

```ts
/** id -> ayahCount for all 114, read once.
 *
 *  A hook rather than a prop threaded from each screen: the reader and the
 *  morphology grid both need it and neither loads the surah list today, and a
 *  second copy of this query is exactly the duplication §3 forbids. Returns a
 *  lookup that answers null until the read lands -- the sheet disables its
 *  ayah field on null rather than validating against a guess. */
export function useSurahAyahCounts(): (surahId: number) => number | null
```

Implementation reads `getSurahList` through the same `openCorpusDb` path the screens use, holds `Map<number, number>` in state, and tolerates a failed read by staying null (a jump by surah alone still works).

- [ ] **Step 5: The sheet**

Two fields in one `BottomSheet`: surah (seeded with the current `surahId`) and ayah (seeded `1`). `SheetHeader` + `SheetActions` for chrome, matching `PageJumpSheet` so the two read as one family. On submit: parse surah against 114; parse ayah against `ayahCountOf(surah) ?? 1`; if either is null set `rejected` and render `jump-error` with a localized message; otherwise `onJump(surah, ayah)`.

`keyboardType="number-pad"`, `testID`s `surah-jump-input` / `ayah-jump-input` / `surah-jump-go` / `surah-jump-error`.

Component tests: a valid pair calls `onJump`; an out-of-range ayah shows the error and does **not** call `onJump`; the ayah field is disabled while `ayahCountOf` returns null.

- [ ] **Step 6: Locale keys** — written out as literals, all three locales.

| key | en | uz | ru |
|---|---|---|---|
| `jump.surahTitle` | `Go to surah` | `Suraga o‘tish` | `Перейти к суре` |
| `jump.surah` | `Surah` | `Sura` | `Сура` |
| `jump.ayah` | `Ayah` | `Oyat` | `Аят` |
| `jump.go` | `Go` | `O‘tish` | `Перейти` |
| `jump.outOfRange` | `No such surah or ayah` | `Bunday sura yoki oyat yo‘q` | `Такой суры или аята нет` |

- [ ] **Step 7: Mutation-check**

1. Widen the regex to `/^\d+$/` and drop the range check → the reject test FAILS.
2. Replace `max` with a literal `286` → the per-surah ceiling test FAILS.
3. Make the error path call `onJump` anyway → the component test FAILS.

- [ ] **Step 8: §5 — STOP and ask the owner to run `/code-review`**

This task is user input reaching a query. §5's second trigger applies and §4 step 5 is **not** optional here. Plain `/code-review`, not `ultra`. Act on the findings, then commit.

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/src/components/SurahJumpSheet.tsx apps/mobile/src/components/SurahJumpSheet.test.tsx \
        apps/mobile/src/data/useSurahAyahCounts.ts apps/mobile/src/i18n/uiStrings.ts
git commit -m "feat(mobile): a sheet that goes to any surah and ayah"
```

---

### Task 3: Morphology — the name is the control

**Files:**
- Modify: `apps/mobile/src/screens/WbwScreen.tsx`
- Test: `apps/mobile/src/test/routes/words.test.tsx`

**Interfaces:** consumes T2. Produces nothing.

- [ ] **Step 1: Failing test**

```tsx
it('opens the jump sheet from the surah name', async () => {
  // Ruling S3: the name IS the control -- no new button, and the row we just
  // cleared for the name keeps its width.
  render(<WbwRoute />);
  await screen.findAllByTestId('wbw-cell');

  fireEvent.click(screen.getByTestId('wbw-surah-jump'));

  expect(screen.getByTestId('surah-jump-input')).toBeTruthy();
});
```

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement**

Wrap the name `<Text>` in a `Pressable testID="wbw-surah-jump"` with `accessibilityRole="button"`, `accessibilityLabel={t(uiLocale, 'jump.surahTitle')}`, and `usePressScaleStyle` for feedback — **a tappable name with no press response reads as a rendering bug.** The name keeps `flex: 1` and `numberOfLines={1}`; the Pressable takes the flex.

A `chevronDown` at `size={14}` in `theme.mutedText` sits after the name: ruling S3 spends no width on a button, but a control with no affordance at all is one nobody finds.

On jump: `setSurah(surahId)` then `setFrom(ayahNumber)` — the existing state setters, no new query path.

- [ ] **Step 4: Run, tsc, eslint.**

- [ ] **Step 5: Mutation-check** — remove the `onPress`; the test FAILS.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(mobile/wbw): tap the surah name to go anywhere"
```

---

### Task 4: Reader — the same, and only once the name is there

**Files:**
- Modify: `apps/mobile/src/components/ReaderHeader.tsx`
- Modify: `apps/mobile/src/components/SurahReader.tsx`
- Test: `apps/mobile/src/components/ReaderHeader.test.tsx`, `apps/mobile/src/components/SurahReader.test.tsx`

**Interfaces:**
- Consumes: T2.
- Produces: `ReaderHeaderProps` gains `titleVisible?: boolean` and `onOpenJump?: () => void`.

- [ ] **Step 1: Failing tests**

```tsx
it('opens the jump sheet from the surah name', () => {
  const { onOpenJump } = renderHeader({ titleVisible: true });
  fireEvent.click(screen.getByTestId('reader-surah-jump'));
  expect(onOpenJump).toHaveBeenCalledTimes(1);
});

it('does not take a tap while the name is faded out', () => {
  // The name is animated to opacity 0 until the list's own heading scrolls
  // off (M7e). A control that still takes presses there is an invisible hit
  // target across the middle of the header, and the surah name is legible in
  // the list heading at exactly that moment anyway.
  const { onOpenJump } = renderHeader({ titleVisible: false });
  fireEvent.click(screen.getByTestId('reader-surah-jump'));
  expect(onOpenJump).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Implement**

`ReaderHeader`: wrap the `Animated.Text` in a `Pressable testID="reader-surah-jump"`, `disabled={!titleVisible}`, `accessibilityLabel={t(uiLocale, 'jump.surahTitle')}`, plus `accessibilityElementsHidden`/`importantForAccessibility="no-hide-descendants"` while hidden so TalkBack does not offer a control the eye cannot see. Keep the `Animated.Text` inside it exactly as it is — `titleStyle` still drives the fade.

`SurahReader`: owns `jumpOpen` state, renders `<SurahJumpSheet>` when open, passes `titleVisible` from the same scroll offset that drives the fade (**one source of truth — do not recompute a threshold in the header**), and on jump navigates to the target surah and scrolls to the ayah using the existing deep-link path.

- [ ] **Step 4: Run every suite.** `npx tsc --noEmit && npx eslint src --max-warnings=0 && npx vitest run`

- [ ] **Step 5: Mutation-check** — drop `disabled={!titleVisible}`; the faded-out test FAILS.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(mobile/reader): tap the surah name to go anywhere"
```

---

## Acceptance criteria

- The surah index draws every one of the 114 names in the V4 face, including **102**, with no tofu.
- Juz, page and revealed rows are visually unchanged.
- Both headers open the jump sheet from the name; both land on the exact surah+ayah.
- The jump sheet rejects `0`, `115`, `1:8`, a decimal, a sign and Eastern numerals with a message, not a crash or a clamp.
- Reader: the name takes no tap while faded out.
- `npx vitest run`, `npx tsc --noEmit`, `npx eslint src --max-warnings=0` all clean.
- Every new branch mutation-checked; `/code-review` run once on T2.

## Device checks (§10 — the mobile gate)

Continuing M7e's numbering:

| # | Check |
|---|---|
| 315 | Surah index: names are calligraphic, right-aligned, not clipped at either end. |
| 316 | Surah 102 (At-Takathur) draws a real glyph, not a box. V2 has no glyph for it; V4 must. |
| 317 | Long row: surah 7 (Al-A'raf) — glyph and translit do not collide at 390pt. |
| 318 | Juz / Page / Revealed rows unchanged. |
| 319 | Morphology: tap the name → sheet opens; 2 + 255 lands on al-Baqarah 255. |
| 320 | Reader: same, and the name is dead to the touch at the top of a surah. |
| 321 | Jump sheet over the keyboard: input, error line and Go all reachable (the M7d/#67 lift). |
| 322 | Ayah past the end (1 + 8) → message, sheet stays open, nothing navigates. |
| 323 | TalkBack: the name announces as a button with a name; while faded it is not reachable. |
| 324 | Reduced motion: sheet still opens and closes, no stuck backdrop. |

Record results in this file's verification log. "Implementation complete, verification pending" is an unmet exit criterion (§10).

## Risks & rollbacks

| Risk | Rollback |
|---|---|
| V4 glyphs clip in a 48dp row (they carry tall tails). | Drop `fontSize` 30 → 26, or give the row `minHeight + 8`. One constant in `Row`. |
| The calligraphic name is less scannable than `البقرة` was. | Revert T1's two lines in `SurahList`; `arabicFace` stays, unused. |
| `useSurahAyahCounts` adds a query to two screens that did not have one. | It is one read of 114 rows, once per screen mount, and failure degrades to surah-only jumps rather than to an error. |
| Tapping the name conflicts with a future long-press on it. | None planned; note it here so the next phase does not add one silently. |

## Out of scope

- Colour surah-name fonts. Dead by the M7e spike: no CPAL palette control from RN, no licence grant. Do not revisit without a licence answer.
- The **licence question on the whole surah-name family** (V2 and V4 are both "All rights reserved" from quranfonts.com). Worth its own issue; it is not a blocker for a face already shipping in the mushaf band.
- Jump by juz or page in these two headers. The mushaf already has both.
- Changing the mushaf band's V2 → V4.
