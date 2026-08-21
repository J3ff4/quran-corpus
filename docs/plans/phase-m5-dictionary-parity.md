# M5 Dictionary Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `apps/mobile`'s three dictionary surfaces — browse, root entry, lemma/verb entry — up to web's, so device checks 34 and 35 pass on content parity and not just on "it opens".

**Architecture:** No schema change, no query change. Every field M5 renders is already on a type `@quran-corpus/data/mobile` exports (`ConcordanceEntry.transliteration/.gloss/.form_id`, `LemmaEntry.senses/.count/.root_definition_source`, `RootForm.form_translit/.occurrence_count`), and `getRootNeighbors` is already on that entry point. One pure helper (`categorizeFormLabel`) moves out of `apps/web` into `packages/data` because both apps now need it; colour *values* stay per-app. Everything else is React Native components in `apps/mobile`.

**Tech Stack:** Expo Router, React Native 0.86, expo-sqlite 57, reanimated 4.5, vitest + `@testing-library/react` with `vi.mock('react-native')`.

**Spec:** none. Design was brainstormed and approved in-session on 2026-08-21 (bounded→architectural path, screenshots from web as the parity reference); the decisions are restated in **Design decisions** below so this plan stands alone.

## Global Constraints

- CLAUDE.md is binding: §2 (no schema/query logic in an app), §3 (DRY/SOLID/OWASP), §4 (the loop **including step 4, the mutation-check**), §5 (independent review triggers), §9 (Conventional Commits), §10 (tests + the device gate), §12 (ask before adding a dependency).
- **No new dependency.** This phase adds none. If a task seems to need one, stop and ask.
- `apps/mobile` imports from `@quran-corpus/data/mobile` only. Never the barrel — it drags the native libsql driver into Metro.
- `packages/data/tests/mobile-entry.test.ts` and `tests/client-entry.test.ts` are not weakened. Widening an entry point is fine; reaching `db.ts`, `migrate.ts` or a backfill is not.
- **§5 independent review is NOT triggered by this phase.** Task 1 touches `packages/data` but changes no schema and no query — it moves a pure string function and widens two export lists. No trust boundary moves; no on-device user-DB write. Ships on §4 self-review + lint/type-check/tests. If a task ends up editing a file under `src/queries/`, that changes and the user must be asked to run `/code-review` (§4 step 5, user-triggered).
- UI locale (`en`/`uz`/`ru`) is separate from content language. **Every new string lands in all three locales** in `apps/mobile/src/i18n/uiStrings.ts`, and its key is added to the `UiStringKey` union.
- `t()` has no interpolation. Compose counts by concatenation at the call site, as `FrequencyList` already does.
- WCAG AA: colour never carries meaning alone. Selection = tint **and** border **and** weight. Contrast is measured against the surface the text actually sits on.
- One logical change per commit. Commit only after §4's loop closes for that task.
- Run from repo root: `pnpm --filter @quran-corpus/mobile test`, `pnpm --filter @quran-corpus/data test`, `pnpm -r lint`, `pnpm -r typecheck`.

---

## Design decisions

Locked in session, do not re-litigate:

1. **Browse is one screen.** Search box + alphabet grid + sort toggle + root rows on `/dictionary`, like web's `DictionaryBrowser`. `LetterScreen` and its route are deleted.
2. **Row tap target unchanged.** A concordance row opens the reader at that ayah. The new 3-part reference `2:3:6` is display text, not a second link. (Owner overrode the recommendation to route the ref to the word page.)
3. **Frequent keeps its tab + chips**, restyled as a ranked table (rank, form, labelled count) sharing Browse's row component.
4. **Long definitions clamp with a Show more toggle.**
5. **The ⓘ next to "Translated as" opens a bottom sheet**, reusing `BottomSheet`.
6. **"Show full verse" is in scope** — per-row state inside `ConcordanceList`, mirroring web's `ConcordanceVerse`.
7. **Skipped, deliberately:** URL/query-param mirroring (no address bar), "Show more" DOM paging in Browse (FlatList already virtualizes 1642 rows), per-letter counts on the grid (web computes them but never displays them — `AlphabetGrid` uses `counts` only for present/absent).
8. **Accent divergence stays.** Mobile's accent is `#1f6f5b`, not web's terracotta (owner ruling 2026-08-16). Parity is content and layout, not brand colour.

---

## File Structure

**`packages/data`** — one file moved, two entry points widened. No query touched.

| File | Responsibility |
| --- | --- |
| `src/morphology/formCategory.ts` | **new** — `FormCategory` + `categorizeFormLabel`, pure, no imports |
| `src/index.ts`, `src/client.ts`, `src/mobile.ts` | re-export it; `mobile.ts` also gains `foldRootArabic` |
| `tests/formCategory.test.ts` | **new** — moved from `apps/web/src/test/formCategoryColor.test.ts`, extended to all 49 live labels |
| `tests/mobile-entry.test.ts` | asserts the new exports |

**`apps/web`** — one import line. `formCategoryColor.ts` keeps the CSS-var mapping and re-exports the classifier so no call site changes.

**`apps/mobile`** — new presentational components, rebuilt screens, one screen deleted.

| File | Responsibility |
| --- | --- |
| `src/theme/formTint.ts` | **new** — `formTint(theme, posLabel)` → `{ color, tint }` |
| `src/theme/tokens.ts` | gains `form: Record<FormCategory, string>` per theme |
| `src/components/EntryHeader.tsx` | **new** — centred masthead: Arabic, translit, chip row, "N occurrences" |
| `src/components/ClampedText.tsx` | **new** — `numberOfLines` clamp + Show more/less |
| `src/components/DefinitionCard.tsx` | **new** — bordered card: clamped definition + source credit |
| `src/components/FormFilterChips.tsx` | **new** — wrapping multi-select derived-form chips |
| `src/components/DictionaryRow.tsx` | **new** — shared root/lemma/verb list row (rank, Arabic, gloss, count) |
| `src/components/ConcordanceList.tsx` | row gains 3-part ref, form pill, translit, gloss, Show-full-verse |
| `src/components/FrequencyList.tsx` | ranked table over `DictionaryRow` |
| `src/screens/DictionaryScreen.tsx` | Browse becomes one screen |
| `src/screens/LemmaScreen.tsx` | full web parity |
| `src/screens/LetterScreen.tsx` | **deleted** |
| `app/root/[buckwalter].tsx` | header parity + form filtering |
| `app/dictionary/letter/[letter].tsx` | **deleted** |
| `src/data/corpusRepository.ts` | `getAdjacentRoots`, `getAllRootsForBrowse`, filtered-concordance wrappers |
| `src/data/routeParams.ts` | `parseLetterParam` deleted with its only caller |
| `src/i18n/uiStrings.ts` | new keys × 3 locales |
| `README.md` | device checks 34–36 rewritten to bite on parity |

Screens live in `src/screens/`; route files stay thin. A test file under `app/` becomes a route (expo-router `require.context`), so route tests live in `src/test/routes/`.

---

## Task 1: Share the form classifier

`categorizeFormLabel` is pure string work that both apps now need. §3 DRY and §2 ("never duplicate query/domain logic into an app") put it in `packages/data`. The colour mapping stays in web — it returns CSS variables that mean nothing to React Native.

**Files:**
- Create: `packages/data/src/morphology/formCategory.ts`
- Create: `packages/data/tests/formCategory.test.ts`
- Modify: `packages/data/src/index.ts`, `packages/data/src/client.ts`, `packages/data/src/mobile.ts`
- Modify: `packages/data/tests/mobile-entry.test.ts`
- Modify: `apps/web/src/lib/formCategoryColor.ts`
- Delete: `apps/web/src/test/formCategoryColor.test.ts` (its `categorizeFormLabel` half moves; its `formCategoryColor` half is re-created in the same commit — see step 5)

**Interfaces:**
- Produces: `type FormCategory = 'verb' | 'verbal-noun' | 'active-participle' | 'passive-participle' | 'noun' | 'adjective' | 'other'` and `categorizeFormLabel(posLabel: string): FormCategory`, exported from `@quran-corpus/data`, `/client` and `/mobile`. Also `foldRootArabic(root: string): string` on `/mobile` (Task 9 consumes it).

- [ ] **Step 1: Write the failing test**

Create `packages/data/tests/formCategory.test.ts`. The label table is every distinct `root_forms.pos_label` in the shipped DB — **49 values**, re-queried 2026-08-21 against `apps/mobile/assets/db/quran.db`. Two are new since web's copy was written (`Location adverb`, `Form XI active participle`); both already classify correctly, which is the point of failing closed.

```ts
import { describe, it, expect } from 'vitest';
import { categorizeFormLabel } from '../src/morphology/formCategory.js';

// Every distinct root_forms.pos_label DB-wide (49 values, queried 2026-08-21).
// A future label not in this list must be added here deliberately -- this test
// fails closed so a new label never silently falls into 'other' unnoticed.
const KNOWN_LABELS: Record<string, ReturnType<typeof categorizeFormLabel>> = {
  'Noun': 'noun',
  'Form I verb': 'verb',
  'Active participle': 'active-participle',
  'Form IV verb': 'verb',
  'Nominal': 'adjective',
  'Form II verb': 'verb',
  'Adjective': 'adjective',
  'Passive participle': 'passive-participle',
  'Form VIII verb': 'verb',
  'Form IV active participle': 'active-participle',
  'Form V verb': 'verb',
  'Form X verb': 'verb',
  'Form III verb': 'verb',
  'Verbal noun': 'verbal-noun',
  'Form II verbal noun': 'verbal-noun',
  'Form II passive participle': 'passive-participle',
  'Form IV passive participle': 'passive-participle',
  'Form VI verb': 'verb',
  'Form VIII active participle': 'active-participle',
  'Form II active participle': 'active-participle',
  'Form IV verbal noun': 'verbal-noun',
  'Form V active participle': 'active-participle',
  'Proper noun': 'noun',
  'Form X active participle': 'active-participle',
  'Form III verbal noun': 'verbal-noun',
  'Form III active participle': 'active-participle',
  'Form VII verb': 'verb',
  'Form VIII passive participle': 'passive-participle',
  'Form VI verbal noun': 'verbal-noun',
  'Form VI active participle': 'active-participle',
  'Form V verbal noun': 'verbal-noun',
  'Form VIII verbal noun': 'verbal-noun',
  'Form VII active participle': 'active-participle',
  'Form X verbal noun': 'verbal-noun',
  'Form X passive participle': 'passive-participle',
  'Time adverb': 'noun',
  'Form IX active participle': 'active-participle',
  'Form XII active participle': 'active-participle',
  'Form VII verbal noun': 'verbal-noun',
  'Form IX verb': 'verb',
  'Form III passive participle': 'passive-participle',
  'Location adverb': 'noun',
  'Imperative verbal noun': 'verbal-noun',
  'Form of address': 'other',
  'Form XII verb': 'verb',
  'Form XI active participle': 'active-participle',
  'Form VII passive participle': 'passive-participle',
  'Form V passive participle': 'passive-participle',
  'Conditional particle': 'other',
};

describe('categorizeFormLabel', () => {
  it('covers every live pos_label value', () => {
    expect(Object.keys(KNOWN_LABELS)).toHaveLength(49);
    for (const [label, expected] of Object.entries(KNOWN_LABELS)) {
      expect(categorizeFormLabel(label)).toBe(expected);
    }
  });

  it('falls back to other for an unrecognized label', () => {
    expect(categorizeFormLabel('Something Brand New')).toBe('other');
  });

  // The ordering trap, asserted on its own so a reordered implementation fails
  // here rather than in the 49-row table where it reads as one line of noise:
  // 'adverb' contains 'verb', so the adverb test must precede the verb test.
  it('reads an adverb as a noun, not as a verb', () => {
    expect(categorizeFormLabel('Time adverb')).toBe('noun');
    expect(categorizeFormLabel('Location adverb')).toBe('noun');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @quran-corpus/data test formCategory`
Expected: FAIL — `Failed to resolve import "../src/morphology/formCategory.js"`.

- [ ] **Step 3: Create the module and wire the exports**

Create `packages/data/src/morphology/formCategory.ts` — the body is moved verbatim from `apps/web/src/lib/formCategoryColor.ts`, comments included:

```ts
/**
 * Coarse categories for `root_forms.pos_label`.
 *
 * 49 distinct labels live DB-wide ("Form IV verb", "Form II passive
 * participle"); one colour per label would be as unreadable as the
 * all-tags-coloured word-by-word view this project already walked back from.
 *
 * Pure string work, no imports: safe for the client and mobile entry points.
 * Lives here rather than in an app because web's root page and mobile's root
 * screen both colour-code the same labels (CLAUDE.md §2, §3).
 */
export type FormCategory =
  | 'verb'
  | 'verbal-noun'
  | 'active-participle'
  | 'passive-participle'
  | 'noun'
  | 'adjective'
  | 'other';

export function categorizeFormLabel(posLabel: string): FormCategory {
  const s = posLabel.toLowerCase();
  if (s.includes('verbal noun')) return 'verbal-noun';
  if (s.includes('active participle')) return 'active-participle';
  if (s.includes('passive participle')) return 'passive-participle';
  // 'adverb' must be checked before the generic 'verb' substring test below --
  // 'adverb' itself contains 'verb' as a substring ("time adverb" would
  // otherwise miscategorize as 'verb' instead of 'noun').
  if (s.includes('adverb')) return 'noun';
  if (s.includes('verb')) return 'verb';
  if (s.includes('adjective') || s === 'nominal') return 'adjective';
  if (s.includes('noun')) return 'noun';
  return 'other';
}
```

Add the same line to all three entry points, next to the existing `morphology/` re-exports:

```ts
export { categorizeFormLabel, type FormCategory } from './morphology/formCategory.js';
```

In `src/mobile.ts` only, widen the `text/arabic.js` re-export to carry the browse search fold (Task 9 needs it; it is pure and adds no graph edge):

```ts
export {
  buckwalterToArabic,
  compareRootsArabic,
  foldRootArabic,
  rootFirstLetter,
  ARABIC_ALPHABET_ORDER,
} from './text/arabic.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @quran-corpus/data test formCategory`
Expected: PASS (3 tests).

- [ ] **Step 5: Point web at the shared classifier, keep its colour test**

Rewrite `apps/web/src/lib/formCategoryColor.ts` to re-export the classifier rather than define it, so no call site changes:

```ts
import { categorizeFormLabel, type FormCategory } from '@quran-corpus/data/client';

// Re-exported so the existing call sites keep one import. The classification
// itself lives in packages/data -- mobile's root screen colour-codes the same
// labels (§2, §3). Only the *values* are web's, because they are CSS variables.
export { categorizeFormLabel, type FormCategory };

export function formCategoryColor(category: FormCategory): string {
  switch (category) {
    case 'verb':
      return 'var(--form-verb)';
    case 'verbal-noun':
      return 'var(--form-verbal-noun)';
    case 'active-participle':
      return 'var(--form-active-participle)';
    case 'passive-participle':
      return 'var(--form-passive-participle)';
    case 'noun':
      return 'var(--form-noun)';
    case 'adjective':
      return 'var(--form-adjective)';
    case 'other':
      return 'var(--form-other)';
  }
}
```

Replace `apps/web/src/test/formCategoryColor.test.ts` with the colour half only — the label table now lives in `packages/data`:

```ts
import { describe, it, expect } from 'vitest';
import { formCategoryColor, type FormCategory } from '../lib/formCategoryColor';

describe('formCategoryColor', () => {
  it('returns a distinct CSS var per category', () => {
    const categories: FormCategory[] = [
      'verb', 'verbal-noun', 'active-participle', 'passive-participle',
      'noun', 'adjective', 'other',
    ];
    const colors = categories.map(formCategoryColor);
    expect(new Set(colors).size).toBe(categories.length);
    for (const c of colors) expect(c).toMatch(/^var\(--form-/);
  });
});
```

- [ ] **Step 6: Assert the new mobile exports**

In `packages/data/tests/mobile-entry.test.ts`, inside the `exports mobile-safe query functions` case:

```ts
    expect(typeof mod.categorizeFormLabel).toBe('function');
    expect(typeof mod.foldRootArabic).toBe('function');
```

- [ ] **Step 7: Mutation-check**

Delete the `if (s.includes('adverb')) return 'noun';` line in `formCategory.ts` and run `pnpm --filter @quran-corpus/data test formCategory`. Expected: the adverb case AND the 49-row table both FAIL. Restore the line **by re-editing it back** (never `git checkout` / `git restore` — that is how an unrelated edit gets reverted). Re-run: PASS.

- [ ] **Step 8: Full gate + commit**

Run: `pnpm -r lint && pnpm -r typecheck && pnpm --filter @quran-corpus/data test && pnpm --filter web test`
Expected: all pass.

```bash
git add packages/data/src/morphology/formCategory.ts packages/data/tests/formCategory.test.ts \
        packages/data/src/index.ts packages/data/src/client.ts packages/data/src/mobile.ts \
        packages/data/tests/mobile-entry.test.ts \
        apps/web/src/lib/formCategoryColor.ts apps/web/src/test/formCategoryColor.test.ts
git commit -m "refactor(data): share categorizeFormLabel with mobile"
```

---

## Task 2: Mobile form colours

`packages/config/theme/palette.ts` already carries `formColors` for both themes — mobile just has to consume it the way `tokens.ts` already consumes `posColors`. React Native has no `color-mix()`, so the 16% tint is an 8-digit hex suffix.

**Files:**
- Create: `apps/mobile/src/theme/formTint.ts`
- Create: `apps/mobile/src/theme/formTint.test.ts`
- Modify: `apps/mobile/src/theme/tokens.ts`

**Interfaces:**
- Consumes: `categorizeFormLabel`, `FormCategory` (Task 1).
- Produces: `formTint(formColor: string): string` and `formColorFor(theme, posLabel): { color: string; tint: string }`, consumed by Tasks 6 and 7.

Contrast, computed 2026-08-21 against mobile's own backgrounds (page `#151412` dark / `#faf8f3` light) and against each colour's own 16% tint over that page. AA body text needs 4.5:1; the worst case is 4.60:1.

| category | light on page / on 16% tint | dark on page / on 16% tint |
| --- | --- | --- |
| verb | 5.90 / 4.61 | 9.00 / 6.73 |
| verbal-noun | 6.09 / 4.84 | 9.38 / 6.88 |
| active-participle | 5.82 / 4.63 | 10.78 / 7.68 |
| passive-participle | 5.80 / 4.62 | 9.30 / 6.83 |
| noun | 5.79 / 4.60 | 8.38 / 6.31 |
| adjective | 5.79 / 4.64 | 11.04 / 7.83 |
| other | 7.02 / 5.55 | 7.92 / 6.01 |

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/theme/formTint.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formTint, formColorFor } from './formTint';
import { themeColors } from './tokens';

describe('formTint', () => {
  it('appends the calibrated 16% alpha, and only that', () => {
    // 0x29 = 41 = 16% of 255, rounded. The palette's second contrast figure is
    // measured at exactly this mix, so changing it invalidates the table in
    // packages/config/theme/palette.ts.
    expect(formTint('#ab392c')).toBe('#ab392c29');
  });

  it('leaves a colour that already carries alpha alone', () => {
    expect(formTint('#ab392c29')).toBe('#ab392c29');
  });
});

describe('formColorFor', () => {
  it('picks the colour by category, not by label text', () => {
    // Two different labels, one category, one colour.
    const a = formColorFor(themeColors.light, 'Form IV verb');
    const b = formColorFor(themeColors.light, 'Form I verb');
    expect(a.color).toBe(b.color);
    expect(a.color).toBe(themeColors.light.form.verb);
  });

  it('reads an adverb as a noun', () => {
    expect(formColorFor(themeColors.light, 'Time adverb').color).toBe(
      themeColors.light.form.noun,
    );
  });

  it('covers every category in both themes', () => {
    for (const theme of [themeColors.light, themeColors.dark]) {
      for (const key of ['verb', 'verbal-noun', 'active-participle',
        'passive-participle', 'noun', 'adjective', 'other'] as const) {
        expect(theme.form[key]).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @quran-corpus/mobile test formTint`
Expected: FAIL — cannot resolve `./formTint`.

- [ ] **Step 3: Add the tokens and the helper**

In `apps/mobile/src/theme/tokens.ts`, alongside the existing `pos` widening:

```ts
import { paper as paperScale, posColors, formColors } from '@quran-corpus/config/theme/palette';
import type { FormCategory, PosBucket } from '@quran-corpus/data/mobile';

// Widened out of the palette's `as const`, same two reasons as `pos` above:
// ThemeProvider types its context off the light theme, and this annotation is
// what makes the compiler check the palette covers every category
// categorizeFormLabel can return.
const form: { light: Record<FormCategory, string>; dark: Record<FormCategory, string> } = formColors;
```

then `form: form.light` in `themeColors.light` and `form: form.dark` in `themeColors.dark`, each with the contrast table above quoted in a comment (light ratios carry over from web unchanged — same hexes, same `#faf8f3` page; the dark ones are re-measured against mobile's warm `#151412`, not web's neutral `#141414`).

Create `apps/mobile/src/theme/formTint.ts`:

```ts
import { categorizeFormLabel } from '@quran-corpus/data/mobile';
import type { themeColors } from './tokens';

type Theme = (typeof themeColors)['light'];

/** 16% of the colour over whatever is behind it, as an 8-digit hex.
 *
 *  React Native has no `color-mix()`, which is what web's chips use, and the
 *  palette's second contrast figure is measured at exactly 16% -- so the alpha
 *  is fixed here rather than passed in. Nothing may paint behind a tinted pill:
 *  the ratio assumes the page (or card) is directly underneath. */
export function formTint(color: string): string {
  return color.length > 7 ? color : `${color}29`;
}

/** The colour a derived form's label is drawn in, plus its pill background. */
export function formColorFor(theme: Theme, posLabel: string): { color: string; tint: string } {
  const color = theme.form[categorizeFormLabel(posLabel)];
  return { color, tint: formTint(color) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @quran-corpus/mobile test formTint`
Expected: PASS.

- [ ] **Step 5: Mutation-check**

Change `29` to `40` in `formTint`. Expected: the alpha test FAILS. Re-edit back to `29`; PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/theme/formTint.ts apps/mobile/src/theme/formTint.test.ts apps/mobile/src/theme/tokens.ts
git commit -m "feat(mobile): derived-form colours from the shared palette"
```

---

## Task 3: EntryHeader

Web's centred masthead, shared by both entry screens: Arabic headword, optional transliteration, a chip row, and the occurrence count. One component, not two near-identical headers (§3).

**Files:**
- Create: `apps/mobile/src/components/EntryHeader.tsx`
- Create: `apps/mobile/src/components/EntryHeader.test.tsx`
- Modify: `apps/mobile/src/i18n/uiStrings.ts`

**Interfaces:**
- Produces: `EntryHeader({ arabic, transliteration?, children?, count, uiLocale })`, consumed by Tasks 5 and 8.

No new i18n key: the count line reuses the existing `dictionary.occurrences` (`"occurrences"` / `"marta uchraydi"` / `"употреблений"` — verify the ru value in the file and reuse it as-is), rendered as `${count} ${t(...)}`, the same concatenation `FrequencyList` already uses.

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/src/components/EntryHeader.test.tsx`. Follow the existing mock shape in `FrequencyList.test.tsx` (`vi.mock('react-native')` with `host()` from `@/testing/rnHosts.js`):

```tsx
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/theme/themeContext', () => ({
  useThemeColors: () => ({ text: '#000', mutedText: '#666', border: '#ccc', surface: '#fff' }),
}));
vi.mock('@/theme/useArabicSizes', () => ({ useArabicSizes: () => ({ title: 36 }) }));
vi.mock('react-native', async () => {
  const React = await import('react');
  const { host } = await import('@/testing/rnHosts.js');
  return { Text: host('span'), View: host('div') };
});

const { EntryHeader } = await import('./EntryHeader');

describe('EntryHeader', () => {
  afterEach(cleanup);

  it('renders the headword as the screen heading', () => {
    render(<EntryHeader uiLocale="en" arabic="قول" count={12} />);
    expect(screen.getByRole('heading')).toHaveTextContent('قول');
  });

  it('says how many occurrences, not a bare number', () => {
    render(<EntryHeader uiLocale="en" arabic="قول" count={1722} />);
    expect(screen.getByTestId('entry-count')).toHaveTextContent('1722 occurrences');
  });

  it('omits the transliteration line when there is none', () => {
    // Roots have no transliteration column; an empty line would leave a gap
    // between the headword and its pills.
    render(<EntryHeader uiLocale="en" arabic="قول" count={3} />);
    expect(screen.queryByTestId('entry-translit')).toBeNull();
  });

  it('shows the transliteration when there is one', () => {
    render(<EntryHeader uiLocale="en" arabic="قَالَ" transliteration="qāla" count={3} />);
    expect(screen.getByTestId('entry-translit')).toHaveTextContent('qāla');
  });

  it('collapses the chip row when the caller passes nothing', () => {
    render(<EntryHeader uiLocale="en" arabic="قول" count={3} />);
    expect(screen.queryByTestId('entry-chips')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @quran-corpus/mobile test EntryHeader`
Expected: FAIL — cannot resolve `./EntryHeader`.

- [ ] **Step 3: Implement**

Create `apps/mobile/src/components/EntryHeader.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useArabicSizes } from '@/theme/useArabicSizes';

export interface EntryHeaderProps {
  /** The headword: a lemma's Arabic form, or a root's letters. */
  arabic: string;
  /** Latin reading, under the headword. Roots have none -- `roots` carries no
   *  transliteration column, and the letter pills spell the consonants out. */
  transliteration?: string | null;
  /** The row between the transliteration and the count: sense chips on the
   *  lemma screen, letter pills on the root screen. Callers pass nothing rather
   *  than an empty fragment, so the row and its gap collapse together. */
  children?: ReactNode;
  /** Corpus-wide occurrences. */
  count: number;
  /** A prop, not a store read: the component tests mock the settings store
   *  without a uiLocale, same as AlphabetGrid and SearchHeaderButton. */
  uiLocale: UiLocaleCode;
}

/** Shared masthead for both dictionary entry screens.
 *
 *  Centred stack, matching web: the reading of the word sat visually below its
 *  own footnotes when translit, grammar and count competed on one line. */
export function EntryHeader({
  arabic,
  transliteration,
  children,
  count,
  uiLocale,
}: EntryHeaderProps) {
  const theme = useThemeColors();
  const sizes = useArabicSizes();

  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <Text
        accessibilityRole="header"
        style={{
          color: theme.text,
          fontFamily: 'Hafs',
          fontSize: sizes.title,
          textAlign: 'center',
          // writingDirection is iOS-only (see AyahText); Android resolves
          // direction from the content.
          writingDirection: 'rtl',
        }}
      >
        {arabic}
      </Text>
      {transliteration ? (
        <Text
          testID="entry-translit"
          style={{ color: theme.mutedText, fontSize: typography.body }}
        >
          {transliteration}
        </Text>
      ) : null}
      {children ? (
        <View
          testID="entry-chips"
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {children}
        </View>
      ) : null}
      {/* t() has no interpolation, hence the concatenation -- same shape
          FrequencyList's row label uses. */}
      <Text
        testID="entry-count"
        style={{ color: theme.mutedText, fontSize: typography.caption }}
      >
        {count} {t(uiLocale, 'dictionary.occurrences')}
      </Text>
    </View>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @quran-corpus/mobile test EntryHeader`
Expected: PASS (5 tests).

- [ ] **Step 5: Mutation-check**

Change `{transliteration ? (` to `{true ? (`. Expected: "omits the transliteration line" FAILS. Re-edit back; PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/EntryHeader.tsx apps/mobile/src/components/EntryHeader.test.tsx
git commit -m "feat(mobile): shared dictionary entry masthead"
```

---

## Task 4: ClampedText and DefinitionCard

Lane entries run to 1479 characters. Unclamped they bury the concordance under several screens of senses. React Native has no CSS line-clamp and **no `scrollHeight`**, so overflow is detected from `onTextLayout`.

**The Android trap:** with `numberOfLines` set, Android's `onTextLayout` reports only the lines it actually rendered — `lines.length > LINES` is never true, so the naive check silently never shows a toggle. Detect instead by comparing the text the layout reports against the text passed in. No pre-clamp measuring pass, so there is no frame where the full definition renders and then collapses.

**Files:**
- Create: `apps/mobile/src/components/ClampedText.tsx`, `apps/mobile/src/components/ClampedText.test.tsx`
- Create: `apps/mobile/src/components/DefinitionCard.tsx`, `apps/mobile/src/components/DefinitionCard.test.tsx`
- Modify: `apps/mobile/src/i18n/uiStrings.ts`

**Interfaces:**
- Produces: `ClampedText({ children, lines?, uiLocale, style?, footer? })` and `DefinitionCard({ definition, source, uiLocale })`, consumed by Tasks 5 and 8.

New i18n keys (all three locales):

| key | en | uz | ru |
| --- | --- | --- | --- |
| `text.showMore` | Show more | Ko‘proq ko‘rsatish | Показать больше |
| `text.showLess` | Show less | Kamroq ko‘rsatish | Свернуть |

- [ ] **Step 1: Write the failing test for ClampedText**

Create `apps/mobile/src/components/ClampedText.test.tsx`. The `Text` mock forwards `onTextLayout` so the test can fire a layout event:

```tsx
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/theme/themeContext', () => ({
  useThemeColors: () => ({ text: '#000', mutedText: '#666', accent: '#1f6f5b' }),
}));
vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ uiLocale: 'en' }) }));
vi.mock('react-native', async () => {
  const React = await import('react');
  const { host } = await import('@/testing/rnHosts.js');
  const Text = ({ onTextLayout, children, ...rest }: Record<string, unknown> & {
    children?: React.ReactNode;
  }) =>
    React.createElement(
      'span',
      { ...rest, 'data-has-layout': onTextLayout ? 'yes' : 'no',
        onClick: onTextLayout as never },
      children,
    );
  return { Text, View: host('div'), Pressable: host('button') };
});

const { ClampedText } = await import('./ClampedText');

/** Fire onTextLayout with the lines Android would report for a clamp that DID
 *  truncate: six rendered lines whose joined text is shorter than the source. */
function layout(node: HTMLElement, shown: string[]) {
  fireEvent.click(node, { nativeEvent: { lines: shown.map((text) => ({ text })) } });
}

const LONG = 'a'.repeat(400);

describe('ClampedText', () => {
  afterEach(cleanup);

  it('shows no toggle before anything has been measured', () => {
    render(<ClampedText uiLocale="en">{LONG}</ClampedText>);
    expect(screen.queryByTestId('clamp-toggle')).toBeNull();
  });

  it('shows no toggle when the whole text fitted', () => {
    render(<ClampedText uiLocale="en">short</ClampedText>);
    act(() => layout(screen.getByTestId('clamp-body'), ['short']));
    expect(screen.queryByTestId('clamp-toggle')).toBeNull();
  });

  it('offers Show more once the clamp actually cut the text', () => {
    // Android reports only the RENDERED lines when numberOfLines is set, so
    // lines.length is 6 whether or not anything was cut. The joined text is
    // what distinguishes them.
    render(<ClampedText uiLocale="en">{LONG}</ClampedText>);
    act(() => layout(screen.getByTestId('clamp-body'), ['a'.repeat(50), 'a'.repeat(50)]));
    expect(screen.getByTestId('clamp-toggle')).toHaveTextContent('Show more');
  });

  it('expands and collapses, and says which it will do', () => {
    render(<ClampedText uiLocale="en">{LONG}</ClampedText>);
    act(() => layout(screen.getByTestId('clamp-body'), ['a'.repeat(50)]));
    const toggle = screen.getByTestId('clamp-toggle');
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent('Show less');
    expect(screen.getByTestId('clamp-body')).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent('Show more');
  });

  it('keeps the toggle after expanding', () => {
    // The expanded render fires onTextLayout again, this time with every line.
    // A naive re-measure would read "it all fits now" and delete the Show less
    // button out from under the reader.
    render(<ClampedText uiLocale="en">{LONG}</ClampedText>);
    act(() => layout(screen.getByTestId('clamp-body'), ['a'.repeat(50)]));
    fireEvent.click(screen.getByTestId('clamp-toggle'));
    act(() => layout(screen.getByTestId('clamp-body'), [LONG]));
    expect(screen.getByTestId('clamp-toggle')).toHaveTextContent('Show less');
  });

  it('renders a footer beside the toggle', () => {
    render(
      <ClampedText uiLocale="en" footer={<span>Lane</span>}>short</ClampedText>,
    );
    act(() => layout(screen.getByTestId('clamp-body'), ['short']));
    expect(screen.getByTestId('clamp-footer')).toHaveTextContent('Lane');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @quran-corpus/mobile test ClampedText`
Expected: FAIL — cannot resolve `./ClampedText`.

- [ ] **Step 3: Implement ClampedText**

```tsx
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, Text, View, type NativeSyntheticEvent, type TextLayoutEventData } from 'react-native';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export interface ClampedTextProps {
  children: string;
  /** Lines shown while collapsed. */
  lines?: number;
  /** Rendered at the leading edge of the toggle's row, e.g. the source credit,
   *  so the credit and the toggle cost one line between them. Shown whether or
   *  not the text overflows. */
  footer?: ReactNode;
  uiLocale: UiLocaleCode;
}

const DEFAULT_LINES = 6;

/** Collapses long prose to `lines` with a Show more/less toggle, and gets out
 *  of the way when the text already fits.
 *
 *  Overflow is decided from the text `onTextLayout` reports, NOT from
 *  `lines.length`: with `numberOfLines` set, Android reports only the lines it
 *  rendered, so a length test reads 6 whether or not anything was cut and the
 *  toggle never appears. Comparing the joined line text against the source is
 *  exact on both platforms and needs no unclamped measuring pass -- which is
 *  the other reason not to do it that way: a pre-pass would paint the whole
 *  1479-character definition for one frame before collapsing it. */
export function ClampedText({ children, lines = DEFAULT_LINES, footer, uiLocale }: ClampedTextProps) {
  const theme = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  const onTextLayout = useCallback(
    (event: NativeSyntheticEvent<TextLayoutEventData>) => {
      // Once true it stays true. The expanded render lays out every line, so
      // re-deciding here would read "it all fits" and delete the Show less
      // button out from under the reader mid-read.
      if (expanded || overflows) return;
      const shown = event.nativeEvent.lines
        .map((line) => line.text)
        .join('')
        // Android appends the ellipsis to the truncated line; it is not part
        // of the source string and would make a fitting text look longer.
        .replace(/…\s*$/, '');
      setOverflows(shown.trim().length < children.trim().length);
    },
    [children, expanded, overflows],
  );

  const label = t(uiLocale, expanded ? 'text.showLess' : 'text.showMore');

  return (
    <>
      <Text
        testID="clamp-body"
        accessibilityState={{ expanded }}
        numberOfLines={expanded ? undefined : lines}
        onTextLayout={onTextLayout}
        style={{ color: theme.text, fontSize: typography.body, lineHeight: 24 }}
      >
        {children}
      </Text>
      {footer || overflows ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <View testID="clamp-footer">{footer}</View>
          {overflows ? (
            <Pressable
              testID="clamp-toggle"
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ expanded }}
              onPress={() => setExpanded((value) => !value)}
              style={{ minHeight: touchTargets.compact, justifyContent: 'center' }}
            >
              <Text style={{ color: theme.accent, fontSize: typography.caption }}>{label}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </>
  );
}
```

Add `'text.showMore'` and `'text.showLess'` to `UiStringKey` and to all three locale tables.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @quran-corpus/mobile test ClampedText`
Expected: PASS (6 tests).

- [ ] **Step 5: Mutation-check the Android trap**

Replace the body-comparison line with the naive `setOverflows(event.nativeEvent.lines.length > lines);`. Expected: "offers Show more once the clamp actually cut the text" FAILS (two rendered lines is not > 6) — which is exactly the silent Android failure. Re-edit back; PASS.

- [ ] **Step 6: Write the failing test for DefinitionCard**

Create `apps/mobile/src/components/DefinitionCard.test.tsx` with the same mock preamble, plus `vi.mock('@quran-corpus/data/mobile', () => ({ definitionSourceLabel: (s: string) => (s === 'lane' ? "Lane's Lexicon" : s) }))`:

```tsx
it('credits the source it was given', () => {
  render(<DefinitionCard uiLocale="en" definition="to say" source="lane" />);
  expect(screen.getByTestId('definition-source')).toHaveTextContent("Lane's Lexicon");
});

it('renders an unmapped tag as itself rather than uncredited', () => {
  // §11: this text is third-party licensed and must never render bare. A
  // visibly wrong credit beats a silently missing one.
  render(<DefinitionCard uiLocale="en" definition="to say" source="brand-new" />);
  expect(screen.getByTestId('definition-source')).toHaveTextContent('brand-new');
});

it('renders the definition through the clamp', () => {
  render(<DefinitionCard uiLocale="en" definition="to say" source="lane" />);
  expect(screen.getByTestId('clamp-body')).toHaveTextContent('to say');
});
```

- [ ] **Step 7: Implement DefinitionCard**

```tsx
import { Text, View } from 'react-native';
import { definitionSourceLabel } from '@quran-corpus/data/mobile';
import { ClampedText } from '@/components/ClampedText';
import type { UiLocaleCode } from '@/i18n/languages';
import { typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export interface DefinitionCardProps {
  definition: string;
  /** `root_definitions.source`, or `LemmaEntry.root_definition_source`. */
  source: string | null;
  uiLocale: UiLocaleCode;
}

/** One lexicon definition in a card, clamped, with its source credit sharing
 *  the toggle's row.
 *
 *  An unmapped tag prints as itself -- see definitionSources for why a visibly
 *  wrong credit beats a silently uncredited one. This text is third-party
 *  licensed (§11) and must never render bare. */
export function DefinitionCard({ definition, source, uiLocale }: DefinitionCardProps) {
  const theme = useThemeColors();
  const label = source ? definitionSourceLabel(source) : null;

  return (
    <View
      testID="definition-card"
      style={{
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: theme.surface,
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        gap: 6,
      }}
    >
      <ClampedText
        uiLocale={uiLocale}
        footer={
          label ? (
            <Text
              testID="definition-source"
              style={{ color: theme.mutedText, fontSize: typography.caption }}
            >
              {label}
            </Text>
          ) : null
        }
      >
        {definition}
      </ClampedText>
    </View>
  );
}
```

- [ ] **Step 8: Run tests, then commit**

Run: `pnpm --filter @quran-corpus/mobile test ClampedText DefinitionCard && pnpm -r lint && pnpm -r typecheck`
Expected: all pass.

```bash
git add apps/mobile/src/components/ClampedText.tsx apps/mobile/src/components/ClampedText.test.tsx \
        apps/mobile/src/components/DefinitionCard.tsx apps/mobile/src/components/DefinitionCard.test.tsx \
        apps/mobile/src/i18n/uiStrings.ts
git commit -m "feat(mobile): clamped definition cards"
```

---

## Task 5: Root screen header parity

Rebuild `app/root/[buckwalter].tsx`'s header to match web's `RootEntry`: centred masthead with per-letter pills, Previous/Next nav, definition cards, and a `Concordance (N)` heading. The derived-form cards are removed here — Task 7 replaces them with filter chips.

**Files:**
- Modify: `apps/mobile/app/root/[buckwalter].tsx`
- Modify: `apps/mobile/src/data/corpusRepository.ts`
- Modify: `apps/mobile/src/screens/RootRoute.test.tsx`, `apps/mobile/src/test/routes/root.test.tsx`
- Modify: `apps/mobile/src/i18n/uiStrings.ts`

**Interfaces:**
- Consumes: `EntryHeader` (Task 3), `DefinitionCard` (Task 4).
- Produces: `getAdjacentRoots(client, bw): Promise<{ prev: string | null; next: string | null }>` in `corpusRepository`.

New i18n keys (all three locales):

| key | en | uz | ru |
| --- | --- | --- | --- |
| `root.previous` | Previous | Oldingi | Предыдущий |
| `root.next` | Next | Keyingi | Следующий |
| `root.adjacent` | Adjacent roots | Qo‘shni o‘zaklar | Соседние корни |
| `concordance.heading` | Concordance | Uchrashuvlar | Конкорданс |

`root.forms`, `root.definitions`, `root.noDefinition` and `word.root` already exist; `root.forms` moves to Task 7 and `word.root` is dropped from this header (the masthead names itself).

- [ ] **Step 1: Write the failing tests**

Add to `apps/mobile/src/screens/RootRoute.test.tsx` (mock `getAdjacentRoots` alongside the existing repository mocks):

```tsx
it('spells the root out as one pill per letter', async () => {
  mocks.getRootScreen.mockResolvedValue({
    root: { id: 1, root_buckwalter: 'qwl', root_arabic: 'ق و ل', occurrence_count: 1722 },
    forms: [], definitions: [],
  });
  render(<RootRoute />);
  // Three letters, and the inter-letter spaces are not pills of their own.
  expect(await screen.findAllByTestId('root-letter')).toHaveLength(3);
});

it('says how often the root occurs', async () => {
  render(<RootRoute />);
  expect(await screen.findByTestId('entry-count')).toHaveTextContent('1722 occurrences');
});

it('links Previous and Next to the hijāʾī neighbours', async () => {
  mocks.getAdjacentRoots.mockResolvedValue({ prev: 'qtl', next: 'qwm' });
  render(<RootRoute />);
  fireEvent.click(await screen.findByTestId('root-next'));
  expect(mocks.push).toHaveBeenCalledWith('/root/qwm');
});

it('disables the arrow at the end of the list rather than hiding it', async () => {
  // A vanishing control moves the other one under the thumb mid-scroll; TalkBack
  // gets the disabled state instead.
  mocks.getAdjacentRoots.mockResolvedValue({ prev: 'qtl', next: null });
  render(<RootRoute />);
  const next = await screen.findByTestId('root-next');
  expect(next).toHaveAttribute('aria-disabled', 'true');
  fireEvent.click(next);
  expect(mocks.push).not.toHaveBeenCalled();
});

it('renders one card per definition, each credited', async () => {
  mocks.getRootScreen.mockResolvedValue({
    root: { id: 1, root_buckwalter: 'qwl', root_arabic: 'قول', occurrence_count: 5 },
    forms: [],
    definitions: [
      { id: 1, root_id: 1, source: 'hanswehr', definition: 'to say' },
      { id: 2, root_id: 1, source: 'lane', definition: 'he said' },
    ],
  });
  render(<RootRoute />);
  expect(await screen.findAllByTestId('definition-card')).toHaveLength(2);
});

it('says the lexicon has no entry rather than rendering an empty section', async () => {
  // 24 roots still carry no definition (hw_gap_24.tsv). Silence reads as a bug.
  mocks.getRootScreen.mockResolvedValue({
    root: { id: 1, root_buckwalter: 'qwl', root_arabic: 'قول', occurrence_count: 5 },
    forms: [], definitions: [],
  });
  render(<RootRoute />);
  expect(await screen.findByTestId('root-no-definition')).toBeTruthy();
});

it('counts the concordance in its heading', async () => {
  mocks.getRootOccurrenceCount.mockResolvedValue(1722);
  render(<RootRoute />);
  expect(await screen.findByTestId('concordance-heading')).toHaveTextContent('Concordance (1722)');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @quran-corpus/mobile test RootRoute`
Expected: FAIL — no `root-letter`, `root-next`, `definition-card` or `concordance-heading` testIDs.

- [ ] **Step 3: Add the repository wrapper**

In `apps/mobile/src/data/corpusRepository.ts`, import `getRootNeighbors` from `@quran-corpus/data/mobile` and add:

```ts
/** Hijāʾī-adjacent roots for the root screen's Previous/Next.
 *
 *  Indexed O(1) on roots.sort_order, which the bundled DB ships populated
 *  (1642 rows, 0 NULL, verified 2026-08-21). If a future rebuild ships it NULL
 *  the shared query degrades to a full compareRootsArabic sort -- slower, still
 *  correct -- so this needs no fallback of its own. */
export async function getAdjacentRoots(
  client: MobileDataClient,
  bw: string,
): Promise<{ prev: string | null; next: string | null }> {
  return getRootNeighbors(client, bw);
}
```

- [ ] **Step 4: Rebuild the header**

In `app/root/[buckwalter].tsx`: add `neighbors` state, fetch it in the existing `Promise.all` alongside `getRootScreen`/`getRootOccurrenceCount`, and replace the header JSX. Keep the surrounding structure exactly as it is — the plain `View` (a ScrollView inside a FlatList header is a nested VirtualizedList), the `parseRootParam` guard before `openCorpusDb`, and the stable `loadPage` `useCallback`.

```tsx
  const header = (
    <View style={{ padding: 20, gap: 18 }}>
      <EntryHeader uiLocale={uiLocale} arabic={root.root_arabic} count={root.occurrence_count}>
        {/* One pill per letter, right to left. The spaces in a compound root
            ("ق و ل") are separators, not letters, so they are stripped before
            splitting -- otherwise a three-letter root renders five pills, two
            of them blank. */}
        {Array.from(root.root_arabic.replace(/\s+/g, '')).map((letter, index) => (
          <View
            key={`${letter}-${index}`}
            testID="root-letter"
            style={{
              backgroundColor: theme.surface,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}
          >
            <Text style={{ color: theme.text, fontFamily: 'Hafs', fontSize: typography.body }}>
              {letter}
            </Text>
          </View>
        ))}
      </EntryHeader>

      <View
        accessibilityRole="toolbar"
        accessibilityLabel={t(uiLocale, 'root.adjacent')}
        style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}
      >
        {(['prev', 'next'] as const).map((side) => {
          const target = side === 'prev' ? neighbors.prev : neighbors.next;
          return (
            <Pressable
              key={side}
              testID={side === 'prev' ? 'root-previous' : 'root-next'}
              accessibilityRole="button"
              // Disabled, not hidden: an arrow that vanishes at the ends of the
              // list slides the other one under the thumb, and TalkBack is left
              // with nothing to announce where a control used to be.
              accessibilityState={{ disabled: target === null }}
              disabled={target === null}
              onPress={target ? () => router.push(`/root/${encodeURIComponent(target)}`) : undefined}
              style={{
                minHeight: touchTargets.compact,
                justifyContent: 'center',
                paddingHorizontal: 14,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: theme.border,
                opacity: target === null ? 0.4 : 1,
              }}
            >
              <Text style={{ color: target === null ? theme.mutedText : theme.text }}>
                {side === 'prev'
                  ? `← ${t(uiLocale, 'root.previous')}`
                  : `${t(uiLocale, 'root.next')} →`}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ gap: 10 }}>
        {definitions.length > 0 ? (
          definitions.map((definition) => (
            <DefinitionCard
              key={definition.id}
              uiLocale={uiLocale}
              definition={definition.definition}
              source={definition.source}
            />
          ))
        ) : (
          <Text
            testID="root-no-definition"
            style={{ color: theme.mutedText, fontSize: typography.body }}
          >
            {t(uiLocale, 'root.noDefinition')}
          </Text>
        )}
      </View>

      <Text
        testID="concordance-heading"
        accessibilityRole="header"
        style={{ color: theme.mutedText, fontSize: typography.caption }}
      >
        {t(uiLocale, 'concordance.heading')} ({total})
      </Text>
    </View>
  );
```

`neighbors` defaults to `{ prev: null, next: null }` so the arrows render disabled until the fetch lands, never absent.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @quran-corpus/mobile test RootRoute root`
Expected: PASS. The existing `root-form` assertions will fail — delete them here and let Task 7 re-add form coverage against the chips.

- [ ] **Step 6: Mutation-check**

Delete `.replace(/\s+/g, '')` from the letter split. Expected: "spells the root out as one pill per letter" FAILS (5 pills, not 3). Re-edit back; PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/app/root/\[buckwalter\].tsx apps/mobile/src/data/corpusRepository.ts \
        apps/mobile/src/screens/RootRoute.test.tsx apps/mobile/src/test/routes/root.test.tsx \
        apps/mobile/src/i18n/uiStrings.ts
git commit -m "feat(mobile): root entry masthead, neighbours and definition cards"
```

---

## Task 6: Concordance row parity

Each occurrence row gains web's full content: the 3-part reference `2:3:6`, the derived-form pill, the word's transliteration, the translation line, and a per-row **Show full verse** toggle.

The row stays a single `Pressable` opening the reader (owner decision 2). The toggle must therefore sit **outside** that `Pressable`, not nested in it — the row's `accessibilityLabel` replaces its whole subtree, so a nested toggle is invisible to TalkBack, and a nested press target inside a press target is ambiguous on Android.

**Files:**
- Modify: `apps/mobile/src/components/ConcordanceList.tsx`
- Modify: `apps/mobile/src/components/ConcordanceList.test.tsx`
- Modify: `apps/mobile/src/i18n/uiStrings.ts`

**Interfaces:**
- Consumes: `formColorFor` (Task 2), `t` keys `text.showLess` (Task 4).
- Produces: `ConcordanceListProps` gains `forms?: RootForm[]` — omit it and no form pill renders. Task 7 supplies it.

New i18n key:

| key | en | uz | ru |
| --- | --- | --- | --- |
| `concordance.showFullVerse` | Show full verse | To‘liq oyatni ko‘rsatish | Показать весь аят |

- [ ] **Step 1: Write the failing tests**

Add to `apps/mobile/src/components/ConcordanceList.test.tsx`:

```tsx
it('names the word by surah, ayah and position', async () => {
  // Two-part "2:3" names an ayah, not an occurrence -- a verse with the same
  // root twice produced two identical-looking rows.
  render(<ConcordanceList total={1} loadPage={page([entry({ position: 6 })])} header={<div />} />);
  expect(await screen.findByTestId('concordance-ref')).toHaveTextContent('2:3:6');
});

it('tags the occurrence with its derived form', async () => {
  const forms = [{ id: 7, root_id: 1, sort_order: 0, pos_label: 'Form IV verb',
    form_arabic: 'أقول', form_translit: 'aqāla', gloss: 'to say', occurrence_count: 3 }];
  render(<ConcordanceList total={1} forms={forms}
    loadPage={page([entry({ form_id: 7 })])} header={<div />} />);
  expect(await screen.findByTestId('concordance-form')).toHaveTextContent('aqāla');
});

it('renders no tag when the entry matched no form', async () => {
  render(<ConcordanceList total={1} forms={[]} loadPage={page([entry({ form_id: null })])} header={<div />} />);
  await screen.findByTestId('concordance-row');
  expect(screen.queryByTestId('concordance-form')).toBeNull();
});

it('renders no tag when the caller supplied no forms', async () => {
  // The lemma screen has no derived forms; a form_id it cannot resolve must
  // print nothing rather than a raw id.
  render(<ConcordanceList total={1} loadPage={page([entry({ form_id: 7 })])} header={<div />} />);
  await screen.findByTestId('concordance-row');
  expect(screen.queryByTestId('concordance-form')).toBeNull();
});

it('shows the word transliteration and its translation', async () => {
  render(<ConcordanceList total={1}
    loadPage={page([entry({ transliteration: 'qāla', gloss: 'he said' })])} header={<div />} />);
  expect(await screen.findByTestId('concordance-translit')).toHaveTextContent('qāla');
  expect(screen.getByTestId('concordance-gloss')).toHaveTextContent('he said');
});

it('offers the full verse only when the trim actually cut it', async () => {
  const long = entry({ verse_words: words(12), word_id: 6 });
  render(<ConcordanceList total={1} loadPage={page([long])} header={<div />} />);
  expect(await screen.findByTestId('concordance-expand')).toHaveTextContent('Show full verse');

  cleanup();
  const short = entry({ verse_words: words(3), word_id: 2 });
  render(<ConcordanceList total={1} loadPage={page([short])} header={<div />} />);
  await screen.findByTestId('concordance-row');
  expect(screen.queryByTestId('concordance-expand')).toBeNull();
});

it('expands to every word of the verse and back', async () => {
  const long = entry({ verse_words: words(12), word_id: 6 });
  render(<ConcordanceList total={1} loadPage={page([long])} header={<div />} />);
  const toggle = await screen.findByTestId('concordance-expand');
  fireEvent.click(toggle);
  expect(screen.getByTestId('concordance-verse')).toHaveTextContent('w12');
  expect(toggle).toHaveTextContent('Show less');
  fireEvent.click(toggle);
  expect(screen.getByTestId('concordance-verse')).not.toHaveTextContent('w12');
});

it('keeps the expand toggle out of the row so it is reachable', async () => {
  // The row is one accessibility node whose label replaces its subtree; a
  // toggle nested inside it announces as nothing.
  const long = entry({ verse_words: words(12), word_id: 6 });
  render(<ConcordanceList total={1} loadPage={page([long])} header={<div />} />);
  const toggle = await screen.findByTestId('concordance-expand');
  expect(screen.getByTestId('concordance-row').contains(toggle)).toBe(false);
});

it('opens the reader from the row, not from the toggle', async () => {
  const long = entry({ verse_words: words(12), word_id: 6 });
  render(<ConcordanceList total={1} loadPage={page([long])} header={<div />} />);
  fireEvent.click(await screen.findByTestId('concordance-expand'));
  expect(mocks.push).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId('concordance-row'));
  expect(mocks.push).toHaveBeenCalledWith('/surah/2?ayah=3');
});
```

Add the `entry()` / `words()` / `page()` helpers next to the file's existing fixtures; `words(n)` returns `[{ id: 1, position: 1, text_arabic: 'w1' }, …]` so `trimConcordanceVerse` has something wide enough to cut.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @quran-corpus/mobile test ConcordanceList`
Expected: FAIL — none of the new testIDs exist; `forms` is not a prop.

- [ ] **Step 3: Implement**

Restructure `renderItem` into a `ConcordanceRow` component (per-row `useState` cannot live in a `renderItem` closure) and add `forms?: RootForm[]` to `ConcordanceListProps`, documented as optional-by-design for the lemma screen.

```tsx
function ConcordanceRow({ item, forms, uiLocale }: {
  item: ConcordanceEntry;
  forms: RootForm[] | undefined;
  uiLocale: UiLocaleCode;
}) {
  const theme = useThemeColors();
  const [expanded, setExpanded] = useState(false);

  const trimmed = trimConcordanceVerse(item.verse_words, item.word_id);
  const shown = expanded ? item.verse_words : trimmed.words;
  // Only when the trim really cut something: a short ayah must not carry a
  // control that does nothing.
  const canExpand = trimmed.words.length < item.verse_words.length;
  const form = item.form_id === null ? undefined : forms?.find((f) => f.id === item.form_id);
  const formStyle = form ? formColorFor(theme, form.pos_label) : null;

  return (
    <View style={{ paddingHorizontal: 20, paddingVertical: 12, gap: 4 }}>
      <Pressable
        testID="concordance-row"
        accessibilityRole="link"
        // One accessibility node: this label REPLACES the subtree's text, so
        // everything a reader needs is in it. Reference and gloss lead because
        // they identify the row; the Arabic reads as one long run and goes last.
        accessibilityLabel={`${item.surah_id}:${item.ayah_number}:${item.position}${item.gloss ? `, ${item.gloss}` : ''}, ${shown.map((word) => word.text_arabic).join(' ')}`}
        onPress={() => router.push(`/surah/${item.surah_id}?ayah=${item.ayah_number}`)}
        style={{ minHeight: touchTargets.minimum, gap: 4 }}
      >
        {/* ...existing RTL row: Arabic word at the start edge, reference at the
            end... with the reference now 3-part and the pill + translit beside
            the word. */}
        <Text testID="concordance-ref" style={{ color: theme.mutedText, fontSize: typography.caption }}>
          {item.surah_id}:{item.ayah_number}:{item.position}
        </Text>
        {form && formStyle ? (
          <View
            testID="concordance-form"
            style={{ backgroundColor: formStyle.tint, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 }}
          >
            {/* form_translit is the readable name of the form; pos_label is the
                fallback for the ~none that lack one. */}
            <Text style={{ color: formStyle.color, fontSize: typography.caption, fontWeight: '600' }}>
              {form.form_translit ?? form.pos_label}
            </Text>
          </View>
        ) : null}
        {item.transliteration ? (
          <Text testID="concordance-translit" style={{ color: theme.mutedText, fontSize: typography.caption }}>
            {item.transliteration}
          </Text>
        ) : null}
        {item.gloss ? (
          <Text testID="concordance-gloss" style={{ color: theme.mutedText, fontSize: typography.caption }}>
            {item.gloss}
          </Text>
        ) : null}
        {/* ...existing verse Text, rendering `shown` instead of trimmed.words,
            and suppressing the … sentinels while expanded... */}
      </Pressable>

      {/* Outside the Pressable above, deliberately: the row is one accessibility
          node whose label replaces its subtree, so a nested toggle announces as
          nothing -- and a press target inside a press target is ambiguous on
          Android. */}
      {canExpand ? (
        <Pressable
          testID="concordance-expand"
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((value) => !value)}
          style={{ minHeight: touchTargets.compact, justifyContent: 'center', alignSelf: 'flex-start' }}
        >
          <Text style={{ color: theme.accent, fontSize: typography.caption }}>
            {t(uiLocale, expanded ? 'text.showLess' : 'concordance.showFullVerse')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
```

The verse `Text` keeps its existing per-word `Fragment` structure, the match's three signals (accent colour + `accentWash` + `fontWeight: '700'`), and the dimmed sentinels — those are rendered only when `!expanded`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @quran-corpus/mobile test ConcordanceList`
Expected: PASS — the new cases and all 17 existing ones (paging, generation guards, empty/failed states).

- [ ] **Step 5: Mutation-check**

Change `const canExpand = trimmed.words.length < item.verse_words.length;` to `const canExpand = true;`. Expected: "offers the full verse only when the trim actually cut it" FAILS on the short-verse half. Re-edit back; PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/ConcordanceList.tsx apps/mobile/src/components/ConcordanceList.test.tsx apps/mobile/src/i18n/uiStrings.ts
git commit -m "feat(mobile): full occurrence rows with show-full-verse"
```

---

## Task 7: Derived-form filter chips

Replace the root screen's stacked form cards with web's wrapping multi-select chips, and wire the selection to the concordance. Nothing selected means All.

**Files:**
- Create: `apps/mobile/src/components/FormFilterChips.tsx`, `apps/mobile/src/components/FormFilterChips.test.tsx`
- Modify: `apps/mobile/app/root/[buckwalter].tsx`, `apps/mobile/src/screens/RootRoute.test.tsx`
- Modify: `apps/mobile/src/data/corpusRepository.ts`
- Modify: `apps/mobile/src/i18n/uiStrings.ts`

**Interfaces:**
- Consumes: `formColorFor` (Task 2), `ConcordanceListProps.forms` (Task 6).
- Produces: `FormFilterChips({ forms, selected, onToggle, uiLocale })`; `getRootOccurrenceCount` and `getRootOccurrences` each gain an optional trailing `formIds?: number[]`.

New i18n key:

| key | en | uz | ru |
| --- | --- | --- | --- |
| `root.formsFilter` | Filter by form | Shakl bo‘yicha filtr | Фильтр по форме |

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/src/components/FormFilterChips.test.tsx`:

```tsx
const FORMS = [
  { id: 1, root_id: 1, sort_order: 0, pos_label: 'Form I verb', form_arabic: 'قَالَ',
    form_translit: 'qāla', gloss: 'to say', occurrence_count: 1618 },
  { id: 2, root_id: 1, sort_order: 1, pos_label: 'Noun', form_arabic: 'قَوْل',
    form_translit: 'qawl', gloss: 'word', occurrence_count: 92 },
];

it('renders every field the chip carries', () => {
  render(<FormFilterChips uiLocale="en" forms={FORMS} selected={[]} onToggle={() => {}} />);
  const chip = screen.getAllByTestId('form-chip')[0];
  expect(chip).toHaveTextContent('Form I verb');
  expect(chip).toHaveTextContent('قَالَ');
  expect(chip).toHaveTextContent('qāla');
  expect(chip).toHaveTextContent('to say');
  expect(chip).toHaveTextContent('1618');
});

it('reports selection to TalkBack, not only in colour', () => {
  render(<FormFilterChips uiLocale="en" forms={FORMS} selected={[2]} onToggle={() => {}} />);
  const [first, second] = screen.getAllByTestId('form-chip');
  expect(first).toHaveAttribute('aria-pressed', 'false');
  expect(second).toHaveAttribute('aria-pressed', 'true');
});

it('toggles the chip it was tapped on', () => {
  const onToggle = vi.fn();
  render(<FormFilterChips uiLocale="en" forms={FORMS} selected={[]} onToggle={onToggle} />);
  fireEvent.click(screen.getAllByTestId('form-chip')[1]);
  expect(onToggle).toHaveBeenCalledWith(2);
});

it('renders nothing for a root with no forms', () => {
  const { container } = render(
    <FormFilterChips uiLocale="en" forms={[]} selected={[]} onToggle={() => {}} />,
  );
  expect(container.querySelector('[data-testid="form-chip"]')).toBeNull();
});
```

Add to `RootRoute.test.tsx`:

```tsx
it('narrows the concordance to the selected forms', async () => {
  render(<RootRoute />);
  fireEvent.click((await screen.findAllByTestId('form-chip'))[0]);
  await waitFor(() =>
    expect(mocks.getRootOccurrences).toHaveBeenLastCalledWith(
      expect.anything(), 'qwl', 'en', 0, expect.any(Number), [1],
    ),
  );
});

it('recounts the total for the filtered set', async () => {
  // Filtering the rows but not the count renders "Concordance (1722)" over 92
  // occurrences -- the heading would be a lie about what is on screen.
  mocks.getRootOccurrenceCount.mockResolvedValueOnce(1722).mockResolvedValueOnce(92);
  render(<RootRoute />);
  fireEvent.click((await screen.findAllByTestId('form-chip'))[0]);
  await waitFor(() =>
    expect(screen.getByTestId('concordance-heading')).toHaveTextContent('Concordance (92)'),
  );
});

it('goes back to every occurrence when the last chip is cleared', async () => {
  render(<RootRoute />);
  const chip = (await screen.findAllByTestId('form-chip'))[0];
  fireEvent.click(chip);
  fireEvent.click(chip);
  await waitFor(() =>
    expect(mocks.getRootOccurrences).toHaveBeenLastCalledWith(
      expect.anything(), 'qwl', 'en', 0, expect.any(Number), undefined,
    ),
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @quran-corpus/mobile test FormFilterChips RootRoute`
Expected: FAIL — no `FormFilterChips` module, no `form-chip` testID.

- [ ] **Step 3: Implement the chips**

```tsx
import { Pressable, Text, View } from 'react-native';
import type { RootForm } from '@quran-corpus/data/mobile';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { formColorFor } from '@/theme/formTint';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export interface FormFilterChipsProps {
  forms: RootForm[];
  /** root_forms.id values currently selected. Empty = All (no filter). */
  selected: number[];
  onToggle: (formId: number) => void;
  uiLocale: UiLocaleCode;
}

/** The root's derived forms as tappable multi-select filter chips.
 *
 *  Wrapping row, not one card per row: a 22-form root would otherwise push the
 *  concordance several screens down. Selection is signalled by border AND tint
 *  AND weight -- never colour alone (§8, WCAG 1.4.1) -- and by aria-pressed for
 *  TalkBack, which sees none of the three.
 *
 *  Material filter chips are buttons carrying a selected state, so the
 *  container is a toolbar rather than a radiogroup: they multi-select, and
 *  radiogroup would claim radio children they deliberately are not. Same
 *  reasoning as the Frequent pane's kind chips. */
export function FormFilterChips({ forms, selected, onToggle, uiLocale }: FormFilterChipsProps) {
  const theme = useThemeColors();
  if (forms.length === 0) return null;

  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel={t(uiLocale, 'root.formsFilter')}
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
    >
      {forms.map((form) => {
        const isSelected = selected.includes(form.id);
        const { color, tint } = formColorFor(theme, form.pos_label);
        return (
          <Pressable
            key={form.id}
            testID="form-chip"
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            onPress={() => onToggle(form.id)}
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 6,
              minHeight: touchTargets.compact,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: isSelected ? color : theme.border,
              // The palette's tinted contrast figures assume the tint sits
              // directly on the page. Nothing may paint behind this chip.
              backgroundColor: isSelected ? tint : 'transparent',
            }}
          >
            <Text style={{ color, fontSize: typography.caption, fontWeight: isSelected ? '700' : '500' }}>
              {form.pos_label}
            </Text>
            {form.form_arabic ? (
              <Text style={{ color: theme.text, fontFamily: 'Hafs', fontSize: typography.body }}>
                {form.form_arabic}
              </Text>
            ) : null}
            {form.form_translit ? (
              <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>
                {form.form_translit}
              </Text>
            ) : null}
            {form.gloss ? (
              <Text style={{ color: theme.text, fontSize: typography.caption }}>{form.gloss}</Text>
            ) : null}
            <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>
              {form.occurrence_count}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
```

- [ ] **Step 4: Wire the selection through**

In `corpusRepository.ts`, thread the ids into the shared queries — no query logic here, just the pass-through:

```ts
export async function getRootOccurrenceCount(
  client: MobileDataClient,
  bw: string,
  formIds?: number[],
): Promise<number> {
  return countRootConcordance(client, bw, formIds);
}

export async function getRootOccurrences(
  client: MobileDataClient,
  bw: string,
  lang: ContentLanguageCode,
  offset: number,
  limit: number,
  formIds?: number[],
): Promise<ConcordanceEntry[]> {
  return getRootConcordancePage(client, bw, { lang, offset, limit, formIds });
}
```

In `app/root/[buckwalter].tsx`:
- `const [selected, setSelected] = useState<number[]>([]);`
- **Key the selection to the root**: `useEffect(() => setSelected([]), [buckwalter]);` — an id from one root's forms means a different form on the next root, so carrying the selection across an in-app Previous/Next filters the new root by a stale id.
- Pass `undefined` rather than `[]` when nothing is selected, so the shared query takes its unfiltered branch.
- `loadPage`'s `useCallback` deps gain the selection **as a stable string** (`selected.slice().sort().join(',')`), matching web's reason: a fresh array identity every render restarts `ConcordanceList` from page 0 on each parent render. `ConcordanceList` reads a changed `loadPage` as "a new list" and resets — which is exactly what a filter change should do.
- Refetch `total` in an effect keyed on the same string, so the heading counts what is on screen.
- Render `<FormFilterChips …/>` above the `Concordance (N)` heading and pass `forms` down to `<ConcordanceList forms={forms} …/>`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @quran-corpus/mobile test FormFilterChips RootRoute`
Expected: PASS.

- [ ] **Step 6: Mutation-check**

Delete the `useEffect(() => setSelected([]), [buckwalter])` reset, then add and run this case (keep it — it is the regression that effect exists for):

```tsx
it('clears the form filter when a neighbour root is opened', async () => {
  // Form ids are per-root. Carrying one across Previous/Next filters the new
  // root by an id that belongs to a form it does not have.
  const { rerender } = render(<RootRoute />);
  fireEvent.click((await screen.findAllByTestId('form-chip'))[0]);
  mocks.params = { buckwalter: 'qwm' };
  rerender(<RootRoute />);
  await waitFor(() =>
    expect(mocks.getRootOccurrences).toHaveBeenLastCalledWith(
      expect.anything(), 'qwm', 'en', 0, expect.any(Number), undefined,
    ),
  );
});
```

Expected: FAILS without the effect, PASSES with it. Re-edit the effect back.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/components/FormFilterChips.tsx apps/mobile/src/components/FormFilterChips.test.tsx \
        apps/mobile/app/root/\[buckwalter\].tsx apps/mobile/src/screens/RootRoute.test.tsx \
        apps/mobile/src/data/corpusRepository.ts apps/mobile/src/i18n/uiStrings.ts
git commit -m "feat(mobile): filter the root concordance by derived form"
```

---

## Task 8: Lemma screen parity

`LemmaScreen`'s docstring currently states its omissions as deliberate — "the senses breakdown, occurrence count and root-definition card live on the root screen this links to". That call is reversed: a verb page reached from Frequent is a destination, not a waypoint. Rewrite the docstring too, or the next reader restores the gap.

**Files:**
- Modify: `apps/mobile/src/screens/LemmaScreen.tsx`, `apps/mobile/src/screens/LemmaScreen.test.tsx`
- Create: `apps/mobile/src/components/InfoSheet.tsx`, `apps/mobile/src/components/InfoSheet.test.tsx`
- Modify: `apps/mobile/src/i18n/uiStrings.ts`

**Interfaces:**
- Consumes: `EntryHeader` (Task 3), `DefinitionCard` (Task 4), existing `BottomSheet`.
- Produces: `InfoSheet({ label, body, uiLocale })` — a ⓘ button that opens `BottomSheet` with one paragraph.

New i18n keys:

| key | en | uz | ru |
| --- | --- | --- | --- |
| `lemma.aboutTranslations` | About these translations | Bu tarjimalar haqida | Об этих переводах |
| `lemma.translationsNote` | From word-by-word translations, ordered by frequency — not dictionary definitions. | So‘zma-so‘z tarjimalardan olingan, chastota bo‘yicha tartiblangan — lug‘at ta’riflari emas. | Из пословных переводов, упорядочены по частоте — это не словарные определения. |
| `lemma.rootDefinition` | Definition of root | O‘zak ta’rifi | Определение корня |
| `lemma.viewRoot` | View root | O‘zakni ko‘rish | Открыть корень |
| `lemma.close` | Close | Yopish | Закрыть |

`lemma.translatedAs`, `root.noDefinition` and `concordance.heading` already exist and are reused.

- [ ] **Step 1: Write the failing tests**

Add to `apps/mobile/src/screens/LemmaScreen.test.tsx`:

```tsx
it('shows the headword, its reading and how often it occurs', async () => {
  mocks.getLemmaScreen.mockResolvedValue({ entry: LEMMA, total: 1722 });
  render(<LemmaScreen lemmaBuckwalter="qaAla" />);
  expect(await screen.findByTestId('entry-translit')).toHaveTextContent('qāla');
  expect(screen.getByTestId('entry-count')).toHaveTextContent('1722 occurrences');
});

it('breaks the lemma down by grammatical sense', async () => {
  // مَا is tagged six ways; naming only the commonest misdescribes 42% of its
  // occurrences, and the counts explain why the concordance below is mixed.
  mocks.getLemmaScreen.mockResolvedValue({
    entry: { ...LEMMA, senses: [
      { pos_tag: 'REL', pos_label: 'Relative pronoun', count: 1266 },
      { pos_tag: 'NEG', pos_label: 'Negative particle', count: 704 },
    ] },
    total: 2177,
  });
  render(<LemmaScreen lemmaBuckwalter="mA" />);
  const chips = await screen.findAllByTestId('sense-chip');
  expect(chips).toHaveLength(2);
  expect(chips[0]).toHaveTextContent('1266');
});

it('omits the count on a single-sense lemma', async () => {
  // With one sense it duplicates the "occurs N times" line right above it.
  mocks.getLemmaScreen.mockResolvedValue({
    entry: { ...LEMMA, senses: [{ pos_tag: 'V', pos_label: 'Verb', count: 1722 }] },
    total: 1722,
  });
  render(<LemmaScreen lemmaBuckwalter="qaAla" />);
  expect(await screen.findByTestId('sense-chip')).not.toHaveTextContent('1722');
});

it('explains the glosses behind an info button rather than in body text', async () => {
  render(<LemmaScreen lemmaBuckwalter="qaAla" />);
  fireEvent.click(await screen.findByTestId('info-button'));
  expect(screen.getByTestId('info-body')).toHaveTextContent('not dictionary definitions');
});

it('carries the root definition with its credit', async () => {
  mocks.getLemmaScreen.mockResolvedValue({
    entry: { ...LEMMA, root_definition: 'to say', root_definition_source: 'lane' },
    total: 5,
  });
  render(<LemmaScreen lemmaBuckwalter="qaAla" />);
  expect(await screen.findByTestId('definition-card')).toHaveTextContent('to say');
  expect(screen.getByTestId('definition-source')).toHaveTextContent("Lane's Lexicon");
});

it('says the lexicon has no entry rather than showing an empty card', async () => {
  mocks.getLemmaScreen.mockResolvedValue({
    entry: { ...LEMMA, root_definition: null, root_definition_source: null },
    total: 5,
  });
  render(<LemmaScreen lemmaBuckwalter="qaAla" />);
  expect(await screen.findByTestId('lemma-no-definition')).toBeTruthy();
});

it('hides the root section entirely for a rootless lemma', async () => {
  mocks.getLemmaScreen.mockResolvedValue({
    entry: { ...LEMMA, root_buckwalter: null, root_definition: null }, total: 5,
  });
  render(<LemmaScreen lemmaBuckwalter="qaAla" />);
  await screen.findByTestId('entry-count');
  expect(screen.queryByTestId('lemma-root')).toBeNull();
  expect(screen.queryByTestId('lemma-no-definition')).toBeNull();
});

it('counts the concordance in its heading', async () => {
  mocks.getLemmaScreen.mockResolvedValue({ entry: LEMMA, total: 1722 });
  render(<LemmaScreen lemmaBuckwalter="qaAla" />);
  expect(await screen.findByTestId('concordance-heading')).toHaveTextContent('Concordance (1722)');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @quran-corpus/mobile test LemmaScreen`
Expected: FAIL on every new testID.

- [ ] **Step 3: Implement InfoSheet**

```tsx
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export interface InfoSheetProps {
  /** Accessible name for the ⓘ button, e.g. "About these translations". */
  label: string;
  /** One paragraph. Longer than that belongs on a screen, not in a sheet. */
  body: string;
  uiLocale: UiLocaleCode;
}

/** A ⓘ button that opens one paragraph in a bottom sheet.
 *
 *  The caveat it holds is the same sentence on all 3,382 lemma pages: as
 *  permanent body text it is noise after the first read, and it pushed the
 *  concordance -- what the reader came for -- further down every visit. Behind
 *  the icon it is one tap away once and costs nothing after. Android's own
 *  pattern for a footnote, and BottomSheet already handles the backdrop, the
 *  back button and drag-to-dismiss. */
export function InfoSheet({ label, body, uiLocale }: InfoSheetProps) {
  const theme = useThemeColors();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        testID="info-button"
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={{
          minWidth: touchTargets.compact,
          minHeight: touchTargets.compact,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: theme.mutedText, fontSize: typography.body }}>ⓘ</Text>
      </Pressable>
      {open ? (
        <BottomSheet onClose={() => setOpen(false)} closeLabel={t(uiLocale, 'lemma.close')}>
          <View style={{ padding: 20, gap: 8 }}>
            <Text accessibilityRole="header" style={{ color: theme.text, fontSize: typography.body }}>
              {label}
            </Text>
            <Text testID="info-body" style={{ color: theme.mutedText, fontSize: typography.body }}>
              {body}
            </Text>
          </View>
        </BottomSheet>
      ) : null}
    </>
  );
}
```

- [ ] **Step 4: Rebuild the lemma header**

Replace `LemmaScreen`'s `header` with, in order: `EntryHeader` (arabic `entry.lemma`, `entry.transliteration`, `count` `entry.count`) whose children are the sense chips; the "TRANSLATED AS" caption with `InfoSheet` beside it and the gloss pills below; the root card; the `Concordance (total)` heading.

Sense chips reuse the reader's own colour function — same five buckets, same tokens, so a verb is the same red here as in the word-by-word view:

```tsx
{entry.senses.map((sense) => {
  const bucket = posBucket(sense.pos_tag);
  return (
    <View key={sense.pos_tag} testID="sense-chip" style={chipStyle}>
      {/* The colour rides on a dot, not the label: these run in a dense row and
          a repeated tint reads as noise at this size. Meaning never rides on
          colour either way -- the label carries it. posBucket returns null for
          DET, which renders no dot rather than an arbitrary colour. */}
      {bucket ? <View accessibilityElementsHidden style={{ width: 6, height: 6, borderRadius: 3,
        backgroundColor: theme.pos[bucket] }} /> : null}
      <Text style={{ color: theme.text, fontSize: typography.caption }}>{sense.pos_label}</Text>
      {/* Count only when there is more than one sense: with a single sense it
          duplicates the occurrence line directly above. */}
      {entry.senses.length > 1 ? (
        <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>{sense.count}</Text>
      ) : null}
    </View>
  );
})}
```

Root section, rendered only when `entry.root_buckwalter` is non-null: the `lemma.rootDefinition` caption, then `DefinitionCard` when `entry.root_definition` exists or a `lemma-no-definition` line when it does not, then the existing `lemma-root` link relabelled `lemma.viewRoot`.

Rewrite the component docstring: it currently justifies the omissions this task removes.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @quran-corpus/mobile test LemmaScreen InfoSheet LemmaRoute`
Expected: PASS.

- [ ] **Step 6: Mutation-check**

Change `{entry.senses.length > 1 ? (` to `{true ? (`. Expected: "omits the count on a single-sense lemma" FAILS. Re-edit back; PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/screens/LemmaScreen.tsx apps/mobile/src/screens/LemmaScreen.test.tsx \
        apps/mobile/src/components/InfoSheet.tsx apps/mobile/src/components/InfoSheet.test.tsx \
        apps/mobile/src/i18n/uiStrings.ts
git commit -m "feat(mobile): full lemma entry with senses and root definition"
```

---

## Task 9: Browse on one screen

Browse becomes search + grid + sort + rows on `/dictionary`, like web's `DictionaryBrowser`. `LetterScreen`, its route, its two test files and `parseLetterParam` go with it.

**The RN constraint that shapes the layout:** a `TextInput` inside a FlatList's `ListHeaderComponent` loses focus on every keystroke — the header element is a new instance each render, so the input remounts. The search box therefore sits **above** the FlatList as a sibling; the grid, sort toggle and result count ride in the header and scroll away.

**Files:**
- Create: `apps/mobile/src/components/DictionaryRow.tsx`, `apps/mobile/src/components/DictionaryRow.test.tsx`
- Modify: `apps/mobile/src/screens/DictionaryScreen.tsx`, `apps/mobile/src/screens/DictionaryScreen.test.tsx`
- Modify: `apps/mobile/src/components/AlphabetGrid.tsx`, `apps/mobile/src/components/AlphabetGrid.test.tsx`
- Modify: `apps/mobile/src/data/corpusRepository.ts`, `apps/mobile/src/data/routeParams.ts`
- Delete: `apps/mobile/src/screens/LetterScreen.tsx`, `apps/mobile/src/screens/LetterScreen.test.tsx`, `apps/mobile/app/dictionary/letter/[letter].tsx`, `apps/mobile/src/test/routes/letter.test.tsx`
- Modify: `apps/mobile/src/i18n/uiStrings.ts`

**Interfaces:**
- Consumes: `foldRootArabic` (Task 1).
- Produces: `DictionaryRow({ arabic, gloss?, count, rank?, href, uiLocale })`, consumed by Task 10. `AlphabetGrid` gains `activeLetter?: string | null`. `getAllRootsForBrowse(client): Promise<RootSearchItem[]>` in `corpusRepository`.

New i18n keys:

| key | en | uz | ru |
| --- | --- | --- | --- |
| `dictionary.searchPlaceholder` | Search roots or meaning… | O‘zak yoki ma’noni qidirish… | Поиск корня или значения… |
| `dictionary.searchLabel` | Search roots or meaning | O‘zak yoki ma’noni qidirish | Поиск корня или значения |
| `dictionary.sortAlpha` | Alphabetical | Alifbo bo‘yicha | По алфавиту |
| `dictionary.sortFreq` | By frequency | Chastota bo‘yicha | По частоте |
| `dictionary.sortFilter` | Sort order | Tartiblash | Сортировка |
| `dictionary.noRootsFound` | No roots found | O‘zak topilmadi | Корни не найдены |

`dictionary.noRoots` and `dictionary.letterCaption` lose their only call sites with `LetterScreen`; delete both keys from all three locale tables and from `UiStringKey`.

- [ ] **Step 1: Write the failing tests**

`DictionaryRow.test.tsx`:

```tsx
it('names the row so the count is announced as a count', () => {
  render(<DictionaryRow uiLocale="en" arabic="قول" count={1722} href="/root/qwl" />);
  expect(screen.getByTestId('dictionary-row'))
    .toHaveAttribute('aria-label', 'قول, 1722 occurrences');
});

it('shows a rank when it was given one, and none otherwise', () => {
  const { rerender } = render(
    <DictionaryRow uiLocale="en" rank={3} arabic="قول" count={5} href="/root/qwl" />,
  );
  expect(screen.getByTestId('dictionary-rank')).toHaveTextContent('3');
  rerender(<DictionaryRow uiLocale="en" arabic="قول" count={5} href="/root/qwl" />);
  expect(screen.queryByTestId('dictionary-rank')).toBeNull();
});

it('opens what it points at', () => {
  render(<DictionaryRow uiLocale="en" arabic="قول" count={5} href="/root/qwl" />);
  fireEvent.click(screen.getByTestId('dictionary-row'));
  expect(mocks.push).toHaveBeenCalledWith('/root/qwl');
});
```

`DictionaryScreen.test.tsx` — replace "opens on Browse and routes a tapped letter to its own screen":

```tsx
it('lists every root on Browse, without a letter tap', async () => {
  render(<DictionaryScreen />);
  expect(await screen.findAllByTestId('dictionary-row')).toHaveLength(3);
});

it('filters by letter in place, and clears on a second tap', async () => {
  render(<DictionaryScreen />);
  const qaf = (await screen.findAllByTestId('alphabet-cell')).find(
    (cell) => cell.getAttribute('aria-label') === 'ق',
  )!;
  fireEvent.click(qaf);
  expect(screen.getAllByTestId('dictionary-row')).toHaveLength(1);
  expect(qaf).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(qaf);
  expect(screen.getAllByTestId('dictionary-row')).toHaveLength(3);
});

it('searches Arabic across hamza seats', async () => {
  // The stored root is أرض; a reader types ارض. Same fold searchRoots uses
  // server-side, so browse and search agree.
  render(<DictionaryScreen />);
  fireEvent.change(await screen.findByTestId('dictionary-search'), { target: { value: 'ارض' } });
  expect(screen.getAllByTestId('dictionary-row')).toHaveLength(1);
});

it('searches the Latin transliteration and the meaning', async () => {
  render(<DictionaryScreen />);
  const box = await screen.findByTestId('dictionary-search');
  fireEvent.change(box, { target: { value: 'qwl' } });
  expect(screen.getAllByTestId('dictionary-row')).toHaveLength(1);
  fireEvent.change(box, { target: { value: 'to say' } });
  expect(screen.getAllByTestId('dictionary-row')).toHaveLength(1);
});

it('says so when nothing matched', async () => {
  render(<DictionaryScreen />);
  fireEvent.change(await screen.findByTestId('dictionary-search'), { target: { value: 'zzzz' } });
  expect(screen.getByTestId('dictionary-empty')).toBeTruthy();
});

it('sorts by frequency and drops the letter filter with it', async () => {
  // Matches web: switching sort clears the letter, so the list the reader sees
  // is the whole corpus ordered by frequency, not one letter of it.
  render(<DictionaryScreen />);
  fireEvent.click((await screen.findAllByTestId('alphabet-cell'))[0]);
  fireEvent.click(screen.getByTestId('dictionary-sort-freq'));
  const rows = screen.getAllByTestId('dictionary-row');
  expect(rows).toHaveLength(3);
  expect(rows[0]).toHaveTextContent('1722');
});

it('keeps the search box out of the scrolling list', async () => {
  // A TextInput inside a FlatList header remounts on every render, so it loses
  // focus on every keystroke. It has to be a sibling of the list.
  render(<DictionaryScreen />);
  const list = await screen.findByTestId('dictionary-list');
  expect(list.contains(screen.getByTestId('dictionary-search'))).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @quran-corpus/mobile test DictionaryScreen DictionaryRow`
Expected: FAIL.

- [ ] **Step 3: Implement**

`DictionaryRow.tsx` — a `Pressable`, not a `Link`: the row is a three-column layout and expo-router's `Link` renders a `Text` on native, inside which a `flexDirection` View does not lay out (same reason `FrequencyList` gives).

```tsx
export interface DictionaryRowProps {
  arabic: string;
  /** A verb row's lemma, or null. Arabic, so it takes the Uthmani face. */
  gloss?: string | null;
  count: number;
  /** 1-based position in a ranked list. Omitted on Browse, which is not ranked. */
  rank?: number;
  href: string;
  uiLocale: UiLocaleCode;
}
```

Row body: optional rank (tabular, muted, fixed `width: 32`), Arabic at the start edge in `flexDirection: 'row-reverse'`, optional gloss, count pill at the end. `accessibilityLabel` is `${arabic}${gloss ? ` ${gloss}` : ''}, ${count} ${t(uiLocale, 'dictionary.occurrences')}` — carried over verbatim from `FrequencyList`, whose row this replaces.

`AlphabetGrid` gains `activeLetter?: string | null` and sets `accessibilityState={{ disabled: !enabled, selected: letter === activeLetter }}` plus an accent border on the active cell — the grid is now a live filter, and with nothing marking the current letter the list silently disagrees with the grid.

`corpusRepository`: add `getAllRootsForBrowse = (client) => getRootSearchList(client)`; delete `getRootsForLetter` (its only caller was `LetterScreen`). Keep `getLettersWithRoots` — the grid still needs it, and it must keep folding through the same `rootFirstLetter` the filter uses.

`DictionaryScreen` Browse pane:

```tsx
const visible = useMemo(() => {
  const q = query.trim().toLowerCase();
  let list = roots;
  if (letter) list = list.filter((root) => rootFirstLetter(root.root_arabic) === letter);
  if (q) {
    // The Arabic arm folds both sides (hamza seat + inter-letter spaces) so
    // `ارض` finds the stored `أرض` -- the same normalization searchRoots uses.
    // The Latin arms stay raw: foldRootArabic('ktb') === 'ktb', and a folded
    // Latin needle never occurs inside an Arabic haystack.
    const qf = foldRootArabic(q);
    list = list.filter(
      (root) =>
        foldRootArabic(root.root_arabic).includes(qf) ||
        root.root_buckwalter.toLowerCase().includes(q) ||
        (root.gloss_blob?.toLowerCase().includes(q) ?? false),
    );
  }
  return [...list].sort((a, b) =>
    sort === 'freq'
      ? b.occurrence_count - a.occurrence_count ||
        compareRootsArabic(a.root_arabic, b.root_arabic)
      : compareRootsArabic(a.root_arabic, b.root_arabic),
  );
}, [roots, query, sort, letter]);
```

Layout: pane tabs, then the `TextInput` (`testID="dictionary-search"`), then a `FlatList` (`testID="dictionary-list"`) whose `ListHeaderComponent` is the grid + the two sort buttons (`accessibilityRole="toolbar"`, `accessibilityState={{ selected }}`) and whose `ListEmptyComponent` is `dictionary-empty`. `keyboardShouldPersistTaps="handled"` on the list — Android's default reads the first tap on a row, with the keyboard open, as "dismiss the keyboard" rather than as a press.

No DOM paging: `FlatList` already virtualizes, which is the whole reason web needs a `PAGE` constant and mobile does not.

- [ ] **Step 4: Delete the letter screen**

Remove `src/screens/LetterScreen.tsx`, `src/screens/LetterScreen.test.tsx`, `app/dictionary/letter/[letter].tsx`, `src/test/routes/letter.test.tsx`, and `parseLetterParam` from `src/data/routeParams.ts` (its only caller was that route). `ARABIC_ALPHABET_ORDER` stays imported by `AlphabetGrid`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @quran-corpus/mobile test && pnpm -r typecheck`
Expected: PASS, with no dangling import of `LetterScreen` or `parseLetterParam`.

- [ ] **Step 6: Mutation-check**

Replace `foldRootArabic(root.root_arabic).includes(qf)` with `root.root_arabic.includes(q)`. Expected: "searches Arabic across hamza seats" FAILS. Re-edit back; PASS.

- [ ] **Step 7: Commit**

```bash
git add -A apps/mobile/src apps/mobile/app
git commit -m "feat(mobile): browse the whole dictionary on one screen"
```

---

## Task 10: Frequent as a ranked table

Four changes the owner asked for: a rank number, paging past the top 200, Browse's row component, and a label on the count.

**Files:**
- Modify: `apps/mobile/src/components/FrequencyList.tsx`, `apps/mobile/src/components/FrequencyList.test.tsx`
- Modify: `apps/mobile/src/data/corpusRepository.ts`
- Modify: `apps/mobile/src/i18n/uiStrings.ts`

**Interfaces:**
- Consumes: `DictionaryRow` (Task 9).
- Produces: `getFrequencyRows(client, kind, limit?)`.

New i18n keys:

| key | en | uz | ru |
| --- | --- | --- | --- |
| `dictionary.columnRank` | # | # | № |
| `dictionary.columnForm` | Form | Shakl | Форма |
| `dictionary.columnCount` | Count | Soni | Кол-во |

- [ ] **Step 1: Write the failing tests**

```tsx
it('numbers the rows from one', async () => {
  render(<FrequencyList kind="roots" />);
  const ranks = await screen.findAllByTestId('dictionary-rank');
  expect(ranks[0]).toHaveTextContent('1');
  expect(ranks[2]).toHaveTextContent('3');
});

it('heads the columns so the trailing number is not a bare integer', async () => {
  render(<FrequencyList kind="roots" />);
  expect(await screen.findByTestId('frequency-header')).toHaveTextContent('Count');
});

it('asks for more than the top 200', async () => {
  // The shared queries default to 200; the table is the surface where a reader
  // actually scrolls past it.
  render(<FrequencyList kind="lemmas" />);
  await waitFor(() =>
    expect(mocks.getFrequencyRows).toHaveBeenCalledWith(expect.anything(), 'lemmas', 1000),
  );
});

it('reuses the browse row rather than a second row layout', async () => {
  render(<FrequencyList kind="verbs" />);
  expect(await screen.findAllByTestId('dictionary-row')).toHaveLength(3);
});
```

Keep every existing case (`asks for the kind it was given`, `refetches when the kind changes`, the Arabic-face gloss, the failed-load state) — they still hold.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @quran-corpus/mobile test FrequencyList`
Expected: FAIL — no rank, no header, `frequency-row` not `dictionary-row`, limit not passed.

- [ ] **Step 3: Implement**

`getFrequencyRows(client, kind, limit = FREQUENCY_LIMIT)` passes `limit` to `getRootsByFrequency` / `getLemmaFrequency` / `getVerbConcordance`, each of which already takes one.

```ts
/** Rows per Frequent list. The shared queries default to 200, which is a page
 *  and a half of scrolling -- short enough that a reader hits the bottom and
 *  reads it as the end of the data. 1000 rows of three columns is ~40KB across
 *  the bridge from a local file, once per chip tap. */
export const FREQUENCY_LIMIT = 1000;
```

`FrequencyList` renders a `frequency-header` row (`#` / `Form` / `Count`, muted, caption size, `accessibilityRole="header"`) above the `FlatList`, and each row as `<DictionaryRow rank={index + 1} … />`. `key={kind}` stays — refetching on a chip tap does not reset the content offset, so without it you land mid-list in the new kind with nothing saying it changed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @quran-corpus/mobile test FrequencyList DictionaryScreen`
Expected: PASS.

- [ ] **Step 5: Mutation-check**

Change `rank={index + 1}` to `rank={index}`. Expected: "numbers the rows from one" FAILS. Re-edit back; PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/FrequencyList.tsx apps/mobile/src/components/FrequencyList.test.tsx \
        apps/mobile/src/data/corpusRepository.ts apps/mobile/src/i18n/uiStrings.ts
git commit -m "feat(mobile): rank the frequency lists and share the browse row"
```

---

## Task 11: Locale completeness and the device gate

`apps/mobile` has no emulator in CI, so the on-device checklist in `README.md` is its gate (§10). Checks 34–36 currently pass on a screen that merely opens; rewrite them to bite on parity.

**Files:**
- Modify: `apps/mobile/src/i18n/uiStrings.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Write the failing test**

`uiStrings.test.ts` already covers the locale tables; add the guard that fails on a half-translated key if it is not already there:

```ts
it('translates every key in every locale', () => {
  const keys = Object.keys(strings.en) as UiStringKey[];
  for (const locale of ['en', 'uz', 'ru'] as const) {
    for (const key of keys) {
      expect(strings[locale][key], `${locale} is missing ${key}`).toBeTruthy();
    }
    expect(Object.keys(strings[locale])).toHaveLength(keys.length);
  }
});
```

- [ ] **Step 2: Run test**

Run: `pnpm --filter @quran-corpus/mobile test uiStrings`
Expected: PASS if Tasks 4–10 each added all three locales; FAIL naming the exact missing key otherwise — fix it in `uiStrings.ts` and re-run.

- [ ] **Step 3: Rewrite the device checks**

In `README.md`, under **M4 Dictionary + Search Smoke Test**, replace checks 34–36 and add 39–41. Note in the section preamble that these need a `preview` APK built at the M5 head — an older build has no browse search box, so 34 cannot be run against it.

```markdown
34. Dictionary → Browse. The full root list is there with no letter tap. Type
    `ارض` — the stored `أرض` comes back (hamza seats fold). Type `to say` — the
    meaning search finds قول. Tap ق: the list narrows and the ق cell is visibly
    marked; tap it again and the list is whole. **Keep typing after the first
    letter** — if the keyboard closes or the caret jumps, the search box has
    ended up inside the list header.
35. Dictionary → Frequent. Roots, Lemmas and Verbs each load a different ranked
    list, numbered from 1, under a #/Form/Count header. Scroll past row 200 —
    the list keeps going. Tap a verb row: it opens a lemma screen, not a dead
    end.
36. Root screen for قول. The header is centred: three letter pills, "1722
    occurrences", Previous/Next. Tap Next twice, then Previous twice — you land
    back on قول. On the first and last root of the alphabet the arrow is dimmed
    and does nothing rather than disappearing.
39. Same screen: the derived-form chips wrap over several lines and do not
    stretch across the row. Tap one — the chip fills with its own colour, the
    heading recounts (`Concordance (N)` matches the rows below), and the list
    restarts from the top. Tap it again for the whole list back. Then tap Next:
    the new root opens with **no chip selected**.
40. Any occurrence row: it reads `2:3:6` (three parts), carries the form's
    transliteration in a coloured pill, the word's transliteration and its
    translation. Tap **Show full verse** — the whole ayah appears and the button
    reads Show less; the row itself still opens the reader. With TalkBack on,
    the toggle is reachable as its own control.
41. Lemma screen for قَالَ: transliteration, sense chips with counts, TRANSLATED
    AS with a ⓘ that opens a sheet, and the root definition in a card with its
    credit. A long Lane definition is clamped to six lines with **Show more**;
    tapping it reveals the rest and the button becomes Show less. Repeat in dark
    mode at maximum system font size — nothing clips.
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/i18n/uiStrings.test.ts README.md
git commit -m "docs(mobile): device checks for dictionary parity"
```

- [ ] **Step 5: Run the device checklist**

Build a `preview` APK, run checks 34–36 and 39–41 on real hardware, and record the result in the verification log below. **A milestone is not complete until this has happened** (§10) — "implementation complete, verification pending" is an unmet exit criterion, not a pass.

---

## Risks

| # | Risk | Mitigation |
| --- | --- | --- |
| R1 | `TextInput` inside a FlatList header loses focus per keystroke | Task 9 keeps it a sibling of the list, asserted by "keeps the search box out of the scrolling list" and by device check 34's "keep typing" step |
| R2 | A ScrollView inside a FlatList header is a nested VirtualizedList and breaks scrolling | Both entry headers stay plain `View`s, as they already are; do not "fix" a cramped header by wrapping it |
| R3 | Android breaks Arabic shaping across nested `<Text>` (f409ed0, `joinSegmentRuns`) | Only per-*word* nesting is used, and Arabic does not shape across a space — a word boundary breaks nothing. Never split *inside* a word to colour part of it |
| R4 | `onTextLayout` reports only rendered lines when `numberOfLines` is set, so the clamp toggle silently never appears on Android | Task 4 detects overflow from the reported line *text*, not the line count; the mutation-check in Task 4 step 5 is exactly this failure |
| R5 | Form ids are per-root, so a selection carried across Previous/Next filters by a stale id | Task 7's reset effect, with its own regression test |
| R6 | Filtering rows without recounting the total renders a heading that lies about what is on screen | Task 7 refetches `total` on the same key |
| R7 | Uzbek and Russian strings are written by the implementer, not a native speaker | Flagged to the owner at review; every key exists in all three locales (Task 11) so nothing falls back silently, and wording can be corrected later without touching code |
| R8 | Deleting `LetterScreen` orphans an installed deep link `/dictionary/letter/ق` | Nothing in the app links to it — only `DictionaryScreen` did, and Task 9 changes that. Expo Router serves its own not-found for an unknown path |

## Rollback

Each task is one commit and none of them migrate data or touch the on-device user DB, so `git revert <sha>` is the rollback for any single one. The riskiest ordering coupling is Task 6 → Task 7 (the `forms` prop): reverting Task 6 alone breaks Task 7's chips, so revert both or neither. Task 1 is the only cross-package commit; reverting it requires reverting nothing else, because web keeps its `formCategoryColor` module either way.

## Acceptance criteria

- [ ] `pnpm -r lint`, `pnpm -r typecheck`, `pnpm --filter @quran-corpus/data test`, `pnpm --filter web test` and `pnpm --filter @quran-corpus/mobile test` all pass.
- [ ] `packages/data/tests/mobile-entry.test.ts` and `tests/client-entry.test.ts` pass unmodified except for the two added export assertions.
- [ ] `git grep -n "categorizeFormLabel" apps/web/src` shows only the re-export in `formCategoryColor.ts`.
- [ ] No file under `packages/data/src/queries/` and no `.sql` file is modified by this phase (`git diff --stat main -- packages/data/src/queries packages/data/src/schema.sql` is empty). If that stops being true, §5 applies and the user must be asked to run `/code-review`.
- [ ] `git grep -rn "LetterScreen\|parseLetterParam"` returns nothing.
- [ ] Every key in `UiStringKey` resolves in `en`, `uz` and `ru`.
- [ ] Each of Tasks 1–10 has a recorded mutation-check: the named edit made the named test fail, and the test passed again after the edit was reversed **by re-editing** (never `git checkout`/`git restore`).
- [ ] Device checks 34–36 and 39–41 run on real hardware and recorded below.

## Verification log

| Check | Device / build | Date | Result |
| --- | --- | --- | --- |
| 34 |  |  |  |
| 35 |  |  |  |
| 36 |  |  |  |
| 39 |  |  |  |
| 40 |  |  |  |
| 41 |  |  |  |
