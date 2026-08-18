# M3 — Morphology MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tap any word in the mobile reader, get its morphology in a bottom sheet, and follow it through to full segment analysis and its root — plus a dedicated word-by-word screen.

**Architecture:** Word metadata already ships in the bundled DB; nothing new is scraped or generated. Three layers get built. In `packages/data`: a POS tag→bucket map and an ayah tokenizer that aligns Uthmani text to word rows. In `packages/config`: the `--pos-*`/`--form-*`/`--ease-out` tokens move out of web's `globals.css` so mobile is a second consumer. In `apps/mobile`: tokenized ayah text, a reanimated bottom sheet, and three new routes mirroring web's URLs.

**Tech Stack:** TypeScript, React Native 0.86 / Expo 57, expo-router, react-native-reanimated 4.5.0, react-native-gesture-handler 2.32, Expo SQLite via `@quran-corpus/mobile-data`, vitest + @testing-library/react (jsdom, RN mocked).

**Spec:** `docs/PRD-android-first-mobile-app.md` (Morphology MVP phase) + the grilling session recorded in "Decisions" below.

---

## Global Constraints

- **Numbering:** plan files are authoritative. This is M3. `docs/PRD-android-first-mobile-app.md` gets amended to match in Task 1.
- **No new dependencies.** reanimated, gesture-handler, svg are all installed. CLAUDE.md §12 — adding one needs an ask.
- **`packages/data` entry points (§2):** anything mobile imports must be re-exported from `./mobile`; anything a `'use client'` file imports must come from `./client`. Never the barrel. `tests/client-entry.test.ts` and `tests/mobile-entry.test.ts` guard this — do not weaken them.
- **`packages/config/theme/palette.ts` stays dependency-free plain TS.** Three loaders read it (jiti, Next's bundler, Metro). No build step, no `tailwindcss` type imports.
- **No new data generation.** The bundled `apps/mobile/assets/db/quran.db` already carries `words` (77,429), `word_segments` (128,219), `roots` (1,642), `root_forms` (4,657), `root_definitions` (3,221), `word_glosses`, `word_concept_tags`. Verified 2026-08-16. Do not regenerate the fixture.
- **Accessibility:** WCAG AA. Every tap target ≥ `touchTargets.minimum` (48) except inline word tokens, which are glyph-sized by design — see Risk R2.
- **Motion:** `AccessibilityInfo.isReduceMotionEnabled()` gates every animation added in this phase.
- **§4 loop per task:** implement → self-review → lint + type-check + tests → mutation-check new logic → commit. Mutation-check means deleting the fix or flipping the condition and confirming a test actually fails.
- **§5 independent review:** see "Governance" below. One trigger fires.
- **§10 gate:** this phase is not complete until the device checklist in Task 12 is run on real hardware and recorded in the Verification Log.

---

## Decisions (from the grilling session, 2026-08-16)

| # | Decision |
|---|---|
| D1 | Plan-file numbering wins; PRD amended. |
| D2 | Word-by-word ships **both** inline in the reader **and** as a dedicated screen. |
| D3 | Bottom sheet is **hand-rolled** on reanimated + gesture-handler. No new dep. |
| D4 | tag→bucket lives in `packages/data`; bucket→colour lives in `packages/config`. |
| D5 | Sheet links to a **minimal root screen** (root, gloss, form list). Not the dictionary. |
| D6 | Reader tokenizes with **nested `<Text>`**; the WbW screen uses a **`flexWrap` grid**. |
| D7 | Reader shows **no POS colour** — press tint only. Colour lives on WbW + sheet. |
| D8 | Sheet is a summary; **"Full analysis" pushes a word-detail screen**. |
| D9 | Sheet dismisses on backdrop tap, Android back, **and drag**. No snap points. |
| D10 | WbW screen **pages by ayah range**, mirroring web's `Pager` + `VersePicker`. |
| D11 | Entry to WbW: reader header control **and** a fifth tab resuming last-read position. |
| D12 | Routes mirror web paths. |

---

## The alignment finding (read before Task 2)

Concatenating `words.text_arabic` does **not** reproduce `ayahs.text_uthmani`. Measured across all 6,236 ayahs on 2026-08-16:

- `1:1` — `text_uthmani` is prefixed with a BOM (U+FEFF).
- `2:255` — `text_uthmani` carries waqf pause marks (`ۚ ۗ ۖ`) that `words` drop entirely, plus small ornament marks (`سِنَةٌۭ` vs `سِنَةٌ`).
- `96:1` — `text_uthmani` prepends the basmala; `words` has no rows for it.
- `2:44` — `text_uthmani` opens with `۞` (U+06DE, rub-el-hizb); `words` has no row for it.

So "render tokens instead of the blob" silently deletes pause marks and the basmala from the primary reading surface. **web already has this defect** — `AyahView.tsx` renders `words` when present and only falls back to `text_uthmani` when the list is empty, so web readers have never seen the waqf marks. Out of scope here; log it as an issue.

The fix is to tokenize **the Uthmani text itself** and attach word metadata by index, rather than rendering the word rows. Rule, validated at **6,236 / 6,236 = 100%**:

1. Strip U+FEFF.
2. Split on whitespace, drop empties.
3. Peel leading standalone marks into unindexed tokens.
4. Merge any remaining standalone mark into the preceding token.
5. If `ayahNumber === 1`, `surahId ∉ {1, 9}`, and the merged count is `tokenCount + 4`, the first four tokens are the basmala and stay unindexed.
6. If the remaining count still differs from `tokenCount`, alignment failed — return `null` and let the caller render the plain blob.

Step 5 must run **after** step 4, not before. Running it first scores 99.50% because an ayah 1 that also carries a waqf mark has more raw tokens than `tokenCount + 4`.

`tokenCount` is not the word-row count. **Amended during execution, 2026-08-16:** 37:130's `إِلْ يَاسِينَ` is the one word row in the corpus whose `text_arabic` contains a space, so it is one word and two whitespace-separated tokens. Counting rows made it the single alignment failure in the whole Quran (6235/6236). `alignAyahTokens` therefore takes the ayah's **word texts**, not a count, and lets a row claim as many tokens as it spans. Callers already hold the texts, so this costs nothing at the call site.

---

## File Structure

**Create**

| Path | Responsibility |
|---|---|
| `packages/data/src/morphology/buckets.ts` | `posBucket(tag)` — POS tag → one of five buckets. Pure. |
| `packages/data/tests/buckets.test.ts` | Bucket coverage + the DET carve-out. |
| `packages/data/src/text/ayahTokens.ts` | `alignAyahTokens()` — the tokenizer above. Pure. |
| `packages/data/tests/ayahTokens.test.ts` | Alignment, degradation, mutation-check. |
| `apps/mobile/src/components/AyahText.tsx` | Nested-`<Text>` tokenized ayah with per-word press. |
| `apps/mobile/src/components/WordSheet.tsx` | The bottom sheet. Reanimated, drag, reduced-motion. |
| `apps/mobile/src/components/SegmentPill.tsx` | One coloured segment chip. Shared by sheet, WbW, detail. |
| `apps/mobile/src/components/WbwGrid.tsx` | `flexWrap` word grid for the WbW screen. |
| `apps/mobile/src/components/VersePicker.tsx` | Ayah-range pager control. |
| `apps/mobile/src/motion/useReducedMotion.ts` | `AccessibilityInfo` hook. |
| `apps/mobile/app/surah/[surahId]/words.tsx` | WbW screen. |
| `apps/mobile/app/word/[surah]/[ayah]/[position].tsx` | Full word detail. |
| `apps/mobile/app/root/[buckwalter].tsx` | Minimal root screen. |
| `apps/mobile/app/(tabs)/morphology.tsx` | Fifth tab. |

**Modify**

| Path | Change |
|---|---|
| `docs/PRD-android-first-mobile-app.md:417+` | Renumber phases to match plan files. |
| `packages/data/src/client.ts` | Re-export `posBucket`, `alignAyahTokens`. |
| `packages/data/src/mobile.ts` | Same two re-exports. |
| `packages/data/src/index.ts` | Same two re-exports. |
| `packages/config/theme/palette.ts` | Add `posColors`, `formColors`, `easeOut`. |
| `apps/web/src/lib/posColor.ts` | Shrink to a bucket→`var(--pos-*)` lookup. |
| `apps/web/src/app/globals.css` | Tokens now generated from the palette; add a parity test. |
| `apps/mobile/src/theme/tokens.ts` | Add `posColors` per theme with measured contrast ratios. |
| `apps/mobile/src/data/corpusRepository.ts` | Add ayah-words, word-detail-by-location, root-entry reads. |
| `apps/mobile/src/components/AyahCard.tsx` | Render `AyahText` instead of a raw `<Text>`. |
| `apps/mobile/src/components/SurahReader.tsx` | Fetch words for viewable ayahs; own the sheet. |
| `apps/mobile/src/components/icons/Icon.tsx` | Add `'words'` and `'root'` icon names. |
| `apps/mobile/app/(tabs)/_layout.tsx` | Register the fifth tab. |
| `apps/mobile/src/i18n/uiStrings.ts` | New keys in en/uz/ru. |
| `README.md` | New device-checklist section. |

---

## Governance

**§5 independent review — one trigger fires.** `alignAyahTokens` is a parser in `packages/data` whose output drives the primary reading surface on both products. §5's stated trigger is "schema or queries", which this is neither; but §5's stated *reason* — "a mistake here reaches web, mobile and scraper at once" — applies exactly. **Ask the user to run `/code-review` after Task 2** (plain, not `ultra`). `posBucket` is a pure lookup table with no such reach and does not need one.

No trust boundary is crossed (the DB is bundled, not user input) and nothing in this phase writes the on-device user DB. Those two triggers do not fire.

---

## Task 1: Renumber the PRD

**Files:**
- Modify: `docs/PRD-android-first-mobile-app.md:417-435`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing in code. Unblocks every later commit message referencing M3.

- [x] **Step 1: Read the current phase list**

Run: `sed -n '410,440p' docs/PRD-android-first-mobile-app.md`

- [x] **Step 2: Renumber so M2 is Design Foundation and M3 is Morphology MVP**

The PRD currently calls Morphology MVP "M2" and Dictionary + Search "M3". Plan files spent M2 on the design foundation. Shift the PRD's list down by one from Morphology MVP onward, and insert Design Foundation as M2. Add a one-line note under the list:

```markdown
> Numbering follows `docs/plans/`. The design-foundation phase was inserted as
> M2 on 2026-08-16 and everything below it shifted by one.
```

- [x] **Step 3: Commit**

```bash
git add docs/PRD-android-first-mobile-app.md
git commit -m "docs(mobile): renumber PRD phases to match plan files"
```

---

## Task 2: `alignAyahTokens` in `packages/data`

**Files:**
- Create: `packages/data/src/text/ayahTokens.ts`
- Create: `packages/data/tests/ayahTokens.test.ts`
- Modify: `packages/data/src/client.ts`, `packages/data/src/mobile.ts`, `packages/data/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface AyahToken {
    text: string;
    wordIndex: number | null;
  }
  export function alignAyahTokens(
    textUthmani: string,
    wordTexts: readonly string[],
    ref: { surahId: number; ayahNumber: number },
  ): AyahToken[] | null;
  ```
  `wordTexts` is the ayah's `words.text_arabic` in `position` order — see the
  amendment under "The alignment finding" for why this is not a bare count.
  `wordIndex` is a 0-based index into the ayah's `position`-ordered word list, or `null` for text with no word row (basmala, `۞`, a leading pause mark). `null` return means alignment failed and the caller must render the raw string.

- [x] **Step 1: Write the failing tests**

Create `packages/data/tests/ayahTokens.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { alignAyahTokens } from '../src/text/ayahTokens.js';

const AL_FATIHA_1 = '﻿بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';
// 2:44 opens with the rub-el-hizb marker and carries one waqf mark mid-ayah.
const AL_BAQARAH_44 =
  '۞ أَتَأْمُرُونَ ٱلنَّاسَ بِٱلْبِرِّ وَتَنسَوْنَ أَنفُسَكُمْ وَأَنتُمْ تَتْلُونَ ٱلْكِتَٰبَ ۚ أَفَلَا تَعْقِلُونَ';
// 96:1 is prefixed with the basmala, which has no rows in `words`.
const AL_ALAQ_1 =
  'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ ٱقْرَأْ بِٱسْمِ رَبِّكَ ٱلَّذِى خَلَقَ';

describe('alignAyahTokens', () => {
  it('strips the byte-order mark rather than emitting it as a token', () => {
    const tokens = alignAyahTokens(AL_FATIHA_1, 4, { surahId: 1, ayahNumber: 1 });
    expect(tokens).not.toBeNull();
    expect(tokens!).toHaveLength(4);
    // A leaked U+FEFF renders as an invisible glyph that still takes a tap
    // target and shifts every wordIndex by one.
    expect(tokens![0]!.text.startsWith('﻿')).toBe(false);
    expect(tokens![0]!.wordIndex).toBe(0);
  });

  it('keeps a mid-ayah pause mark attached to the word it follows', () => {
    const tokens = alignAyahTokens(AL_BAQARAH_44, 10, { surahId: 2, ayahNumber: 44 });
    expect(tokens).not.toBeNull();
    // 11 tokens: the leading ۞ plus 10 words. The waqf ۚ is merged into
    // ٱلْكِتَٰبَ rather than standing alone -- standing alone it would be an
    // 11th word token and every index after it would be wrong.
    expect(tokens!).toHaveLength(11);
    expect(tokens![0]!.wordIndex).toBeNull();
    expect(tokens![0]!.text).toBe('۞');
    const kitab = tokens!.find((token) => token.text.includes('ٱلْكِتَٰبَ'));
    expect(kitab!.text).toContain('ۚ');
    expect(kitab!.wordIndex).toBe(7);
    // And the ayah's last word still maps to the last word row.
    expect(tokens![tokens!.length - 1]!.wordIndex).toBe(9);
  });

  it('leaves a prefixed basmala unindexed instead of consuming four words', () => {
    const tokens = alignAyahTokens(AL_ALAQ_1, 5, { surahId: 96, ayahNumber: 1 });
    expect(tokens).not.toBeNull();
    expect(tokens!).toHaveLength(9);
    expect(tokens!.slice(0, 4).every((token) => token.wordIndex === null)).toBe(true);
    // ٱقْرَأْ is the first real word of the surah, so it must be word 0 -- not
    // word 4, which would offset the whole surah's morphology by four.
    expect(tokens![4]!.text).toBe('ٱقْرَأْ');
    expect(tokens![4]!.wordIndex).toBe(0);
  });

  it('does not strip four words from an ayah that merely has four extra tokens', () => {
    // Only ayah 1 of a surah carries a basmala. Applying the rule anywhere
    // else eats four real words; 2:26 is one of the 122 ayahs where the
    // counts coincide.
    const tokens = alignAyahTokens('أ ب ج د ه و ز ح', 4, { surahId: 2, ayahNumber: 26 });
    expect(tokens).toBeNull();
  });

  it('exempts al-Fatiha and at-Tawba from the basmala rule', () => {
    // 1:1 IS the basmala -- its four tokens are four real words. 9:1 has no
    // basmala at all. Applying the rule to either blanks four words.
    const tokens = alignAyahTokens(AL_FATIHA_1, 4, { surahId: 1, ayahNumber: 1 });
    expect(tokens!.every((token) => token.wordIndex !== null)).toBe(true);
  });

  it('returns null when the counts cannot be reconciled', () => {
    // The caller renders the raw Uthmani string in this case. Returning a
    // partial alignment instead would attach the wrong morphology to a word,
    // which is worse than showing no morphology.
    expect(alignAyahTokens('أ ب ج', 7, { surahId: 2, ayahNumber: 2 })).toBeNull();
  });

  it('handles an ayah that is nothing but a mark', () => {
    expect(alignAyahTokens('۞', 0, { surahId: 2, ayahNumber: 44 })).toEqual([
      { text: '۞', wordIndex: null },
    ]);
  });
});
```

- [x] **Step 2: Run the tests and verify they fail**

Run: `pnpm --filter @quran-corpus/data test -- ayahTokens`
Expected: FAIL — `Failed to resolve import "../src/text/ayahTokens.js"`.

- [x] **Step 3: Write the implementation**

Create `packages/data/src/text/ayahTokens.ts`:

```ts
/**
 * Aligns an ayah's Uthmani text to its `words` rows.
 *
 * Concatenating `words.text_arabic` does NOT reproduce `ayahs.text_uthmani`:
 * the word rows drop waqf pause marks, drop the rub-el-hizb marker, and carry
 * no rows at all for the basmala that prefixes ayah 1 of most surahs. So the
 * reader tokenizes the Uthmani text -- which is the text a reader must see --
 * and attaches word metadata by index, rather than rendering the word rows and
 * silently deleting the marks. Validated against all 6,236 ayahs on
 * 2026-08-16: 6,236 aligned, 0 failures.
 */

/** Standalone Quranic annotation marks: small high/low waqf signs (U+06D6-DC),
 *  end-of-ayah (U+06DD), rub-el-hizb (U+06DE), sajdah (U+06E9). Each is a
 *  space-separated token in `text_uthmani` and has no `words` row. */
const STANDALONE_MARK = /^[ۖ-۞۩]+$/u;

/** Token count of the basmala as it appears prefixed to ayah 1. */
const BASMALA_TOKENS = 4;

export interface AyahToken {
  /** Uthmani text exactly as it appears, including any merged trailing mark. */
  text: string;
  /** 0-based index into the ayah's position-ordered word list, or null for
   *  text with no word row. */
  wordIndex: number | null;
}

export function alignAyahTokens(
  textUthmani: string,
  wordCount: number,
  ref: { surahId: number; ayahNumber: number },
): AyahToken[] | null {
  const raw = textUthmani.replace(/﻿/g, '').split(/\s+/).filter(Boolean);

  // Leading marks have nothing to attach backwards to, so they stand alone.
  const leading: AyahToken[] = [];
  let i = 0;
  while (i < raw.length && STANDALONE_MARK.test(raw[i]!)) {
    leading.push({ text: raw[i]!, wordIndex: null });
    i += 1;
  }

  // Every remaining mark attaches to the word it follows. Left standing alone
  // it would be counted as a word and offset every index after it.
  const merged: string[] = [];
  for (; i < raw.length; i += 1) {
    const token = raw[i]!;
    if (STANDALONE_MARK.test(token) && merged.length > 0) {
      merged[merged.length - 1] += ` ${token}`;
    } else {
      merged.push(token);
    }
  }

  // Must run AFTER the merge. Checked before it, a waqf-bearing ayah has more
  // raw tokens than wordCount + 4 and the basmala goes undetected -- that
  // scores 99.50% instead of 100%.
  //
  // al-Fatiha's ayah 1 IS the basmala (four real words) and at-Tawba has none,
  // so both are exempt.
  const hasBasmala =
    ref.ayahNumber === 1 &&
    ref.surahId !== 1 &&
    ref.surahId !== 9 &&
    merged.length === wordCount + BASMALA_TOKENS;
  const offset = hasBasmala ? BASMALA_TOKENS : 0;

  // A partial alignment attaches one word's morphology to a different word,
  // which is worse than showing none. Fail closed; the caller renders the raw
  // string.
  if (merged.length - offset !== wordCount) return null;

  return [
    ...leading,
    ...merged.map((text, index) => ({
      text,
      wordIndex: index < offset ? null : index - offset,
    })),
  ];
}
```

- [x] **Step 4: Run the tests and verify they pass**

Run: `pnpm --filter @quran-corpus/data test -- ayahTokens`
Expected: PASS, 7 tests.

- [x] **Step 5: Mutation-check (§4 step 4)**

Three mutations. Each must turn a test red; if one stays green, that test asserts nothing and must be rewritten before moving on.

1. Move the `hasBasmala` block above the merge loop → "keeps a mid-ayah pause mark attached" must fail.
2. Drop `ref.surahId !== 1` → "exempts al-Fatiha and at-Tawba" must fail.
3. Change `if (merged.length - offset !== tokenCount) return null;` to `return []` → "returns null when the counts cannot be reconciled" must fail.
4. Replace `spans` with `wordTexts.map(() => 1)` → the 37:130 joined-word test must fail.
5. Change `if (remaining === 0)` to `if (true)` → same test must fail.

The plan's original mutation 2 ("drop `ref.surahId !== 1`") **survived** the suite as first written: neither 1:1 nor 9:1 hits the count tie in the live DB, so the exemption is unreachable through real data and the test asserting it was vacuous. Rewritten during execution with synthetic tie inputs that do reach it.

Restore after each. Confirm `packages/data/node_modules/.vite` is not serving a stale transform if a mutation appears to do nothing.

- [x] **Step 6: Verify against the whole corpus**

Not a unit test — a one-off confirmation that the 100% figure still holds against the live DB.

```bash
cd packages/data && node -e "
const { createClient } = require('@libsql/client');
const { alignAyahTokens } = require('./dist/text/ayahTokens.js');
const c = createClient({ url: 'file:' + require('fs').realpathSync('../../apps/web/quran.db') });
(async () => {
  const r = await c.execute(\"SELECT a.surah_id s, a.ayah_number n, a.text_uthmani u, (SELECT count(*) FROM words w WHERE w.ayah_id=a.id) c FROM ayahs a\");
  let ok = 0, bad = [];
  for (const row of r.rows) {
    const t = alignAyahTokens(row.u, wordTextsFor(row.id), { surahId: Number(row.s), ayahNumber: Number(row.n) });
    if (t) ok++; else if (bad.length < 10) bad.push(row.s + ':' + row.n);
  }
  console.log('aligned', ok + '/' + r.rows.length, 'failures:', JSON.stringify(bad));
  process.exit(ok === r.rows.length ? 0 : 1);
})();
"
```

Expected: `aligned 6236/6236 failures: []`, exit 0. Requires `pnpm --filter @quran-corpus/data build` first.

- [x] **Step 7: Re-export from all three entry points**

Add to `packages/data/src/client.ts`, `packages/data/src/mobile.ts`, and `packages/data/src/index.ts`:

```ts
export { alignAyahTokens, type AyahToken } from './text/ayahTokens.js';
```

`ayahTokens.ts` imports nothing, so it adds no edge to either guarded module graph.

- [x] **Step 8: Run the entry-point guards**

Run: `pnpm --filter @quran-corpus/data test`
Expected: PASS, including `client-entry.test.ts` and `mobile-entry.test.ts`.

- [x] **Step 9: Commit**

```bash
git add packages/data/src/text/ayahTokens.ts packages/data/tests/ayahTokens.test.ts \
        packages/data/src/client.ts packages/data/src/mobile.ts packages/data/src/index.ts
git commit -m "feat(data): align Uthmani ayah text to word rows for tokenization

Concatenating words.text_arabic drops waqf pause marks, the rub-el-hizb
marker and the prefixed basmala, so rendering word rows in place of
text_uthmani deletes them from the reading surface. Tokenize the Uthmani
text instead and attach word metadata by index. Verified 6236/6236 ayahs."
```

- [x] **Step 10: STOP — request `/code-review`**

Per the Governance section, this task's parser is the one §5 trigger in the phase. Ask the user to run plain `/code-review` (not `ultra`). Act on real findings, state plainly which are declined and why, and do not re-run to clear a scoreboard.

- [x] **Step 11: Open an issue for web's pause-mark loss**

```bash
gh issue create --repo J3ff4/quran-corpus \
  --title "Web reader drops waqf pause marks and the basmala" \
  --body "apps/web/src/components/reader/AyahView.tsx renders \`words\` when present and only falls back to \`ayah.text_uthmani\` when the list is empty, so the web reader has never shown the waqf pause marks (2:255), the rub-el-hizb marker (2:44) or the prefixed basmala (96:1). \`alignAyahTokens\` in packages/data (M3) is the fix; adopting it on web is not in M3's scope."
```

---

## Task 3: `posBucket` in `packages/data`

**Files:**
- Create: `packages/data/src/morphology/buckets.ts`
- Create: `packages/data/tests/buckets.test.ts`
- Modify: `packages/data/src/client.ts`, `packages/data/src/mobile.ts`, `packages/data/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export type PosBucket = 'noun' | 'verb' | 'prep' | 'pron' | 'other';
  export function posBucket(posTag: string | null | undefined): PosBucket | null;
  ```
  `null` means "render as plain default text, no colour". Task 4 (web) and Task 5 (mobile) both consume this.

- [x] **Step 1: Write the failing tests**

Create `packages/data/tests/buckets.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { posBucket } from '../src/morphology/buckets.js';

describe('posBucket', () => {
  it('groups the three nominal tags into one bucket', () => {
    // N, PN and ADJ share a colour on web today; splitting them here would
    // change the rendering of every noun in the corpus.
    expect(posBucket('N')).toBe('noun');
    expect(posBucket('PN')).toBe('noun');
    expect(posBucket('ADJ')).toBe('noun');
  });

  it('maps the four coloured tags', () => {
    expect(posBucket('V')).toBe('verb');
    expect(posBucket('P')).toBe('prep');
    expect(posBucket('PRON')).toBe('pron');
  });

  it('gives DET no bucket at all, not the other bucket', () => {
    // corpus.quran.com's wordbyword.jsp folds an assimilated determiner prefix
    // into its preposition's label rather than surfacing DET as its own
    // category. Bucketing it as `other` would paint a muted pill on a
    // determiner that the source treats as invisible -- the exact regression
    // apps/web/src/lib/posColor.ts's DET carve-out exists to prevent.
    expect(posBucket('DET')).toBeNull();
  });

  it('falls back to `other` for a tag it does not know', () => {
    expect(posBucket('NEG')).toBe('other');
    expect(posBucket('CONJ')).toBe('other');
    expect(posBucket('REM')).toBe('other');
    expect(posBucket('SOME_FUTURE_TAG')).toBe('other');
  });

  it('gives an absent tag no bucket', () => {
    expect(posBucket(null)).toBeNull();
    expect(posBucket(undefined)).toBeNull();
    expect(posBucket('')).toBeNull();
  });
});
```

- [x] **Step 2: Run the tests and verify they fail**

Run: `pnpm --filter @quran-corpus/data test -- buckets`
Expected: FAIL — module not found.

- [x] **Step 3: Write the implementation**

Create `packages/data/src/morphology/buckets.ts`:

```ts
/**
 * Groups a POS tag into the colour buckets both products share. Splitting the
 * tag→bucket decision (corpus data, here) from the bucket→colour decision
 * (design, in packages/config) is what lets web emit `var(--pos-noun)` and
 * mobile emit a hex from the same source of truth.
 */

export type PosBucket = 'noun' | 'verb' | 'prep' | 'pron' | 'other';

const NOMINAL = new Set(['N', 'PN', 'ADJ']);

/**
 * Bucket for a POS tag, or null for "no colour, render as default text".
 *
 * DET returns null rather than `other`: corpus.quran.com's own wordbyword.jsp
 * doesn't surface DET as a distinct grammatical category -- an assimilated
 * determiner prefix is folded into its preposition's label -- so giving it the
 * muted `other` colour would paint a category the source treats as invisible.
 */
export function posBucket(posTag: string | null | undefined): PosBucket | null {
  if (!posTag) return null;
  if (posTag === 'DET') return null;
  if (NOMINAL.has(posTag)) return 'noun';
  switch (posTag) {
    case 'V':
      return 'verb';
    case 'P':
      return 'prep';
    case 'PRON':
      return 'pron';
    default:
      return 'other';
  }
}
```

- [x] **Step 4: Run the tests and verify they pass**

Run: `pnpm --filter @quran-corpus/data test -- buckets`
Expected: PASS, 5 tests.

- [x] **Step 5: Mutation-check**

Change `if (posTag === 'DET') return null;` to `return 'other';`. The DET test must fail. Restore.

- [x] **Step 6: Re-export from all three entry points**

```ts
export { posBucket, type PosBucket } from './morphology/buckets.js';
```

- [x] **Step 7: Run the full data suite**

Run: `pnpm --filter @quran-corpus/data test`
Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add packages/data/src/morphology/buckets.ts packages/data/tests/buckets.test.ts \
        packages/data/src/client.ts packages/data/src/mobile.ts packages/data/src/index.ts
git commit -m "feat(data): add posBucket, the shared POS tag to colour-bucket map"
```

---

## Task 4: Move the colour tokens into `packages/config`, refactor web

**Files:**
- Modify: `packages/config/theme/palette.ts`
- Modify: `apps/web/src/lib/posColor.ts`
- Modify: `apps/web/src/app/globals.css:23-77`
- Create: `apps/web/src/lib/posColor.parity.test.ts`

**Interfaces:**
- Consumes: `posBucket`, `PosBucket` from Task 3.
- Produces:
  ```ts
  // packages/config/theme/palette.ts
  export const posColors: {
    light: Record<'noun'|'verb'|'prep'|'pron'|'other', string>;
    dark:  Record<'noun'|'verb'|'prep'|'pron'|'other', string>;
  };
  export const formColors: {
    light: Record<'verb'|'verbal-noun'|'active-participle'|'passive-participle'|'noun'|'adjective'|'other', string>;
    dark:  Record<'verb'|'verbal-noun'|'active-participle'|'passive-participle'|'noun'|'adjective'|'other', string>;
  };
  export const easeOut: string;
  ```
  Task 5 consumes `posColors`.

- [x] **Step 1: Add the tokens to the palette**

Append to `packages/config/theme/palette.ts`, carrying the contrast-ratio comments across verbatim from `globals.css` — they are the evidence the values are AA, and dropping them loses that:

```ts
// POS colours, moved out of apps/web/src/app/globals.css in M3 when mobile
// became the second consumer. Ratios are light-mode against paper-50 and
// paper-100 respectively; dark-mode against night-400. Same rule as the
// scales above: no imports, no build step -- jiti, Next and Metro all read
// this file directly.
export const posColors = {
  light: {
    noun: '#2161b2', // 5.79 / 4.60:1
    verb: '#ab392c', // 5.90 / 4.61:1
    prep: '#0c6e55', // 5.86 / 4.65:1
    pron: '#86580f', // 5.79 / 4.61:1
    other: '#555555', // 7.02 / 5.55:1
  },
  dark: {
    noun: '#7fb0ff',
    verb: '#ff9a8f',
    prep: '#6fd9b8',
    pron: '#e0b877',
    other: '#aaaaaa',
  },
} as const;

// Dictionary derived forms, not sentence-position POS tags. verb/noun/other
// deliberately reuse their --pos-* counterparts' hex.
export const formColors = {
  light: {
    verb: '#ab392c', // 5.90 / 4.61:1
    'verbal-noun': '#6b4fa0', // 6.09 / 4.84:1
    'active-participle': '#186e55', // 5.82 / 4.63:1
    'passive-participle': '#914a6f', // 5.80 / 4.62:1
    noun: '#2161b2', // 5.79 / 4.60:1
    adjective: '#84590b', // 5.79 / 4.64:1
    other: '#555555', // 7.02 / 5.55:1
  },
  dark: {
    verb: '#ff9a8f',
    'verbal-noun': '#c3b0e8',
    'active-participle': '#6fd9b8',
    'passive-participle': '#e0a8c8',
    noun: '#7fb0ff',
    adjective: '#e8c477',
    other: '#aaaaaa',
  },
} as const;

export const easeOut = 'cubic-bezier(0.23, 1, 0.32, 1)';
```

The `#555` → `#555555` and `#aaa` → `#aaaaaa` expansion is deliberate: the parity test in Step 4 compares strings, and CSS shorthand would make an identical colour compare unequal.

- [x] **Step 2: Shrink web's `posColor` to a bucket lookup**

Rewrite `apps/web/src/lib/posColor.ts`. The DET carve-out and the noun-set membership both move into `posBucket`; this file is now nothing but bucket→CSS-variable, so the long comment goes with the logic it described:

```ts
import { posBucket } from '@quran-corpus/data/client';

/**
 * Maps a POS tag to a theme-aware CSS variable reference, or null for "no
 * colour" (render as plain default text). The tag→bucket decision lives in
 * packages/data/src/morphology/buckets.ts so mobile can share it; this file is
 * only the web half, bucket→var().
 */
export function posColor(posTag: string | null): string | null {
  const bucket = posBucket(posTag);
  return bucket ? `var(--pos-${bucket})` : null;
}
```

- [x] **Step 3: Verify web's existing `posColor` tests still pass unchanged**

Run: `pnpm --filter web test -- posColor`
Expected: PASS with no edits to the existing test files. If any fail, the refactor changed behaviour and must be corrected — the four existing consumers (`SegmentPills.tsx`, `SegmentCard.tsx`, `WbwWordRow.tsx`, `LemmaEntry.tsx`) are unmodified and expect the old output exactly.

- [x] **Step 4: Write the parity test**

`globals.css` keeps the literal hexes (a CSS file cannot import TypeScript, and adding a generator step is more machinery than the problem is worth). The test is what stops the two copies drifting.

Create `apps/web/src/lib/posColor.parity.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { posColors, formColors, easeOut } from '@quran-corpus/config/theme/palette';

// apps/web/vitest.config.mts is ESM, so there is no __dirname here.
const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '../app/globals.css'), 'utf8');

/** All `--token: value;` declarations, in file order, split by whether they
 *  sit inside the dark-mode block. */
function declarations(prefix: string) {
  // The selector, not a bare '.dark' -- the comment above it mentions the
  // .dark class by name and would match first.
  const darkStart = css.indexOf(':root.dark');
  const found: { name: string; value: string; dark: boolean }[] = [];
  const re = new RegExp(`--(${prefix}-[a-z-]+):\\s*([^;]+);`, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(css))) {
    found.push({ name: match[1]!, value: match[2]!.trim(), dark: match.index > darkStart });
  }
  return found;
}

describe('globals.css / palette.ts parity', () => {
  it('keeps every --pos-* token equal to the palette', () => {
    // The palette is the source of truth for mobile; globals.css is the copy
    // web's Tailwind build reads. Editing one and not the other renders the
    // same grammatical category in two different colours across the products,
    // and nothing else in the build would catch it.
    for (const { name, value, dark } of declarations('pos')) {
      const bucket = name.replace('pos-', '') as keyof typeof posColors.light;
      expect(value.toLowerCase()).toBe(
        (dark ? posColors.dark : posColors.light)[bucket].toLowerCase(),
      );
    }
  });

  it('covers every bucket the palette defines, in both themes', () => {
    // The loop above passes vacuously if globals.css declares nothing at all.
    const found = declarations('pos');
    expect(found.filter((d) => !d.dark)).toHaveLength(Object.keys(posColors.light).length);
    expect(found.filter((d) => d.dark)).toHaveLength(Object.keys(posColors.dark).length);
  });

  it('keeps every --form-* token equal to the palette', () => {
    for (const { name, value, dark } of declarations('form')) {
      const key = name.replace('form-', '') as keyof typeof formColors.light;
      expect(value.toLowerCase()).toBe(
        (dark ? formColors.dark : formColors.light)[key].toLowerCase(),
      );
    }
  });

  it('covers every derived form the palette defines, in both themes', () => {
    const found = declarations('form');
    expect(found.filter((d) => !d.dark)).toHaveLength(Object.keys(formColors.light).length);
    expect(found.filter((d) => d.dark)).toHaveLength(Object.keys(formColors.dark).length);
  });

  it('keeps --ease-out equal to the palette', () => {
    expect(css).toContain(`--ease-out: ${easeOut};`);
  });
});
```

- [x] **Step 5: Normalise the CSS shorthand and run the parity test**

In `apps/web/src/app/globals.css`, expand `#555` → `#555555` (lines 27, 53) and `#aaa` → `#aaaaaa` (lines 69, 77).

Run: `pnpm --filter web test -- posColor.parity`
Expected: PASS, 5 tests.

- [x] **Step 6: Mutation-check the parity test**

Change `--pos-noun` in `globals.css` to `#000000`. The first parity test must fail. Restore. Then delete every `--pos-*` line from `globals.css`; the *coverage* test must fail (the first would pass vacuously). Restore.

- [x] **Step 7: Lint, type-check, full suites**

```bash
pnpm --filter web lint && pnpm --filter web type-check && pnpm --filter web test
pnpm --filter @quran-corpus/data test
```
Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add packages/config/theme/palette.ts apps/web/src/lib/posColor.ts \
        apps/web/src/app/globals.css apps/web/src/lib/posColor.parity.test.ts
git commit -m "refactor(config): move --pos-/--form-/--ease-out into the shared palette

Mobile is the second consumer as of M3, so the tokens move out of web's
globals.css. The CSS keeps literal hexes (it cannot import TS) and a parity
test holds the two copies equal."
```

---

## Task 5: Mobile POS colours

**Files:**
- Modify: `apps/mobile/src/theme/tokens.ts`
- Create: `apps/mobile/src/theme/posColors.test.ts`

**Interfaces:**
- Consumes: `posColors` from Task 4, `posBucket`/`PosBucket` from Task 3.
- Produces: `themeColors.light.pos` and `themeColors.dark.pos`, both `Record<PosBucket, string>`. Task 7 (SegmentPill) consumes them via `useThemeColors()`.

- [x] **Step 1: Measure the contrast ratios against mobile's own backgrounds**

Mobile's light background is `paperScale[50]` — the same `#faf8f3` the web ratios were measured against, so light carries over unchanged. Mobile's dark background is `#151412` (warm), not web's `#141414` (neutral grey). Compute each dark bucket's ratio against `#151412` before writing anything:

```bash
cd apps/mobile && node -e "
const lum = h => { const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4); return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]; };
const ratio = (a,b) => { const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p); return ((x+0.05)/(y+0.05)).toFixed(2); };
const bg='#151412';
for (const [k,v] of Object.entries({noun:'#7fb0ff',verb:'#ff9a8f',prep:'#6fd9b8',pron:'#e0b877',other:'#aaaaaa'}))
  console.log(k, v, ratio(v,bg)+':1', Number(ratio(v,bg))>=4.5?'AA':'*** FAILS AA ***');
"
```

Any bucket under 4.5:1 must be lightened until it passes, and the new hex written back to `packages/config/theme/palette.ts` **and** `globals.css` — the parity test from Task 4 will catch it if only one is edited. Record the measured ratio as a comment beside each value, matching the convention already in `tokens.ts`.

- [x] **Step 2: Write the failing test**

Create `apps/mobile/src/theme/posColors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { posBucket, type PosBucket } from '@quran-corpus/data/mobile';
import { themeColors } from './tokens';

const BUCKETS: PosBucket[] = ['noun', 'verb', 'prep', 'pron', 'other'];

function contrast(hex: string, bg: string): number {
  const channel = (h: string, i: number) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const lum = (h: string) =>
    0.2126 * channel(h, 1) + 0.7152 * channel(h, 3) + 0.0722 * channel(h, 5);
  const [hi, lo] = [lum(hex), lum(bg)].sort((a, b) => b - a);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('mobile POS colours', () => {
  it('covers every bucket posBucket can return, in both themes', () => {
    // A bucket with no colour renders `undefined` as a style value, which RN
    // silently ignores -- the pill loses its colour with no error anywhere.
    for (const bucket of BUCKETS) {
      expect(themeColors.light.pos[bucket]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(themeColors.dark.pos[bucket]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('meets WCAG AA against each theme background', () => {
    // Mobile's dark background is #151412, warm -- NOT web's neutral #141414,
    // which is what the palette's ratios were measured against. A value that
    // passes on web is not automatically AA here.
    for (const bucket of BUCKETS) {
      expect(contrast(themeColors.light.pos[bucket], themeColors.light.background))
        .toBeGreaterThanOrEqual(4.5);
      expect(contrast(themeColors.dark.pos[bucket], themeColors.dark.background))
        .toBeGreaterThanOrEqual(4.5);
    }
  });

  it('gives the buckets distinct colours', () => {
    // Two buckets sharing a hex makes the colour coding decorative rather
    // than informative -- the reader cannot tell a verb from a preposition.
    expect(new Set(BUCKETS.map((b) => themeColors.light.pos[b])).size).toBe(BUCKETS.length);
    expect(new Set(BUCKETS.map((b) => themeColors.dark.pos[b])).size).toBe(BUCKETS.length);
  });

  it('has a colour for every tag posBucket buckets', () => {
    // Guards the seam: if posBucket ever gains a sixth bucket, this fails
    // rather than rendering that bucket colourless.
    for (const tag of ['N', 'PN', 'ADJ', 'V', 'P', 'PRON', 'NEG', 'CONJ']) {
      const bucket = posBucket(tag);
      expect(bucket).not.toBeNull();
      expect(themeColors.light.pos[bucket!]).toBeDefined();
    }
  });
});
```

- [x] **Step 3: Run and verify it fails**

Run: `pnpm --filter mobile test -- posColors`
Expected: FAIL — `themeColors.light.pos` is undefined.

- [x] **Step 4: Add `pos` to both themes**

In `apps/mobile/src/theme/tokens.ts`, import the palette's POS colours and add a `pos` key to each theme. Use the ratios measured in Step 1 as the comments:

```ts
import { paper as paperScale, posColors } from '@quran-corpus/config/theme/palette';
```

then inside `themeColors.light`:

```ts
    // Same hexes web uses, and the same background (#faf8f3 = paper-50), so
    // the light-mode ratios in packages/config/theme/palette.ts carry over
    // unchanged.
    pos: posColors.light,
```

and inside `themeColors.dark`:

```ts
    // Re-measured against mobile's warm #151412, not web's neutral #141414.
    // Ratios recorded in packages/config/theme/palette.ts.
    pos: posColors.dark,
```

- [x] **Step 5: Run and verify it passes**

Run: `pnpm --filter mobile test -- posColors`
Expected: PASS, 4 tests. If the AA test fails, go back to Step 1 — the value is wrong, not the test.

- [x] **Step 6: Mutation-check**

Set `posColors.dark.other` to `#333333` in the palette. The AA test must fail. Restore, and re-run Task 4's parity test to confirm the palette and `globals.css` are back in agreement.

- [x] **Step 7: Commit**

```bash
git add apps/mobile/src/theme/tokens.ts apps/mobile/src/theme/posColors.test.ts \
        packages/config/theme/palette.ts apps/web/src/app/globals.css
git commit -m "feat(mobile): add POS bucket colours to both themes"
```

---

## Task 6: Corpus reads for morphology

**Files:**
- Modify: `apps/mobile/src/data/corpusRepository.ts`
- Modify: `apps/mobile/src/data/corpusRepository.test.ts`

**Interfaces:**
- Consumes: `getWordsByAyah`, `getWordsBySurahAyahRange`, `getWordByLocation`, `getSegmentsByWordIds`, `getRootEntry`, `getGlossesWithFallback` — all already exported from `@quran-corpus/data/mobile`.
- Produces:
  ```ts
  export function getWordsForAyah(client: MobileDataClient, ayahId: number): Promise<Word[]>;

  export function getSurahGlosses(
    client: MobileDataClient, surahId: number, languageCode: ContentLanguageCode,
  ): Promise<Map<number, string>>;          // keyed by word id

  export interface WordSummary {
    word: Word;
    segments: WordSegment[];
    gloss: string | null;
  }
  export function getWordSummary(
    client: MobileDataClient, word: Word, gloss: string | null,
  ): Promise<WordSummary>;

  export function getWordAtLocation(
    client: MobileDataClient, surahId: number, ayahNumber: number, position: number,
    languageCode: ContentLanguageCode,
  ): Promise<WordSummary | null>;

  export interface WbwPage { ayahNumber: number; words: Word[]; segments: Map<number, WordSegment[]>; }
  export function getWbwRange(
    client: MobileDataClient, surahId: number, fromAyah: number, toAyah: number,
  ): Promise<WbwPage[]>;

  export function getRootScreen(
    client: MobileDataClient, rootBuckwalter: string,
  ): Promise<RootEntry | null>;
  ```
  Tasks 8–12 consume these.

**Two upstream shapes that constrain this task — verified 2026-08-16, do not re-derive:**

1. `getGlossesWithFallback(db, surahId, lang, fallback = 'en')` takes a **surah id**, not a word-id list, and returns `GlossWithLang[]` whose fields are `word_id` and **`gloss_text`** (not `text`). So glosses are fetched once per surah and cached, not per word tap — hence `getSurahGlosses` above, and hence `getWordSummary` taking an already-resolved `gloss` rather than looking one up.
2. `Word` has **`ayah_id`, not `ayah_number`** (`packages/data/src/types.ts:28`). `getWordsBySurahAyahRange` orders by `a.ayah_number` but selects `w.*`, so the number is not on the returned rows. `getWbwRange` must resolve it through `getAyahsBySurah`, which the repository already calls.

`getWordSummary` takes the whole `Word` rather than an id because every caller already has one: `AyahText`'s `onWordPress` hands the `Word` straight over. Re-fetching it by id would be a query to recover something already in hand.

- [x] **Step 1: Read the existing repository and its tests**

Run: `cat apps/mobile/src/data/corpusRepository.ts && head -60 apps/mobile/src/data/corpusRepository.test.ts`

Match the existing conventions exactly: functions take `client` first, throw with a message naming the missing thing rather than returning a silent null for a genuine corruption, and never fetch data no screen reads.

- [x] **Step 2: Write the failing tests**

Append to `apps/mobile/src/data/corpusRepository.test.ts`, following the fake-client pattern already in that file:

```ts
describe('getWordsForAyah', () => {
  it('returns the ayah words in position order', async () => {
    // The reader aligns these to Uthmani tokens by index, so an out-of-order
    // list attaches every word's morphology to the wrong word -- and the
    // result still renders, which is what makes it worth asserting.
    const client = fakeClient({ words: [
      { id: 3, ayah_id: 9, position: 3, text_arabic: 'ج' },
      { id: 1, ayah_id: 9, position: 1, text_arabic: 'أ' },
      { id: 2, ayah_id: 9, position: 2, text_arabic: 'ب' },
    ] });
    const words = await getWordsForAyah(client, 9);
    expect(words.map((w) => w.position)).toEqual([1, 2, 3]);
  });

  it('returns an empty list for an ayah with no word rows', async () => {
    // Not an error: the caller falls back to the raw Uthmani text.
    expect(await getWordsForAyah(fakeClient({ words: [] }), 9)).toEqual([]);
  });
});

describe('getSurahGlosses', () => {
  it('keys the glosses by word id', async () => {
    const glosses = await getSurahGlosses(clientWithGlosses(), 2, 'en');
    expect(glosses.get(42)).toBe('the most merciful');
  });

  it('reads gloss_text, not text', async () => {
    // getGlossesWithFallback returns GlossWithLang, whose column is
    // `gloss_text`. Reading `.text` yields undefined for every word and the
    // sheet shows "no translation" for the entire corpus -- with no error.
    const glosses = await getSurahGlosses(clientWithGlosses(), 2, 'en');
    expect([...glosses.values()].every((value) => typeof value === 'string')).toBe(true);
    expect(glosses.size).toBeGreaterThan(0);
  });

  it('returns an empty map for a language with no glosses', async () => {
    expect((await getSurahGlosses(clientWithGlosses({ glosses: [] }), 2, 'uz')).size).toBe(0);
  });
});

describe('getWordSummary', () => {
  it('bundles the word, its segments and the gloss it was given', async () => {
    const summary = await getWordSummary(clientWithWord(42), word(42), 'the most merciful');
    expect(summary.word.id).toBe(42);
    expect(summary.segments).toHaveLength(2);
    expect(summary.gloss).toBe('the most merciful');
  });

  it('returns the segments in segment_index order', async () => {
    // The sheet renders pills left to right in array order; a prefix rendered
    // after its stem misdescribes the word's structure.
    const summary = await getWordSummary(clientWithWord(42, { shuffled: true }), word(42), null);
    expect(summary.segments.map((s) => s.segment_index)).toEqual([0, 1]);
  });

  it('still returns the morphology when there is no gloss', async () => {
    // Plenty of words have no gloss in a given language. Refusing to build a
    // summary would make the sheet decline to open on those words, hiding the
    // morphology too -- which is the part that always exists.
    const summary = await getWordSummary(clientWithWord(42), word(42), null);
    expect(summary.gloss).toBeNull();
    expect(summary.segments).toHaveLength(2);
  });
});

describe('getWordAtLocation', () => {
  it('resolves a surah:ayah:position triple to that word', async () => {
    // The word-detail route is reached by coordinates from a deep link; the
    // sheet reaches the same word by holding the Word object. Both must land
    // on the same row.
    const client = clientWithWord(42, { surahId: 2, ayahNumber: 255, position: 1 });
    const byLocation = await getWordAtLocation(client, 2, 255, 1, 'en');
    expect(byLocation!.word.id).toBe(42);
    expect(byLocation!.segments).toHaveLength(2);
  });

  it('returns null for coordinates that do not exist', async () => {
    expect(await getWordAtLocation(clientWithWord(42), 2, 255, 99, 'en')).toBeNull();
  });
});

describe('getWbwRange', () => {
  it('groups words by ayah and attaches each word its own segments', async () => {
    const pages = await getWbwRange(clientWithRange(), 2, 1, 3);
    expect(pages.map((p) => p.ayahNumber)).toEqual([1, 2, 3]);
    // One batched segment query for the whole range, fanned back out by
    // word_id. Attaching every segment to every word renders a plausible-
    // looking grid with the wrong grammar on every cell.
    expect(pages[0]!.segments.get(pages[0]!.words[0]!.id)).toHaveLength(2);
    expect(pages[0]!.segments.get(pages[0]!.words[1]!.id)).toHaveLength(1);
  });

  it('returns an empty list for a range with no ayahs', async () => {
    expect(await getWbwRange(clientWithRange(), 2, 900, 910)).toEqual([]);
  });
});

describe('getRootScreen', () => {
  it('returns the root with its forms and definitions', async () => {
    const entry = await getRootScreen(clientWithRoot('rHm'), 'rHm');
    expect(entry!.root.buckwalter).toBe('rHm');
    expect(entry!.forms.length).toBeGreaterThan(0);
    expect(entry!.definitions.length).toBeGreaterThan(0);
  });

  it('returns null for a root the corpus does not carry', async () => {
    // The sheet's root link is only rendered when the word HAS a root, but a
    // hand-typed deep link can carry anything.
    expect(await getRootScreen(clientWithRoot('rHm'), 'zzz')).toBeNull();
  });
});
```

- [x] **Step 3: Run and verify they fail**

Run: `pnpm --filter mobile test -- corpusRepository`
Expected: FAIL — the five functions are not exported.

- [x] **Step 4: Implement**

Add to `apps/mobile/src/data/corpusRepository.ts`. Import the additional queries from `@quran-corpus/data/mobile` — **never the barrel** (§2: the barrel pulls the native libsql driver into Metro's graph).

```ts
export async function getWordsForAyah(
  client: MobileDataClient,
  ayahId: number,
): Promise<Word[]> {
  const words = await getWordsByAyah(client, ayahId);
  // The reader aligns these to Uthmani tokens by array index, so order is
  // load-bearing -- a mis-ordered list renders fine and shows every word the
  // wrong grammar.
  return [...words].sort((a, b) => a.position - b.position);
}

// getGlossesWithFallback takes a SURAH id, not a word-id list, so glosses are
// fetched once per surah and cached rather than queried per word tap. Its rows
// carry `gloss_text`, not `text`.
export async function getSurahGlosses(
  client: MobileDataClient,
  surahId: number,
  languageCode: ContentLanguageCode,
): Promise<Map<number, string>> {
  const glosses = await getGlossesWithFallback(client, surahId, languageCode);
  return new Map(glosses.map((gloss) => [gloss.word_id, gloss.gloss_text]));
}

export interface WordSummary {
  word: Word;
  segments: WordSegment[];
  gloss: string | null;
}

export async function getWordSummary(
  client: MobileDataClient,
  word: Word,
  gloss: string | null,
): Promise<WordSummary> {
  const segments = await getSegmentsByWordIds(client, [word.id]);
  return {
    word,
    // The sheet renders pills in array order, so a prefix sorted after its
    // stem misdescribes the word's structure.
    segments: [...segments].sort((a, b) => a.segment_index - b.segment_index),
    // A missing gloss is normal, not an error: it must not suppress the
    // morphology, which is the part that always exists.
    gloss,
  };
}

export async function getWordAtLocation(
  client: MobileDataClient,
  surahId: number,
  ayahNumber: number,
  position: number,
  languageCode: ContentLanguageCode,
): Promise<WordSummary | null> {
  const word = await getWordByLocation(client, surahId, ayahNumber, position);
  if (!word) return null;
  const glosses = await getSurahGlosses(client, surahId, languageCode);
  return getWordSummary(client, word, glosses.get(word.id) ?? null);
}

export interface WbwPage {
  ayahNumber: number;
  words: Word[];
  segments: Map<number, WordSegment[]>;
}

export async function getWbwRange(
  client: MobileDataClient,
  surahId: number,
  fromAyah: number,
  toAyah: number,
): Promise<WbwPage[]> {
  const words = await getWordsBySurahAyahRange(client, surahId, fromAyah, toAyah);
  if (words.length === 0) return [];

  // One query for the whole page's segments, fanned back out by word_id. Per
  // word it would be one round trip per cell -- ~150 for a ten-ayah page.
  const allSegments = await getSegmentsByWordIds(client, words.map((word) => word.id));
  const byWord = new Map<number, WordSegment[]>();
  for (const segment of allSegments) {
    const list = byWord.get(segment.word_id);
    if (list) list.push(segment);
    else byWord.set(segment.word_id, [segment]);
  }
  for (const list of byWord.values()) list.sort((a, b) => a.segment_index - b.segment_index);

  // `Word` carries ayah_id, NOT ayah_number -- getWordsBySurahAyahRange orders
  // by a.ayah_number but selects w.*, so the number never reaches the rows.
  // Resolve it through the surah's ayahs.
  const ayahs = await getAyahsBySurah(client, surahId);
  const numberByAyahId = new Map(ayahs.map((ayah) => [ayah.id, ayah.ayah_number]));

  const byAyah = new Map<number, Word[]>();
  for (const word of words) {
    const ayahNumber = numberByAyahId.get(word.ayah_id);
    if (ayahNumber === undefined) continue;
    const list = byAyah.get(ayahNumber);
    if (list) list.push(word);
    else byAyah.set(ayahNumber, [word]);
  }

  return [...byAyah.entries()]
    .sort(([a], [b]) => a - b)
    .map(([ayahNumber, ayahWords]) => ({
      ayahNumber,
      words: [...ayahWords].sort((a, b) => a.position - b.position),
      segments: byWord,
    }));
}

export async function getRootScreen(
  client: MobileDataClient,
  rootBuckwalter: string,
): Promise<RootEntry | null> {
  return getRootEntry(client, rootBuckwalter);
}
```

Both upstream shapes above are verified, not assumed. If a test still disagrees, re-read the query rather than adjusting the test.

- [x] **Step 5: Run and verify they pass**

Run: `pnpm --filter mobile test -- corpusRepository`
Expected: PASS.

- [x] **Step 6: Mutation-check**

Four mutations, each must turn a test red:

1. Delete the `.sort((a, b) => a.position - b.position)` in `getWordsForAyah` → the order test.
2. Read `gloss.text` instead of `gloss.gloss_text` in `getSurahGlosses` → the "reads gloss_text, not text" test. (This is the mistake the plan's first draft actually made — it produces an empty-looking sheet with no error anywhere.)
3. Delete the `segment_index` sort in `getWordSummary` → the segment-order test.
4. In `getWbwRange`, pass `byWord` itself as each page's `segments` **without** the per-word `.get()` at the render site → Task 12's grid test, not this one. Note it here so the two are not both skipped.

- [x] **Step 7: Lint, type-check, commit**

```bash
pnpm --filter mobile lint && pnpm --filter mobile type-check && pnpm --filter mobile test
git add apps/mobile/src/data/corpusRepository.ts apps/mobile/src/data/corpusRepository.test.ts
git commit -m "feat(mobile): add word, segment and root reads for the morphology screens"
```

---

## Task 7: `SegmentPill` and the reduced-motion hook

**Files:**
- Create: `apps/mobile/src/components/SegmentPill.tsx`
- Create: `apps/mobile/src/components/SegmentPill.test.tsx`
- Create: `apps/mobile/src/motion/useReducedMotion.ts`
- Create: `apps/mobile/src/motion/useReducedMotion.test.ts`

**Interfaces:**
- Consumes: `themeColors.*.pos` (Task 5), `posBucket`, `decodeSegment` from `@quran-corpus/data/mobile`.
- Produces:
  ```ts
  export function SegmentPill(props: { segment: WordSegment; uiLocale: UiLocaleCode }): JSX.Element;
  export function useReducedMotion(): boolean;
  ```
  Tasks 8, 9, 10 and 11 all consume `SegmentPill`; Task 8 consumes `useReducedMotion`.

- [x] **Step 1: Write the failing test for `useReducedMotion`**

Create `apps/mobile/src/motion/useReducedMotion.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const listeners: Record<string, (value: boolean) => void> = {};
const remove = vi.fn();

vi.mock('react-native', () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: vi.fn(async () => true),
    addEventListener: vi.fn((event: string, handler: (value: boolean) => void) => {
      listeners[event] = handler;
      return { remove };
    }),
  },
}));

const { useReducedMotion } = await import('./useReducedMotion');

describe('useReducedMotion', () => {
  it('reports the system setting once it resolves', async () => {
    const { result } = renderHook(() => useReducedMotion());
    // Starts false: isReduceMotionEnabled is async, and defaulting to `true`
    // would make every animation skip its first frame on every launch.
    expect(result.current).toBe(false);
    await act(async () => {});
    expect(result.current).toBe(true);
  });

  it('follows a change made while the app is running', async () => {
    const { result } = renderHook(() => useReducedMotion());
    await act(async () => {});
    await act(async () => listeners.reduceMotionChanged?.(false));
    // Android lets the setting change without restarting the app. Reading it
    // only at mount leaves the sheet animating for a user who just turned
    // animation off.
    expect(result.current).toBe(false);
  });

  it('removes its listener on unmount', async () => {
    const { unmount } = renderHook(() => useReducedMotion());
    await act(async () => {});
    unmount();
    expect(remove).toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run and verify it fails**

Run: `pnpm --filter mobile test -- useReducedMotion`
Expected: FAIL — module not found.

- [x] **Step 3: Implement `useReducedMotion`**

```ts
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * The system "remove animations" setting, kept live. CLAUDE.md §8 requires
 * respecting it; this is mobile's equivalent of web's prefers-reduced-motion.
 *
 * Starts false and settles once the async read resolves -- defaulting true
 * would drop the first frame of every animation on every launch for users who
 * have not asked for that.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (!cancelled) setReduced(value);
    });
    // Android can change this without restarting the app.
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return reduced;
}
```

- [x] **Step 4: Run and verify it passes**

Run: `pnpm --filter mobile test -- useReducedMotion`
Expected: PASS, 3 tests.

- [x] **Step 5: Write the failing test for `SegmentPill`**

Create `apps/mobile/src/components/SegmentPill.test.tsx`. Mock `react-native` with the same `host()` helper `AyahMedallion.test.tsx` uses — copy it rather than importing, matching that file's existing convention.

```tsx
describe('SegmentPill', () => {
  it('labels the segment with its decoded POS, not its raw tag', () => {
    render(<SegmentPill segment={segment({ pos_tag: 'PN' })} uiLocale="en" />);
    // A raw "PN" tells a reader nothing; decodeSegment is the shared decoder
    // both products already use.
    expect(screen.getByText(/proper noun/i)).toBeTruthy();
  });

  it('colours by bucket', () => {
    render(<SegmentPill segment={segment({ pos_tag: 'V' })} uiLocale="en" />);
    expect(screen.getByText(/verb/i).closest('div')!.style.color)
      .toBe(themeColors.light.pos.verb);
  });

  it('renders DET without a bucket colour', () => {
    // posBucket returns null for DET deliberately -- see its own test. The
    // pill must fall back to body text, not to the `other` grey.
    render(<SegmentPill segment={segment({ pos_tag: 'DET' })} uiLocale="en" />);
    const style = screen.getByText(/determiner/i).closest('div')!.style;
    expect(style.color).not.toBe(themeColors.light.pos.other);
  });

  it('shows the segment Arabic when the corpus has it', () => {
    render(<SegmentPill segment={segment({ form_arabic: 'ٱل' })} uiLocale="en" />);
    expect(screen.getByText('ٱل')).toBeTruthy();
  });

  it('omits the Arabic line rather than rendering an empty one', () => {
    // form_arabic is null on some segments; an empty <Text> leaves a blank
    // row that reads as a rendering bug.
    const { container } = render(<SegmentPill segment={segment({ form_arabic: null })} uiLocale="en" />);
    expect(container.textContent).not.toMatch(/^\s*$/);
    expect(container.querySelectorAll('span')).toHaveLength(1);
  });
});
```

- [x] **Step 6: Run and verify it fails, then implement**

Create `apps/mobile/src/components/SegmentPill.tsx`. It renders the segment's Arabic (when present) above `decodeSegment(segment).pos.en`, tinted with `theme.pos[posBucket(segment.pos_tag)]` and left at `theme.text` when the bucket is null. Border-radius 6, `paddingHorizontal: 8`, `paddingVertical: 4`, `backgroundColor: theme.surface`.

Run: `pnpm --filter mobile test -- SegmentPill`
Expected: PASS, 5 tests.

- [x] **Step 7: Mutation-check**

Change the DET fallback to use `theme.pos.other`. The DET test must fail. Restore.

- [x] **Step 8: Commit**

```bash
git add apps/mobile/src/components/SegmentPill.tsx apps/mobile/src/components/SegmentPill.test.tsx \
        apps/mobile/src/motion/useReducedMotion.ts apps/mobile/src/motion/useReducedMotion.test.ts
git commit -m "feat(mobile): add the segment pill and the reduced-motion hook"
```

---

## Task 8: The word bottom sheet

**Files:**
- Create: `apps/mobile/src/components/WordSheet.tsx`
- Create: `apps/mobile/src/components/WordSheet.test.tsx`
- Modify: `apps/mobile/src/i18n/uiStrings.ts`

**Interfaces:**
- Consumes: `WordSummary` (Task 6), `SegmentPill` + `useReducedMotion` (Task 7).
- Produces:
  ```ts
  export interface WordSheetProps {
    summary: WordSummary | null;   // null = closed
    uiLocale: UiLocaleCode;
    onClose: () => void;
    onOpenDetail: (word: Word) => void;
    onOpenRoot: (rootBuckwalter: string) => void;
  }
  export function WordSheet(props: WordSheetProps): JSX.Element | null;
  ```
  Task 9 mounts it.

**Motion spec** — ported from `apps/web/src/components/reader/WordPopover.tsx` so the products feel the same:

| Property | Value |
|---|---|
| Enter/exit | `withSpring`, `damping: 28`, `stiffness: 320` |
| Transform | `translateY` from sheet height → 0 |
| Backdrop | `rgba(0,0,0,0.4)`, opacity 0 → 1, same spring |
| Drag handle | 40 × 4, radius 2, `theme.border`, centred, 20 below the top edge |
| Corners | `borderTopLeftRadius` / `borderTopRightRadius` 16 |
| Dismiss | backdrop tap, Android back, drag past 25% of sheet height **or** velocity > 500 |
| Reduced motion | opacity-only fade, `withTiming(150)`, no translate, drag disabled |

- [x] **Step 1: Add the UI strings**

In `apps/mobile/src/i18n/uiStrings.ts`, add to the key union and all three locale maps:

```ts
  | 'word.fullAnalysis'
  | 'word.root'
  | 'word.noGloss'
  | 'word.close'
```

| key | en | uz | ru |
|---|---|---|---|
| `word.fullAnalysis` | Full analysis | To'liq tahlil | Полный разбор |
| `word.root` | Root | O'zak | Корень |
| `word.noGloss` | No translation for this word | Bu so'z uchun tarjima yo'q | Нет перевода для этого слова |
| `word.close` | Close | Yopish | Закрыть |

`uiStrings.test.ts` already asserts every locale covers every key — it will fail until all three are filled in. That is the point; do not add the key to `en` alone.

- [x] **Step 2: Write the failing tests**

Create `apps/mobile/src/components/WordSheet.test.tsx`. Mock `react-native-reanimated` with its documented jest mock and `react-native-gesture-handler` with pass-through hosts; assert behaviour, not animation frames.

```tsx
describe('WordSheet', () => {
  it('renders nothing when there is no summary', () => {
    const { container } = render(<WordSheet summary={null} {...handlers} />);
    // Not "renders hidden": an always-mounted sheet keeps a full-screen
    // backdrop in the tree and swallows every tap in the reader.
    expect(container.firstChild).toBeNull();
  });

  it('announces itself as a modal dialog', () => {
    render(<WordSheet summary={summary()} {...handlers} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('shows one pill per segment, in segment order', () => {
    render(<WordSheet summary={summary({ segments: [seg(0, 'DET'), seg(1, 'N')] })} {...handlers} />);
    const pills = screen.getAllByTestId('segment-pill');
    expect(pills).toHaveLength(2);
    expect(pills[0]!.textContent).toMatch(/determiner/i);
  });

  it('shows the gloss when there is one', () => {
    render(<WordSheet summary={summary({ gloss: 'the most merciful' })} {...handlers} />);
    expect(screen.getByText('the most merciful')).toBeTruthy();
  });

  it('says so when there is no gloss instead of leaving a blank', () => {
    render(<WordSheet summary={summary({ gloss: null })} {...handlers} />);
    expect(screen.getByText(/no translation/i)).toBeTruthy();
  });

  it('closes on backdrop press', () => {
    const onClose = vi.fn();
    render(<WordSheet summary={summary()} {...handlers} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('sheet-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when the sheet body itself is pressed', () => {
    // The backdrop is a sibling, not a parent -- nesting the sheet inside it
    // makes every tap on the sheet bubble to the dismiss handler and the
    // sheet closes the moment the user reaches for a link.
    const onClose = vi.fn();
    render(<WordSheet summary={summary()} {...handlers} onClose={onClose} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('opens the full analysis for the word it is showing', () => {
    const onOpenDetail = vi.fn();
    render(<WordSheet summary={summary({ wordId: 42 })} {...handlers} onOpenDetail={onOpenDetail} />);
    fireEvent.click(screen.getByText(/full analysis/i));
    expect(onOpenDetail).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }));
  });

  it('links to the root when the word has one', () => {
    const onOpenRoot = vi.fn();
    render(<WordSheet summary={summary({ root: 'rHm' })} {...handlers} onOpenRoot={onOpenRoot} />);
    fireEvent.click(screen.getByText(/rHm|رحم/));
    expect(onOpenRoot).toHaveBeenCalledWith('rHm');
  });

  it('omits the root link entirely for a word with no root', () => {
    // Particles and pronouns have no root. A dead link that navigates to an
    // empty root screen is worse than no link.
    render(<WordSheet summary={summary({ root: null })} {...handlers} />);
    expect(screen.queryByTestId('root-link')).toBeNull();
  });

  it('gives every action a 48dp touch target', () => {
    render(<WordSheet summary={summary({ root: 'rHm' })} {...handlers} />);
    for (const id of ['full-analysis', 'root-link']) {
      expect(Number(screen.getByTestId(id).style.minHeight.replace('px', ''))).toBeGreaterThanOrEqual(48);
    }
  });
});
```

- [x] **Step 3: Run and verify they fail**

Run: `pnpm --filter mobile test -- WordSheet`
Expected: FAIL — module not found.

- [x] **Step 4: Implement**

Build `WordSheet.tsx` to the motion spec table above. Structure, in order:

1. Early `return null` when `summary` is null.
2. `<Animated.View testID="sheet-backdrop">` — absolute fill, `onPress={onClose}`, animated opacity. A **sibling** of the sheet, never its parent.
3. `<GestureDetector>` wrapping `<Animated.View role="dialog" accessibilityViewIsModal>` — absolute bottom, animated `translateY`.
4. Inside: drag handle, the word's Arabic at `typography.arabicTitle`, the gloss (or `word.noGloss`), a `flexWrap` row of `SegmentPill`s with `testID="segment-pill"`, then the two actions with `testID="full-analysis"` and `testID="root-link"`, each `minHeight: touchTargets.minimum`.
5. `BackHandler.addEventListener('hardwareBackPress', ...)` returning `true` while open, removed on close.
6. `Gesture.Pan()` updating a `translateY` shared value, `onEnd` deciding dismiss vs spring-back against the thresholds in the table. Disabled entirely when `useReducedMotion()` is true.

- [x] **Step 5: Run and verify they pass**

Run: `pnpm --filter mobile test -- WordSheet`
Expected: PASS, 11 tests.

- [x] **Step 6: Mutation-check**

Nest the sheet inside the backdrop view. "does not close when the sheet body itself is pressed" must fail. Restore. Then remove the `root === null` guard; "omits the root link entirely" must fail. Restore.

- [x] **Step 7: Lint, type-check, commit**

```bash
pnpm --filter mobile lint && pnpm --filter mobile type-check && pnpm --filter mobile test
git add apps/mobile/src/components/WordSheet.tsx apps/mobile/src/components/WordSheet.test.tsx \
        apps/mobile/src/i18n/uiStrings.ts
git commit -m "feat(mobile): add the word morphology bottom sheet

Motion ported from web's WordPopover (spring damping 28, stiffness 320) so
the two products feel the same. Drag-to-dismiss on gesture-handler; the whole
animation degrades to a 150ms fade under the system reduce-motion setting."
```

---

## Task 9: Tokenize the reader

**Files:**
- Create: `apps/mobile/src/components/AyahText.tsx`
- Create: `apps/mobile/src/components/AyahText.test.tsx`
- Modify: `apps/mobile/src/components/AyahCard.tsx`, `apps/mobile/src/components/AyahCard.test.tsx`
- Modify: `apps/mobile/src/components/SurahReader.tsx`, `apps/mobile/src/components/SurahReader.test.tsx`

**Interfaces:**
- Consumes: `alignAyahTokens` (Task 2), `getWordsForAyah` + `getWordSummary` (Task 6), `WordSheet` (Task 8).
- Produces:
  ```ts
  export function AyahText(props: {
    textUthmani: string;
    words: Word[];             // empty = not loaded yet, render the plain blob
    surahId: number;
    ayahNumber: number;
    onWordPress: (word: Word) => void;
  }): JSX.Element;
  ```

- [x] **Step 1: Write the failing tests for `AyahText`**

```tsx
describe('AyahText', () => {
  it('renders the plain Uthmani text when words have not loaded', () => {
    render(<AyahText textUthmani="أ ب ج" words={[]} surahId={2} ayahNumber={2} onWordPress={noop} />);
    expect(screen.getByText('أ ب ج')).toBeTruthy();
  });

  it('renders one pressable token per word once they load', () => {
    render(<AyahText textUthmani="أ ب ج" words={threeWords} surahId={2} ayahNumber={2} onWordPress={noop} />);
    expect(screen.getAllByTestId('word-token')).toHaveLength(3);
  });

  it('passes the word the token maps to, not the token index', () => {
    // 96:1 is prefixed with a basmala that has no word rows, so token 4 is
    // word 0. Passing the token index here shifts every word's morphology by
    // four for the whole surah.
    const onWordPress = vi.fn();
    render(<AyahText textUthmani={AL_ALAQ_1} words={fiveWords} surahId={96} ayahNumber={1} onWordPress={onWordPress} />);
    fireEvent.click(screen.getAllByTestId('word-token')[0]!);
    expect(onWordPress).toHaveBeenCalledWith(expect.objectContaining({ position: 1 }));
  });

  it('renders the basmala prefix as text with no tap target', () => {
    render(<AyahText textUthmani={AL_ALAQ_1} words={fiveWords} surahId={96} ayahNumber={1} onWordPress={noop} />);
    expect(screen.getAllByTestId('word-token')).toHaveLength(5);
    expect(screen.getByText(/بِسْمِ/)).toBeTruthy();
  });

  it('keeps the waqf pause marks visible', () => {
    // The whole reason the reader tokenizes Uthmani text rather than word
    // rows. If this passes with the marks missing, the phase's central
    // decision has been silently reverted.
    const { container } = render(
      <AyahText textUthmani={AL_BAQARAH_255} words={baqarah255Words} surahId={2} ayahNumber={255} onWordPress={noop} />,
    );
    expect(container.textContent).toContain('ۚ');
    expect(container.textContent).toContain('ۗ');
  });

  it('falls back to the plain blob when alignment fails', () => {
    // Wrong word count for the text. Rendering a partial alignment would
    // attach the wrong morphology to real words.
    const { container } = render(
      <AyahText textUthmani="أ ب ج د ه" words={threeWords} surahId={2} ayahNumber={2} onWordPress={noop} />,
    );
    expect(screen.queryAllByTestId('word-token')).toHaveLength(0);
    expect(container.textContent).toContain('أ ب ج د ه');
  });

  it('does not colour words by part of speech', () => {
    // D7: colour lives on the WbW screen and the sheet. Colouring every word
    // in the reading flow turns a mushaf into a syntax highlighter, and it
    // removes the reason to open the WbW screen at all. Web's WordToken does
    // not colour either.
    render(<AyahText textUthmani="أ ب ج" words={threeWords} surahId={2} ayahNumber={2} onWordPress={noop} />);
    for (const token of screen.getAllByTestId('word-token')) {
      expect(token.style.color).toBe('');
    }
  });

  it('keeps the ayah as one text run for line breaking', () => {
    // Nested <Text> inside a parent <Text>, not a flexWrap row of Views --
    // the row loses native Arabic line breaking and justified mushaf flow,
    // which is the reading surface's whole point (CLAUDE.md §8).
    const { container } = render(
      <AyahText textUthmani="أ ب ج" words={threeWords} surahId={2} ayahNumber={2} onWordPress={noop} />,
    );
    expect(container.querySelector('[data-testid="ayah-run"] [data-testid="word-token"]')).toBeTruthy();
  });
});
```

- [x] **Step 2: Run and verify they fail, then implement `AyahText`**

```tsx
export function AyahText({ textUthmani, words, surahId, ayahNumber, onWordPress }: AyahTextProps) {
  const theme = useThemeColors();
  const tokens = useMemo(
    () =>
      words.length > 0
        ? alignAyahTokens(textUthmani, words.map((word) => word.text_arabic), { surahId, ayahNumber })
        : null,
    // `words`, not `words.length` -- the memo reads text_arabic, so a same-length
    // array with corrected text would otherwise reuse stale tokens. apps/mobile
    // has no eslint-plugin-react-hooks, so nothing would flag it.
    [textUthmani, words, surahId, ayahNumber],
  );

  const style = {
    color: theme.text,
    fontFamily: 'Hafs',
    fontSize: typography.arabicReader,
    textAlign: 'right' as const,
    // textAlign only aligns the block. writingDirection drives the bidi
    // resolution, which orders markers, digits and punctuation correctly
    // inside the Arabic run on Android.
    writingDirection: 'rtl' as const,
  };

  // No words yet, or an ayah alignAyahTokens could not reconcile. Either way
  // the reader shows the complete Uthmani text; only the tap targets are
  // missing, which is the right thing to lose.
  if (!tokens) return <Text style={style}>{textUthmani}</Text>;

  return (
    <Text testID="ayah-run" style={style}>
      {tokens.map((token, index) => {
        const word = token.wordIndex === null ? null : words[token.wordIndex];
        const separator = index === 0 ? '' : ' ';
        if (!word) return <Text key={index}>{separator}{token.text}</Text>;
        return (
          <Text
            key={index}
            testID="word-token"
            accessibilityRole="button"
            accessibilityLabel={word.transliteration ?? word.text_arabic}
            onPress={() => onWordPress(word)}
            suppressHighlighting={false}
          >
            {separator}{token.text}
          </Text>
        );
      })}
    </Text>
  );
}
```

Run: `pnpm --filter mobile test -- AyahText`
Expected: PASS, 7 tests.

- [x] **Step 3: Mutation-check**

Change `words[token.wordIndex]` to `words[index]`. "passes the word the token maps to" must fail. Restore. Then change the `if (!tokens)` fallback to render the joined word text; "keeps the waqf pause marks visible" must fail. Restore.

- [x] **Step 4: Swap `AyahCard`'s `<Text>` for `AyahText`**

`AyahCard` gains `words: Word[]`, `surahId: number`, `onWordPress: (word: Word) => void` and passes them through. Its existing tests stay green — add one:

```tsx
it('still renders the Arabic when the reader has no words for the ayah', () => {
  // Words load per ayah as the list scrolls; a card that renders nothing
  // until they arrive flickers blank on every scroll.
  render(<AyahCard {...props} words={[]} />);
  expect(screen.getByText(props.arabicText)).toBeTruthy();
});
```

- [x] **Step 5: Load words per visible ayah in `SurahReader`**

`SurahReader` already tracks viewability via `onViewableItemsChanged` for reading-position recording. Extend that handler to fetch words for each newly viewable ayah plus a lookahead, cached in a `Map<number, Word[]>` state keyed by `ayah.id`.

```tsx
const WORD_LOOKAHEAD = 3;
```

The whole-surah fetch is deliberately not restored — `corpusRepository.ts:88` records why (6,116 rows for al-Baqarah). Per-ayah with a lookahead keeps the query bounded and, on a local SQLite file, lands before the ayah reaches the middle of the screen.

Add:

```tsx
it('fetches words for ayahs that scroll into view', async () => {
  const getWords = vi.fn(async () => threeWords);
  render(<SurahReader {...props} getWordsForAyah={getWords} />);
  await act(async () => fireViewable([ayah(1), ayah(2)]));
  expect(getWords).toHaveBeenCalledWith(expect.anything(), ayah(1).id);
});

it('does not refetch an ayah it already has', async () => {
  // onViewableItemsChanged fires on every scroll frame that changes the set.
  // Without the cache check this is a query per frame.
  const getWords = vi.fn(async () => threeWords);
  render(<SurahReader {...props} getWordsForAyah={getWords} />);
  await act(async () => fireViewable([ayah(1)]));
  await act(async () => fireViewable([ayah(1)]));
  expect(getWords).toHaveBeenCalledTimes(1 + WORD_LOOKAHEAD);
});
```

- [x] **Step 6: Mount the sheet in `SurahReader`**

`SurahReader` holds `const [openWord, setOpenWord] = useState<WordSummary | null>(null)`, calls `getWordSummary` on press, and renders `<WordSheet>` as a sibling of the `FlatList`. `onOpenDetail` and `onOpenRoot` push the Task 10 and Task 11 routes via `expo-router`.

- [x] **Step 7: Lint, type-check, full suite, commit**

```bash
pnpm --filter mobile lint && pnpm --filter mobile type-check && pnpm --filter mobile test
git add apps/mobile/src/components/AyahText.tsx apps/mobile/src/components/AyahText.test.tsx \
        apps/mobile/src/components/AyahCard.tsx apps/mobile/src/components/AyahCard.test.tsx \
        apps/mobile/src/components/SurahReader.tsx apps/mobile/src/components/SurahReader.test.tsx
git commit -m "feat(mobile): make reader words tappable, opening the morphology sheet

Tokenizes ayah.text_uthmani via alignAyahTokens rather than rendering word
rows, so the waqf pause marks and prefixed basmala stay on screen. Words load
per visible ayah with a 3-ayah lookahead; the whole-surah fetch stays retired."
```

---

## Task 10: The word-detail screen

**Files:**
- Create: `apps/mobile/app/word/[surah]/[ayah]/[position].tsx`
- Create: `apps/mobile/app/word/[surah]/[ayah]/[position].test.tsx`
- Modify: `apps/mobile/src/i18n/uiStrings.ts`

**Interfaces:**
- Consumes: `getWordAtLocation` (Task 6), `SegmentPill` (Task 7).
- Produces: the route `/word/[surah]/[ayah]/[position]`, pushed by `WordSheet`'s "Full analysis".

- [x] **Step 1: Add UI strings**

`word.segments`, `word.grammar`, `word.notFound`, `word.transliteration` — in en/uz/ru, same table format as Task 8.

- [x] **Step 2: Write the failing tests**

```tsx
describe('word detail route', () => {
  it('validates the coordinates before querying', async () => {
    // Route params are strings from a deep link, not trusted input. `abc`,
    // `0`, `-1`, `1e9` and `2.5` must all resolve to the not-found state, not
    // reach the query layer.
    for (const bad of ['abc', '0', '-1', '1e9', '2.5', '']) {
      const query = vi.fn();
      renderRoute({ surah: bad, ayah: '1', position: '1' }, query);
      await screen.findByText(/not found/i);
      expect(query).not.toHaveBeenCalled();
    }
  });

  it('rejects a surah above 114 and an ayah above 286', async () => {
    const query = vi.fn();
    renderRoute({ surah: '115', ayah: '1', position: '1' }, query);
    await screen.findByText(/not found/i);
    expect(query).not.toHaveBeenCalled();
  });

  it('renders one pill per segment in order', async () => {
    renderRoute({ surah: '2', ayah: '255', position: '1' });
    expect(await screen.findAllByTestId('segment-pill')).toHaveLength(2);
  });

  it('shows the not-found state for coordinates the corpus does not carry', async () => {
    renderRoute({ surah: '2', ayah: '255', position: '99' });
    expect(await screen.findByText(/not found/i)).toBeTruthy();
  });

  it('shows the grammar note, not the garbled grammar_arabic column', async () => {
    // grammar_arabic is the corpus's own mangled field; grammar_note is the
    // clean one. Both PR #44 and PR #45 shipped the wrong column.
    renderRoute({ surah: '2', ayah: '255', position: '1' });
    expect(await screen.findByText('nominative masculine noun')).toBeTruthy();
  });
});
```

- [x] **Step 3: Implement**

Reuse the `parseSurahId` / `parseAyahNumber` validators already in `apps/mobile/app/surah/[surahId].tsx` — extract them to `apps/mobile/src/data/routeParams.ts` and import in both rather than copying (§3 DRY). Add `parsePosition` there:

```ts
/** The corpus's longest ayah is 2:282 at 128 words (measured 2026-08-16).
 *  The bound only has to reject nonsense before it reaches a query; a word
 *  that does not exist resolves to the not-found state either way. */
const MAX_WORDS_PER_AYAH = 128;

export function parsePosition(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_WORDS_PER_AYAH) return null;
  return parsed;
}
```

The two guards catch different inputs and both are needed: `Number.isInteger` rejects `'2.5'`, while `'1e9'` gets past it (`Number('1e9')` is integer-valued) and is stopped only by the upper bound. Dropping either one lets one of the test's cases through.

Run: `pnpm --filter mobile test -- position`
Expected: PASS, 5 tests.

- [x] **Step 4: Mutation-check**

Remove the `parsePosition` bound check. The validation test must fail. Restore.

- [x] **Step 5: Commit**

```bash
git add "apps/mobile/app/word" apps/mobile/src/data/routeParams.ts apps/mobile/src/i18n/uiStrings.ts \
        "apps/mobile/app/surah/[surahId].tsx"
git commit -m "feat(mobile): add the full word-analysis screen"
```

---

## Task 11: The root screen

**Files:**
- Create: `apps/mobile/app/root/[buckwalter].tsx`
- Create: `apps/mobile/app/root/[buckwalter].test.tsx`
- Modify: `apps/mobile/src/i18n/uiStrings.ts`, `apps/mobile/src/data/routeParams.ts`

**Interfaces:**
- Consumes: `getRootScreen` (Task 6).
- Produces: the route `/root/[buckwalter]`, pushed by `WordSheet`'s root link.

- [x] **Step 1: Add UI strings**

`root.title`, `root.forms`, `root.definitions`, `root.noDefinition`, `root.notFound` — en/uz/ru.

- [x] **Step 2: Write the failing tests**

```tsx
describe('root route', () => {
  it('rejects a buckwalter string outside the corpus alphabet', async () => {
    // Route params are untrusted. The Buckwalter alphabet is a fixed set;
    // anything else cannot be a root and must not reach the query.
    const query = vi.fn();
    for (const bad of ['../etc', 'r%48m', 'r m', '']) {
      renderRoute(bad, query);
      await screen.findByText(/not found/i);
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('shows the root in Arabic, its forms and its definitions', async () => {
    renderRoute('rHm');
    expect(await screen.findByText('رحم')).toBeTruthy();
    expect(screen.getAllByTestId('root-form').length).toBeGreaterThan(0);
    expect(screen.getByText(/mercy/i)).toBeTruthy();
  });

  it('renders forms and the root when a definition is missing', async () => {
    // 24 roots still have no definition (hw_gap_24.tsv). A screen that shows
    // nothing at all for them loses the forms too, which do exist.
    renderRoute('zzq', { definitions: [] });
    expect(await screen.findByText(/no definition/i)).toBeTruthy();
    expect(screen.getAllByTestId('root-form').length).toBeGreaterThan(0);
  });

  it('shows the not-found state for a root the corpus does not carry', async () => {
    renderRoute('qqq', null);
    expect(await screen.findByText(/not found/i)).toBeTruthy();
  });
});
```

- [x] **Step 3: Implement**

**Do not write a validator.** `packages/data/src/text/buckwalter.ts` already exports `parseRootParam(raw: string): string | null` — it validates against the Buckwalter charset, enforces `ROOT_BUCKWALTER_MAX`, and rejects double-encoded input, which is exactly this route's threat. CLAUDE.md §2 records that a fork of this repo lost these validators; writing a second copy here is how that happens.

It is **not currently re-exported from `./mobile`** — `packages/data/src/mobile.ts:44` exports the `text/arabic.js` helpers but nothing from `text/buckwalter.js`. Add:

```ts
export { parseRootParam, isRootBuckwalter, ROOT_BUCKWALTER_MAX } from './text/buckwalter.js';
```

`buckwalter.ts` has no runtime imports, so this adds no edge to the Metro graph. Re-run `pnpm --filter @quran-corpus/data test` to confirm `mobile-entry.test.ts` still passes.

Then `routeParams.ts` just re-exports it for the route to import alongside `parseSurahId`.

Run: `pnpm --filter mobile test -- buckwalter && pnpm --filter @quran-corpus/data test`
Expected: PASS, 4 tests plus the entry guards.

- [x] **Step 4: Mutation-check**

Replace the `parseRootParam` call with `(raw) => raw || null`. The rejection test must fail. Restore.

- [x] **Step 5: Commit**

```bash
git add "apps/mobile/app/root" apps/mobile/src/data/routeParams.ts apps/mobile/src/i18n/uiStrings.ts
git commit -m "feat(mobile): add the minimal root screen"
```

---

## Task 12: The word-by-word screen, and both entry points

**Files:**
- Create: `apps/mobile/src/components/WbwGrid.tsx`, `WbwGrid.test.tsx`
- Create: `apps/mobile/src/components/VersePicker.tsx`, `VersePicker.test.tsx`
- Create: `apps/mobile/app/surah/[surahId]/words.tsx` + test
- Create: `apps/mobile/app/(tabs)/morphology.tsx` + test
- Modify: `apps/mobile/app/(tabs)/_layout.tsx`, `apps/mobile/src/components/icons/Icon.tsx`, `apps/mobile/src/components/SurahReader.tsx`, `apps/mobile/src/i18n/uiStrings.ts`

**Interfaces:**
- Consumes: `getWbwRange` (Task 6), `SegmentPill` (Task 7), `getLastReadingPosition` + `useUserDbOnFocus` (existing).
- Produces: the `/surah/[surahId]/words` route and the `morphology` tab.

**Note on the route path:** `apps/mobile/app/surah/[surahId].tsx` must become `apps/mobile/app/surah/[surahId]/index.tsx` for expo-router to serve a sibling `words.tsx`. Move it with `git mv` so history follows, and confirm every existing `href` to `/surah/[surahId]` still resolves — expo-router treats the two forms as the same route, but the import aliases inside the moved file need one more `../`.

**Page size:** 10 ayahs. Al-Baqarah's densest ten run to roughly 400 words; a whole-surah load is 6,116 and is what `corpusRepository.ts:88` retired.

- [x] **Step 1: Add UI strings and the two icons**

`wbw.title`, `wbw.previous`, `wbw.next`, `wbw.jumpToAyah`, `wbw.rangeLabel`, `tabs.morphology`, `morphology.noHistory` in en/uz/ru. Add `'words'` and `'root'` to `IconName` in `Icon.tsx` with paths drawn in the same style as the existing four.

- [x] **Step 2: Write the failing `VersePicker` tests**

```tsx
describe('VersePicker', () => {
  it('shows the current range', () => {
    render(<VersePicker surahId={2} from={11} to={20} ayahCount={286} {...handlers} />);
    expect(screen.getByText('11–20')).toBeTruthy();
  });

  it('disables previous on the first page', () => {
    render(<VersePicker surahId={2} from={1} to={10} ayahCount={286} {...handlers} />);
    expect(screen.getByTestId('wbw-prev').getAttribute('aria-disabled')).toBe('true');
  });

  it('disables next on the last page', () => {
    // 286 is not a multiple of 10, so the last page is 281-286. An off-by-one
    // here either hides ayah 286 or offers an empty page past the end.
    render(<VersePicker surahId={2} from={281} to={286} ayahCount={286} {...handlers} />);
    expect(screen.getByTestId('wbw-next').getAttribute('aria-disabled')).toBe('true');
  });

  it('clamps the final page to the surah length', () => {
    const onRange = vi.fn();
    render(<VersePicker surahId={2} from={271} to={280} ayahCount={286} onRange={onRange} />);
    fireEvent.click(screen.getByTestId('wbw-next'));
    expect(onRange).toHaveBeenCalledWith(281, 286);
  });

  it('gives both controls a 48dp target', () => {
    render(<VersePicker surahId={2} from={11} to={20} ayahCount={286} {...handlers} />);
    for (const id of ['wbw-prev', 'wbw-next']) {
      expect(Number(screen.getByTestId(id).style.minHeight.replace('px', ''))).toBeGreaterThanOrEqual(48);
    }
  });
});
```

- [x] **Step 3: Write the failing `WbwGrid` tests**

```tsx
describe('WbwGrid', () => {
  it('renders one cell per word', () => {
    render(<WbwGrid page={page({ words: 5 })} uiLocale="en" onWordPress={noop} />);
    expect(screen.getAllByTestId('wbw-cell')).toHaveLength(5);
  });

  it('gives each cell its own segments, not the whole page\'s', () => {
    // getWbwRange returns one shared segment map keyed by word_id. A cell
    // that renders the map rather than its own entry shows every word in the
    // page the same grammar, and it looks entirely plausible.
    render(<WbwGrid page={pageWithDistinctSegments()} uiLocale="en" onWordPress={noop} />);
    const cells = screen.getAllByTestId('wbw-cell');
    expect(cells[0]!.textContent).not.toBe(cells[1]!.textContent);
  });

  it('lays cells out as a wrapping row, not one text run', () => {
    // The reader keeps mushaf flow with nested <Text>; the WbW screen is a
    // chip grid by design, so each cell is a real 48dp Pressable with its own
    // accessibility node -- this is the accessible path to the same data.
    const { container } = render(<WbwGrid page={page({ words: 3 })} uiLocale="en" onWordPress={noop} />);
    expect(container.querySelector('[data-testid="wbw-row"]')!.style.flexWrap).toBe('wrap');
  });

  it('gives every cell a 48dp target', () => {
    render(<WbwGrid page={page({ words: 3 })} uiLocale="en" onWordPress={noop} />);
    for (const cell of screen.getAllByTestId('wbw-cell')) {
      expect(Number(cell.style.minHeight.replace('px', ''))).toBeGreaterThanOrEqual(48);
    }
  });

  it('renders a word with no segments rather than dropping it', () => {
    render(<WbwGrid page={page({ words: 3, segmentsFor: [0, 2] })} uiLocale="en" onWordPress={noop} />);
    expect(screen.getAllByTestId('wbw-cell')).toHaveLength(3);
  });
});
```

- [x] **Step 4: Implement both, run, verify**

`WbwGrid` uses `flexDirection: 'row-reverse'`, `flexWrap: 'wrap'` for RTL cell order. Per D6 this is the grid surface, so losing native line breaking is the intended trade.

Run: `pnpm --filter mobile test -- Wbw VersePicker`
Expected: PASS, 10 tests.

- [x] **Step 5: Mutation-check**

In `WbwGrid`, pass the whole `page.segments` map to every cell instead of `page.segments.get(word.id)`. "gives each cell its own segments" must fail. Restore. In `VersePicker`, change the clamp to `from + 9`; "clamps the final page" must fail. Restore.

- [x] **Step 6: Build the WbW route**

`apps/mobile/app/surah/[surahId]/words.tsx` — validate `surahId` with the shared `parseSurahId`, read an optional `?from=` param, default to ayah 1, render `VersePicker` above a `FlatList` of `WbwGrid` pages, open `WordSheet` on cell press.

- [x] **Step 7: Add the reader's entry control**

Add a `words` icon button to `SurahReader`'s existing `ListHeaderComponent` row, `minHeight: touchTargets.minimum`, pushing `/surah/[surahId]/words`.

```tsx
// ponytail: lives in the list header, so it scrolls away with the surah
// title. The morphology tab is the persistent entry point; giving the reader
// its own fixed top bar to hold one button means either a second surah title
// on screen or a navigation-header rewrite, and app/_layout.tsx currently
// runs headerShown: false for every route.
```

- [x] **Step 8: Add the fifth tab**

`apps/mobile/app/(tabs)/morphology.tsx` reads `getLastReadingPosition` through the existing `useUserDbOnFocus` and redirects to that surah's WbW screen; with no history it shows `morphology.noHistory` and a link to the surah list. Register it in `_layout.tsx` between `bookmarks` and `settings`.

```tsx
it('sends a reader with history straight to their surah', async () => {
  renderTab({ surahId: 2, ayahNumber: 255 });
  expect(await screen.findByTestId('redirect')).toHaveAttribute('data-href', '/surah/2/words?from=255');
});

it('offers the surah list when there is no history', async () => {
  // The tab is reachable on a fresh install, before anything has been read.
  renderTab(null);
  expect(await screen.findByText(/no reading history/i)).toBeTruthy();
});
```

- [x] **Step 9: Full suite, lint, type-check, commit**

```bash
pnpm --filter mobile lint && pnpm --filter mobile type-check && pnpm --filter mobile test
pnpm -r type-check && pnpm -r test
git add apps/mobile
git commit -m "feat(mobile): add the word-by-word screen, reader control and morphology tab"
```

---

## Task 13: Device gate

**Files:**
- Modify: `README.md`
- Modify: this plan's Verification Log

**Interfaces:** consumes everything. Produces the §10 exit criterion.

- [x] **Step 1: Add the checklist to `README.md`**

Append after the M1 Android Smoke Test:

```markdown
## M3 Morphology Smoke Test

Run on a physical Android device, on a `preview` profile APK. Confirm the EAS
upload is ~43 MB — a ~5 MB upload means `.easignore` dropped the bundled DB
and every check below will fail for the wrong reason.

1. Open al-Baqarah. Confirm the pause marks (`ۚ ۗ ۖ`) are still visible in
   2:255 — the reader now tokenizes the text and this is what tokenizing the
   word rows instead would have deleted.
2. Open al-Alaq (96). Confirm the basmala still prefixes ayah 1.
3. Open 2:44. Confirm the `۞` marker still leads the ayah.
4. Tap a word. The sheet springs up from the bottom.
5. Drag the sheet halfway down and let go — it springs back. Drag it past
   halfway — it dismisses.
6. Tap the backdrop — it dismisses. Press Android back — it dismisses.
7. Scroll the reader with the sheet open. The scroll must not fight the drag.
8. Settings → Accessibility → Remove animations, **on**. Reopen the sheet: it
   fades, does not slide, and does not drag. Turn it back off without
   restarting the app; the slide returns.
9. Sheet → Full analysis. Segment pills are coloured and legible.
10. Sheet → root link. The root screen shows Arabic, forms and a definition.
11. Tap a word with no root (a pronoun, e.g. 2:255 هُوَ). Confirm there is
    **no** root link rather than a dead one.
12. Reader header → word-by-word. Page forward to the last page of al-Baqarah;
    confirm it ends at 286 and Next is disabled.
13. Morphology tab. Confirm it opens the WbW screen at your last-read position.
14. Repeat 4, 9 and 12 in dark mode. Every POS colour must be legible on the
    warm near-black background.
15. System font size at maximum: repeat 4 and 12. Nothing clips; the sheet
    still scrolls to its actions.
16. Airplane mode: repeat 1, 4 and 12. All of it is local.
```

- [ ] **Step 2: Build**

```bash
cd apps/mobile && npx eas-cli@latest build --platform android --profile preview
```

Confirm the upload size before the build queues.

- [ ] **Step 3: Run every check and record the result**

Fill in the Verification Log below. Per the M2 log's convention: **unexercised checks are recorded as unexercised, never implied to have passed.** A FAIL is a finding, not a blocker to hide — record it, fix it, and note whether the fix was re-verified on device or is carried to the next build.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/plans/phase-m3-morphology-mvp.md
git commit -m "docs(mobile): record the M3 on-device verification run"
```

---

## Verification Log

### Run 1 — 2026-08-17, owner's physical Android device

EAS build `bac194d4` at commit `9421560` (preview profile, Android APK). Upload
was 43.6 MB, so the bundled DB went with it — a ~5 MB upload would have meant
`.easignore` dropped it.

**All 22 checks PASS.** One finding against check 4, which is a rejected
behaviour rather than a broken one — the sheet moves correctly, the owner does
not want it to move that way. Per the M2 log's convention, an unexercised check
is recorded as unexercised and never implied to have passed; the M2 carry-over
below is the only row not exercised on this build.

| # | Check | Result |
| --- | --- | --- |
| 1 | Pause marks still visible in 2:255 | PASS |
| 2 | Basmala still prefixes ayah 1 of al-Alaq (96) | PASS |
| 3 | `۞` marker still leads 2:44 | PASS |
| 4 | Word tap springs the sheet up from the bottom | PASS, finding F4 |
| 5 | Sheet drag: halfway springs back, past halfway dismisses | PASS |
| 6 | Backdrop tap and Android back both dismiss the sheet | PASS |
| 7 | Reader scroll does not fight the sheet drag | PASS |
| 8 | Reduce animations — in-app switch, both directions, then the OS setting | PASS |
| 9 | Full analysis: segment pills coloured and legible | PASS |
| 10 | Root screen shows Arabic, forms and a definition | PASS |
| 11 | Rootless word (2:255 هُوَ) shows no root link | PASS |
| 12 | Word-by-word pages to 286 and disables Next | PASS |
| 13 | Morphology tab opens WbW at the last-read position | PASS |
| 14 | Checks 4, 9, 12 in dark mode — every POS colour legible | PASS |
| 15 | System font size at maximum: checks 4 and 12, nothing clips | PASS |
| 16 | Airplane mode: checks 1, 4, 12 all local | PASS |
| 17 | Basmala is its own banner above ayah 1, not also inside it | PASS |
| 18 | al-Fatiha basmala once as ayah 1; at-Tawba none | PASS |
| 19 | Header back returns to reader; Android back to the surah list | PASS |
| 20 | Morphology tab keeps the tab bar, one header bar, back exits | PASS |
| 21 | Multi-segment word coloured per segment, joined with no gaps | PASS |
| 22 | Arabic size Small and Extra large move the Arabic, not the UI | PASS |

**F4 — the sheet spring is rejected outright.** Owner, on check 4: *"i dont like
that spring. just regular movement is fine. no spring."* This is the third
device run to land on this one value: the ported web spring (28/320) read as
jumpy, a critically damped retune (46/520) read as slow, and neither pass was
what the owner wanted. Fixed in `3ad1086` by removing the physics rather than
tuning it a third time — `withTiming` on a decelerating curve in (220ms) and an
accelerating one out (180ms), backdrop fade unchanged at 150ms. Web's
`WordPopover` keeps its own spring; the divergence is deliberate and commented.
**Not re-verified on device — carried to the next build.**

**Question raised on check 3, answered, not a defect.** The `۞` is the
rub'-el-ḥizb sign (U+06DE), a mushaf divider marking each quarter of a ḥizb (30
juz' → 60 ḥizb → 240 quarters), which is why it recurs roughly every 16 ayahs and
appears at 4:100 as well as 2:44. It is part of the Uthmani source text — 199
occurrences across the corpus — and the reader renders it rather than generating
it. Check 3's intent stands: it is exactly the character the tokenizer must not
eat.

**M2 carry-over, still open.** M2's Run 2 remains pending. Its fix (`b795975`)
is an ancestor of this build, so the check *could* have been closed here but was
not run.

| Carry-over | Result |
| --- | --- |
| M2 Run 2 — three-digit ayah number inside the rosette at max font size | unexercised |

**Known and not a finding:** the build warns that the `preview` profile names
channel `preview` while `expo-updates` is not installed. OTA updates are out of
scope for M3; adding the package is a §12 dependency decision that has not been
taken.

**Review debt on this build.** CLAUDE.md §5 calls for a `/code-review` pass over
Tasks 7 and 8 of the M3b plan, which write the on-device user DB. The owner
waived it on 2026-08-17. That is the third such override and it is recorded here
rather than left implicit; the code it covers is commits `37ae2d7` and `a137e9f`.

### Run 2 — pending

Carries two re-checks: **check 4** closes F4 (the sheet spring, rejected on Run
1 and removed in `3ad1086`), and the **M2 carry-over** closes M2's Run 2 (fix
`b795975`, an ancestor of this build).

| # | Check | Result |
| --- | --- | --- |
| 1 | Pause marks still visible in 2:255 | unexercised |
| 2 | Basmala still prefixes ayah 1 of al-Alaq (96) | unexercised |
| 3 | `۞` marker still leads 2:44 | unexercised |
| 4 | Word tap raises the sheet on a timing curve — no spring, no bounce, no overshoot (closes F4) | unexercised |
| 5 | Sheet drag: under a quarter settles back without bouncing, past a quarter or a fast flick dismisses | unexercised |
| 6 | Backdrop tap and Android back both dismiss the sheet | unexercised |
| 7 | Reader scroll does not fight the sheet drag | unexercised |
| 8 | Reduce animations — in-app switch, both directions, then the OS setting | unexercised |
| 9 | Full analysis: segment pills coloured and legible | unexercised |
| 10 | Root screen shows Arabic, forms and a definition | unexercised |
| 11 | Rootless word (2:255 هُوَ) shows no root link | unexercised |
| 12 | Word-by-word pages to 286 and disables Next | unexercised |
| 13 | Morphology tab opens WbW at the last-read position | unexercised |
| 14 | Checks 4, 9, 12 in dark mode — every POS colour legible | unexercised |
| 15 | System font size at maximum: checks 4 and 12, nothing clips | unexercised |
| 16 | Airplane mode: checks 1, 4, 12 all local | unexercised |
| 17 | Basmala is its own banner above ayah 1, not also inside it | unexercised |
| 18 | al-Fatiha basmala once as ayah 1; at-Tawba none | unexercised |
| 19 | Header back returns to reader; Android back to the surah list | unexercised |
| 20 | Morphology tab keeps the tab bar, one header bar, back exits | unexercised |
| 21 | Multi-segment word coloured per segment, joined with no gaps | unexercised |
| 22 | Arabic size Small and Extra large move the Arabic, not the UI | unexercised |
| 23 | Reader header. Tap the globe. The language sheet slides up; pick a different language and it closes on its own, with the translations underneath already changed. Reopen it: backdrop tap dismisses, Android back dismisses, drag down past a quarter dismisses. With a word sheet already up, both the globe and the words button replace it rather than stacking a second backdrop. | unexercised |
| 24 | There is no fixed language pill row above ayah 1 any more. The first ayah sits directly under the surah heading. | unexercised |
| 25 | Scroll down until the big surah heading leaves the screen. The surah name appears in the header bar. Scroll back to the top: it goes away again. Repeat at maximum system font size — the name must appear later, not at the top. | unexercised |
| 26 | Settings → **Reduce animations: on**. Open the language sheet: it fades, does not slide, and does not drag. | unexercised |
| 27 | Settings → Language → Русский, then open any surah other than 1 and 9. With TalkBack on, focus the basmala banner: it is announced in Russian, not as "Bismillah". | unexercised |

| Carry-over | Result |
| --- | --- |
| M2 Run 2 — three-digit ayah number inside the rosette at max font size | unexercised |

---

## Risks

| # | Risk | Mitigation | Rollback |
|---|---|---|---|
| R1 | `alignAyahTokens` fails on an ayah the 6,236-row check did not cover (a future DB rebuild changes `text_uthmani`). | Returns `null`, caller renders the raw blob. Text is never wrong, only untappable. | None needed — the fallback is the rollback. |
| R2 | Nested-`<Text>` word tokens are glyph-sized and TalkBack reads the parent as one node, so per-word a11y in the reader is weak. | **Accepted, per D6.** The WbW screen is the accessible path: real 48dp `Pressable`s, one a11y node each. Named in the plan rather than papered over. | Switch the reader to `flexWrap` and lose mushaf flow — only if device testing shows the tokens are genuinely untappable. |
| R3 | The drag gesture fights the reader's `FlatList` scroll. Device-only; no test catches it. | Checklist step 7 exists for exactly this. `Gesture.Pan().activeOffsetY([-10, 10])` if it bites. | Drop drag, keep backdrop + back (D9 minus the drag). |
| R4 | Per-ayah word fetch flashes the plain blob before tokens arrive. | 3-ayah lookahead; the query is local SQLite. | Raise the lookahead. Do **not** restore the whole-surah fetch — `corpusRepository.ts:88` records why it was removed. |
| R5 | `git mv` of the surah route breaks existing `href`s. | expo-router treats `x.tsx` and `x/index.tsx` as one route; Task 12 verifies every href. Home tab, bookmarks and the surah list all link here. | Revert the move; nest `words.tsx` under a different segment. |
| R6 | A dark POS colour fails AA on mobile's warm `#151412`. | Task 5 Step 1 measures before writing; Task 5's test enforces it. | Lighten the value in the palette — the parity test forces `globals.css` to follow. |
| R7 | This is the app's first reanimated code; the babel plugin or `GestureHandlerRootView` could be misconfigured. | **Already verified 2026-08-16**: `babel.config.js:5` has `react-native-reanimated/plugin`, `app/_layout.tsx:75` wraps the tree in `GestureHandlerRootView`. | n/a |

---

## Not in this phase

Assigned onward, not forgotten:

- **Dictionary + Search** (the next phase): dictionary browse, root search, concordance, lemma frequency, verb concordance, offline search.
- **Web adopting `alignAyahTokens`** — web's reader has the same pause-mark and basmala loss. Issue opened in Task 2 Step 11.
- **`--form-*` consumers on mobile** — the tokens move to the palette in Task 4 because they live in the same `globals.css` block, but nothing on mobile renders derived forms until the dictionary ships.
- **Concept tags** — `word_concept_tags` is in the bundled DB and `WordDetail` carries them; no screen in this phase reads them.
- **`@expo/ui`** — installed, imported nowhere. Either use it or drop it; not this phase's call.
- **A fixed reader top bar** — the WbW control scrolls away with the list header (Task 12 Step 7). Revisit with the M4 tab restructure.
- **M2 open debt** — branch `fix/m2-medallion-three-digit-fontsize` is unmerged, and the three-digit rosette fix has never run on a device. Fold its re-check into Task 13's build.
