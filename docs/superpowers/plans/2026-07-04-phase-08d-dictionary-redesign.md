# Phase 08d Dictionary Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arabic alphabet picker on `/dictionary` + exact matched-word highlight in root concordance verses.

**Architecture:** Alphabet picker = URL param `?letter=X`, server-rendered link grid, client filter of the already-loaded root set. Concordance highlight = rebuild each verse from the words table (exact `position`), wash the matched `word_id`; long lists paginate via the existing 08c `useIncrementalReveal` hook. No schema change — queries + render + one color token.

**Tech Stack:** Next.js 15 App Router (server + client components), React 19, TypeScript, Tailwind (paper/night/**accent** tokens), libSQL (`@quran-corpus/data`), vitest + @testing-library/react (jsdom).

## Global Constraints

- No new runtime dependency (§12). Reuse `useIncrementalReveal` verbatim (DRY, §3).
- `packages/data` stays portable — no web/Next imports.
- Colors only via Tailwind `paper` / `night` / `accent` tokens — no raw hex in components (§8).
- `packages/data` compiles to `dist`; web imports the built package. After any `packages/data` change run `pnpm --filter @quran-corpus/data build` before web type-check/tests.
- Conventional Commits, one logical change per commit. Tests + lint + type-check green before commit (§4). Greptile ≥4/5 at PR (§5) — gate applies to the branch, not per task.
- `exactOptionalPropertyTypes` is on: pass optional props via conditional spread `{...(x ? { prop: x } : {})}`, never `prop={undefined}`.
- Test commands (from repo root):
  - data: `pnpm --filter @quran-corpus/data test` · `… type-check` · `… build`
  - web: `pnpm --filter @quran-corpus/web test` · `… lint` · `… type-check`

---

### Task 1: `rootFirstLetter` helper (data)

Folded first Arabic letter of a root string — buckets roots for the alphabet grid. Reuses the existing private `FOLD` map (أ إ آ ٱ → ا, ى → ي) so grid buckets match collation.

**Files:**
- Modify: `packages/data/src/text/arabic.ts`
- Modify: `packages/data/src/index.ts` (export)
- Test: `packages/data/tests/arabic.test.ts`

**Interfaces:**
- Consumes: existing `FOLD`, `ARABIC_ALPHABET_ORDER` in `arabic.ts`.
- Produces: `rootFirstLetter(rootArabic: string): string` — first non-space char folded; `''` for empty/blank input.

- [ ] **Step 1: Write the failing test** — append to `packages/data/tests/arabic.test.ts` (add `rootFirstLetter` to the import on line 2):

```ts
describe('rootFirstLetter', () => {
  it('returns the first letter of a spaced root', () => {
    expect(rootFirstLetter('ب أ ر')).toBe('ب');
  });
  it('folds a hamza-seat first letter to bare alef', () => {
    expect(rootFirstLetter('أ ك ل')).toBe('ا');
  });
  it('folds alef-maqsura first letter to ya', () => {
    expect(rootFirstLetter('ى س ر')).toBe('ي');
  });
  it('tolerates leading space; empty -> ""', () => {
    expect(rootFirstLetter(' ب ')).toBe('ب');
    expect(rootFirstLetter('')).toBe('');
  });
});
```

Update the import line to:
```ts
import { buckwalterToArabic, compareRootsArabic, rootFirstLetter } from '../src/text/arabic.js';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @quran-corpus/data test -- arabic`
Expected: FAIL — `rootFirstLetter is not a function` / not exported.

- [ ] **Step 3: Implement** — in `packages/data/src/text/arabic.ts`, add a shared `foldLetter` and refactor `orderKey` to use it, then add `rootFirstLetter`. Replace the existing `orderKey` function with:

```ts
function foldLetter(ch: string): string {
  return FOLD[ch] ?? ch;
}

function orderKey(root: string): number[] {
  const key: number[] = [];
  for (const ch of root) {
    if (ch === ' ') continue;
    const idx = ARABIC_ALPHABET_ORDER.indexOf(foldLetter(ch));
    key.push(idx === -1 ? ARABIC_ALPHABET_ORDER.length : idx); // unknown last
  }
  return key;
}

/** First Arabic letter of a root string, folded to its collation base
 * (أ إ آ ٱ -> ا, ى -> ي) so it matches ARABIC_ALPHABET_ORDER buckets.
 * Returns '' for empty/whitespace input. */
export function rootFirstLetter(rootArabic: string): string {
  for (const ch of rootArabic) {
    if (ch === ' ') continue;
    return foldLetter(ch);
  }
  return '';
}
```

- [ ] **Step 4: Export it** — in `packages/data/src/index.ts`, change the arabic export line to:

```ts
export { buckwalterToArabic, compareRootsArabic, rootFirstLetter, ARABIC_ALPHABET_ORDER } from './text/arabic.js';
```

- [ ] **Step 5: Run tests + type-check**

Run: `pnpm --filter @quran-corpus/data test -- arabic` → PASS
Run: `pnpm --filter @quran-corpus/data type-check` → clean

- [ ] **Step 6: Build (so web can consume it later) + commit**

```bash
pnpm --filter @quran-corpus/data build
git add packages/data/src/text/arabic.ts packages/data/src/index.ts packages/data/tests/arabic.test.ts
git commit -m "feat(data): add rootFirstLetter for dictionary letter buckets"
```

---

### Task 2: Concordance from words table (data)

Rebuild concordance verses from the words table so the matched word can be highlighted exactly. Replace `ConcordanceEntry.verse_text` (string) with `verse_words` (ordered word list).

**Files:**
- Modify: `packages/data/src/types.ts:98-107`
- Modify: `packages/data/src/queries/roots.ts` (`getRootConcordance`, ~lines 104-131, + type import)
- Modify: `packages/data/src/index.ts` (export `VerseWord`)
- Test: `packages/data/tests/roots.test.ts`

**Interfaces:**
- Consumes: `words`, `ayahs`, `word_glosses` tables.
- Produces:
  - `interface VerseWord { id: number; position: number; text_arabic: string }`
  - `ConcordanceEntry` now has `verse_words: VerseWord[]` (no `verse_text`); keeps `surah_id, ayah_number, position, word_id, text_arabic, transliteration, gloss`.
  - `getRootConcordance(db, bw, lang='en'): Promise<ConcordanceEntry[]>` — one entry per matched word, `verse_words` = that ayah's words in position order.

- [ ] **Step 1: Write the failing test** — in `packages/data/tests/roots.test.ts`, replace the existing `getRootConcordance` test (lines 77-82) with:

```ts
  it('getRootConcordance rebuilds verse from words + keeps gloss', async () => {
    const c = await getRootConcordance(db, 'smw');
    expect(c).toHaveLength(1);
    expect(c[0]?.gloss).toBe('In (the) name');
    expect(c[0]?.verse_words.map((w) => w.text_arabic)).toEqual(['بِسْمِ', 'ٱللَّهِ']);
    const ids = c[0]!.verse_words.map((w) => w.id);
    expect(ids).toContain(c[0]!.word_id); // matched word is among the verse words
  });
  it('getRootConcordance unknown root -> []', async () => {
    expect(await getRootConcordance(db, 'zzz')).toEqual([]);
  });
  it('two matches in one ayah -> two entries, same verse_words, distinct word_id', async () => {
    const a = await db.execute(`SELECT id FROM ayahs WHERE surah_id=1 AND ayah_number=1`);
    const aid = a.rows[0]!['id'] as number;
    await db.execute({
      sql: `INSERT INTO words (ayah_id,position,text_arabic,root_buckwalter,pos_tag)
            VALUES (?,3,'كَتَبَ','ktb','V'),(?,4,'كِتَٰب','ktb','N')`,
      args: [aid, aid],
    });
    const c = await getRootConcordance(db, 'ktb');
    expect(c).toHaveLength(2);
    expect(c[0]!.word_id).not.toBe(c[1]!.word_id);
    expect(c[0]!.verse_words).toEqual(c[1]!.verse_words);
  });
```

(The two-match test inserts extra words; it runs after the `smw` test, so the `smw` verse_words assertion still sees only the 2 seeded words.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @quran-corpus/data test -- roots`
Expected: FAIL — `verse_words` undefined / type error.

- [ ] **Step 3: Add the type** — in `packages/data/src/types.ts`, replace the `ConcordanceEntry` interface (lines 98-107) with:

```ts
export interface VerseWord {
  id: number;
  position: number;
  text_arabic: string;
}

export interface ConcordanceEntry {
  surah_id: number;
  ayah_number: number;
  position: number;
  word_id: number;
  text_arabic: string;
  transliteration: string | null;
  gloss: string | null;
  verse_words: VerseWord[];
}
```

- [ ] **Step 4: Rewrite the query** — in `packages/data/src/queries/roots.ts`, add `VerseWord` to the type import from `../types.js`, then replace `getRootConcordance` with:

```ts
export async function getRootConcordance(
  db: Client,
  bw: string,
  lang = 'en',
): Promise<ConcordanceEntry[]> {
  const matched = await db.execute({
    sql: `SELECT a.surah_id, a.ayah_number, w.position, w.id AS word_id,
                 w.ayah_id AS ayah_id, w.text_arabic, w.transliteration,
                 g.gloss_text AS gloss
          FROM words w
          JOIN ayahs a ON a.id = w.ayah_id
          LEFT JOIN word_glosses g ON g.word_id = w.id AND g.language_code = ?
          WHERE w.root_buckwalter = ?
          ORDER BY a.surah_id, a.ayah_number, w.position`,
    args: [lang, bw],
  });
  if (matched.rows.length === 0) return [];

  const ayahIds = [...new Set(matched.rows.map((r) => r['ayah_id'] as number))];
  const placeholders = ayahIds.map(() => '?').join(',');
  const sib = await db.execute({
    sql: `SELECT ayah_id, id, position, text_arabic FROM words
          WHERE ayah_id IN (${placeholders})
          ORDER BY ayah_id, position`,
    args: ayahIds,
  });
  const wordsByAyah = new Map<number, VerseWord[]>();
  for (const r of sib.rows) {
    const aid = r['ayah_id'] as number;
    const list = wordsByAyah.get(aid) ?? [];
    list.push({
      id: r['id'] as number,
      position: r['position'] as number,
      text_arabic: r['text_arabic'] as string,
    });
    wordsByAyah.set(aid, list);
  }

  return matched.rows.map((r) => ({
    surah_id: r['surah_id'] as number,
    ayah_number: r['ayah_number'] as number,
    position: r['position'] as number,
    word_id: r['word_id'] as number,
    text_arabic: r['text_arabic'] as string,
    transliteration: (r['transliteration'] as string | null) ?? null,
    gloss: (r['gloss'] as string | null) ?? null,
    verse_words: wordsByAyah.get(r['ayah_id'] as number) ?? [],
  }));
}
```

The type import at the top of `roots.ts` becomes:
```ts
import type {
  Root,
  RootForm,
  RootDefinition,
  RootEntry,
  ConcordanceEntry,
  VerseWord,
} from '../types.js';
```

- [ ] **Step 5: Export `VerseWord`** — in `packages/data/src/index.ts`, add `VerseWord,` to the `export type { ... } from './types.js'` block (e.g. right after `ConcordanceEntry,`).

- [ ] **Step 6: Run tests + type-check**

Run: `pnpm --filter @quran-corpus/data test -- roots` → PASS
Run: `pnpm --filter @quran-corpus/data type-check` → clean

- [ ] **Step 7: Build + commit**

```bash
pnpm --filter @quran-corpus/data build
git add packages/data/src/types.ts packages/data/src/queries/roots.ts packages/data/src/index.ts packages/data/tests/roots.test.ts
git commit -m "feat(data): rebuild concordance verses from words table (verse_words)"
```

---

### Task 3: Alphabet picker (web)

Server link grid + a testable `letterCounts` helper, wired into the dictionary page.

**Files:**
- Create: `apps/web/src/app/dictionary/letters.ts`
- Create: `apps/web/src/components/dictionary/AlphabetGrid.tsx`
- Modify: `apps/web/src/app/dictionary/page.tsx`
- Test: `apps/web/src/test/dictionaryLetters.test.ts`
- Test: `apps/web/src/test/AlphabetGrid.test.tsx`

**Interfaces:**
- Consumes: `rootFirstLetter`, `ARABIC_ALPHABET_ORDER`, `getAllRoots`, `Root` from `@quran-corpus/data` (Task 1).
- Produces:
  - `letterCounts(roots: Root[]): Record<string, number>`
  - `<AlphabetGrid counts={Record<string,number>} activeLetter?={string} />`

- [ ] **Step 1: Build data first** so the new exports resolve in web:

Run: `pnpm --filter @quran-corpus/data build`

- [ ] **Step 2: Write the failing helper test** — `apps/web/src/test/dictionaryLetters.test.ts`:

```tsx
import { describe, it, expect } from 'vitest';
import { letterCounts } from '../app/dictionary/letters';
import type { Root } from '@quran-corpus/data';

const root = (id: number, ar: string): Root => ({
  id,
  root_buckwalter: 'x',
  root_arabic: ar,
  occurrence_count: 1,
});

describe('letterCounts', () => {
  it('buckets roots by folded first letter', () => {
    const c = letterCounts([root(1, 'ب أ ر'), root(2, 'ب ت ر'), root(3, 'أ ك ل')]);
    expect(c['ب']).toBe(2);
    expect(c['ا']).toBe(1); // أ folds to ا
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @quran-corpus/web test -- dictionaryLetters`
Expected: FAIL — module `letters` not found.

- [ ] **Step 4: Implement the helper** — `apps/web/src/app/dictionary/letters.ts`:

```ts
import { rootFirstLetter, type Root } from '@quran-corpus/data';

/** Count roots per folded first Arabic letter, for the alphabet grid. */
export function letterCounts(roots: Root[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of roots) {
    const l = rootFirstLetter(r.root_arabic);
    if (l) counts[l] = (counts[l] ?? 0) + 1;
  }
  return counts;
}
```

- [ ] **Step 5: Run helper test** → PASS

Run: `pnpm --filter @quran-corpus/web test -- dictionaryLetters`

- [ ] **Step 6: Write the failing grid test** — `apps/web/src/test/AlphabetGrid.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AlphabetGrid } from '../components/dictionary/AlphabetGrid';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('AlphabetGrid', () => {
  it('present letters link to ?letter=; empty letters are disabled', () => {
    render(<AlphabetGrid counts={{ ب: 3 }} />);
    expect(screen.getByRole('link', { name: 'ب' })).toHaveAttribute(
      'href',
      '/dictionary?letter=%D8%A8',
    );
    expect(screen.queryByRole('link', { name: 'ء' })).toBeNull();
    expect(screen.getByText('ء')).toHaveAttribute('aria-disabled', 'true');
  });
  it('active letter links back to /dictionary with aria-current', () => {
    render(<AlphabetGrid counts={{ ب: 3 }} activeLetter="ب" />);
    const b = screen.getByRole('link', { name: 'ب' });
    expect(b).toHaveAttribute('href', '/dictionary');
    expect(b).toHaveAttribute('aria-current', 'true');
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `pnpm --filter @quran-corpus/web test -- AlphabetGrid`
Expected: FAIL — component not found.

- [ ] **Step 8: Implement the grid** — `apps/web/src/components/dictionary/AlphabetGrid.tsx`:

```tsx
import Link from 'next/link';
import { ARABIC_ALPHABET_ORDER } from '@quran-corpus/data';

interface AlphabetGridProps {
  counts: Record<string, number>;
  activeLetter?: string;
}

const base =
  'flex h-9 w-9 items-center justify-center rounded-md font-arabic text-lg transition-colors';
const active = 'bg-accent-500 text-paper-50';
const idle =
  'bg-paper-200 text-paper-800 hover:bg-paper-300 dark:bg-night-100 dark:text-paper-200 dark:hover:bg-night-200';
const off = 'cursor-default bg-paper-100 text-paper-300 dark:bg-night-50 dark:text-paper-600';

/**
 * Arabic letter picker. Present letters link to `?letter=X`; the active one
 * links back to `/dictionary` (clear). Empty letters render disabled. Pure
 * server component — navigation is plain links.
 */
export function AlphabetGrid({ counts, activeLetter }: AlphabetGridProps) {
  return (
    <nav dir="rtl" aria-label="Filter roots by letter" className="mb-6 flex flex-wrap gap-1.5">
      {ARABIC_ALPHABET_ORDER.map((letter) => {
        const has = (counts[letter] ?? 0) > 0;
        if (!has) {
          return (
            <span key={letter} aria-disabled="true" className={`${base} ${off}`}>
              {letter}
            </span>
          );
        }
        const isActive = letter === activeLetter;
        return (
          <Link
            key={letter}
            href={isActive ? '/dictionary' : `/dictionary?letter=${encodeURIComponent(letter)}`}
            {...(isActive ? { 'aria-current': 'true' as const } : {})}
            className={`${base} ${isActive ? active : idle}`}
          >
            {letter}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 9: Run grid test** → PASS

Run: `pnpm --filter @quran-corpus/web test -- AlphabetGrid`

- [ ] **Step 10: Wire into the page** — replace `apps/web/src/app/dictionary/page.tsx` with:

```tsx
export const dynamic = 'force-dynamic';

import { getAllRoots, getRootsByFrequency, searchRoots, rootFirstLetter } from '@quran-corpus/data';
import { getDatabase } from '../../lib/db';
import { DictionaryIndex } from '../../components/dictionary/DictionaryIndex';
import { AlphabetGrid } from '../../components/dictionary/AlphabetGrid';
import { letterCounts } from './letters';
import { parseSort } from './sort';

interface PageProps {
  searchParams: Promise<{ q?: string; sort?: string; letter?: string }>;
}

export default async function DictionaryPage({ searchParams }: PageProps) {
  const { q, sort: rawSort, letter } = await searchParams;
  const sort = parseSort(rawSort);
  const db = await getDatabase();
  const query = q?.trim();

  const allRoots = await getAllRoots(db);
  const counts = letterCounts(allRoots);

  const roots = letter
    ? allRoots.filter((r) => rootFirstLetter(r.root_arabic) === letter)
    : query
      ? await searchRoots(db, query)
      : sort === 'freq'
        ? await getRootsByFrequency(db)
        : allRoots;

  const effectiveSort = letter ? 'alpha' : sort;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-paper-900 dark:text-paper-100">
        Quranic Dictionary
      </h1>
      <AlphabetGrid counts={counts} {...(letter ? { activeLetter: letter } : {})} />
      <DictionaryIndex
        roots={roots}
        sort={effectiveSort}
        {...(query && !letter ? { query } : {})}
      />
    </main>
  );
}
```

- [ ] **Step 11: Full web checks**

Run: `pnpm --filter @quran-corpus/web test` → all PASS
Run: `pnpm --filter @quran-corpus/web lint` → clean
Run: `pnpm --filter @quran-corpus/web type-check` → clean

- [ ] **Step 12: Commit**

```bash
git add apps/web/src/app/dictionary/letters.ts apps/web/src/components/dictionary/AlphabetGrid.tsx apps/web/src/app/dictionary/page.tsx apps/web/src/test/dictionaryLetters.test.ts apps/web/src/test/AlphabetGrid.test.tsx
git commit -m "feat(web/dictionary): Arabic alphabet picker"
```

---

### Task 4: Concordance highlight + pagination (web + config)

Add the `accent` token; render each concordance verse from `verse_words` with the matched word washed; paginate long lists via `useIncrementalReveal`.

**Files:**
- Modify: `packages/config/tailwind/preset.ts` (add `accent` ramp)
- Modify: `apps/web/src/components/dictionary/ConcordanceList.tsx` (→ client)
- Modify: `apps/web/src/test/ConcordanceList.test.tsx`
- Modify: `apps/web/src/test/concordance.test.tsx` (fixture: `verse_text` → `verse_words`)
- Reuse: `apps/web/src/hooks/useIncrementalReveal.ts` (unchanged)

**Interfaces:**
- Consumes: `ConcordanceEntry.verse_words` (Task 2), `useIncrementalReveal(total, initial, step)`, `verseRef`/`concordanceHref` (`lib/concordance.ts`, unchanged — use surah/ayah/position).
- Produces: `<ConcordanceList entries={ConcordanceEntry[]} />` (now a client component).

- [ ] **Step 1: Add the accent token** — in `packages/config/tailwind/preset.ts`, inside `colors`, after the `night` block, add:

```ts
        accent: {
          50: '#fdf3ee',
          100: '#f8e0d1',
          200: '#eec0a3',
          300: '#e19d74',
          400: '#d17a48',
          500: '#bd5f30',
          600: '#9c4d27',
          700: '#7a3d20',
          800: '#572c18',
          900: '#351a0e',
        },
```

- [ ] **Step 2: Update the lib fixture** — in `apps/web/src/test/concordance.test.tsx`, change the fixture field `verse_text: '...'` to `verse_words: []` (that test only exercises `verseRef`/`concordanceHref`, which read surah/ayah/position).

- [ ] **Step 3: Write the failing component test** — replace `apps/web/src/test/ConcordanceList.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ConcordanceEntry } from '@quran-corpus/data';

class MockIO {
  static instances: MockIO[] = [];
  cb: (e: { isIntersecting: boolean }[]) => void;
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(cb: (e: { isIntersecting: boolean }[]) => void) {
    this.cb = cb;
    MockIO.instances.push(this);
  }
}
vi.stubGlobal('IntersectionObserver', MockIO);
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const { ConcordanceList } = await import('../components/dictionary/ConcordanceList');

const entry = (word_id: number, ayah_number: number): ConcordanceEntry => ({
  surah_id: 2,
  ayah_number,
  position: 2,
  word_id,
  text_arabic: 'HEAD',
  transliteration: null,
  gloss: null,
  verse_words: [
    { id: 100, position: 1, text_arabic: 'alpha' },
    { id: word_id, position: 2, text_arabic: 'beta' },
    { id: 300, position: 3, text_arabic: 'gamma' },
  ],
});

describe('ConcordanceList', () => {
  beforeEach(() => {
    MockIO.instances = [];
  });

  it('empty -> No occurrences', () => {
    render(<ConcordanceList entries={[]} />);
    expect(screen.getByText(/No occurrences/)).toBeInTheDocument();
  });

  it('washes only the matched word', () => {
    const { container } = render(<ConcordanceList entries={[entry(200, 5)]} />);
    const marks = container.querySelectorAll('.text-accent-700');
    expect(marks).toHaveLength(1);
    expect(marks[0]!.textContent).toBe('beta');
  });

  it('<=40 entries: renders all, no Load more', () => {
    const items = Array.from({ length: 5 }, (_, i) => entry(200 + i, i + 1));
    const { container } = render(<ConcordanceList entries={items} />);
    expect(container.querySelectorAll('li').length).toBe(5);
    expect(screen.queryByRole('button', { name: /load more/i })).toBeNull();
  });

  it('>40 entries: renders 20, Load more reveals +20', () => {
    const items = Array.from({ length: 60 }, (_, i) => entry(1000 + i, i + 1));
    const { container } = render(<ConcordanceList entries={items} />);
    expect(container.querySelectorAll('li').length).toBe(20);
    fireEvent.click(screen.getByRole('button', { name: /load more/i }));
    expect(container.querySelectorAll('li').length).toBe(40);
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm --filter @quran-corpus/web test -- ConcordanceList`
Expected: FAIL — old component renders `verse_text`, no `.text-accent-700`, no Load more.

- [ ] **Step 5: Rewrite the component** — replace `apps/web/src/components/dictionary/ConcordanceList.tsx` with:

```tsx
'use client';

import Link from 'next/link';
import type { ConcordanceEntry } from '@quran-corpus/data';
import { verseRef, concordanceHref } from '../../lib/concordance';
import { useIncrementalReveal } from '../../hooks/useIncrementalReveal';

// Reuse the 08c reveal tuning: long concordances mount INITIAL, reveal STEP.
const THRESHOLD = 40;
const INITIAL = 20;
const STEP = 20;

const wash =
  'rounded-md bg-accent-100 px-1 font-semibold text-accent-700 dark:bg-accent-900/40 dark:text-accent-300';

interface ConcordanceListProps {
  entries: ConcordanceEntry[];
}

/** Occurrence list: verse-ref link, matched form/translit/gloss, and the verse
 * rebuilt word-by-word from `verse_words` with the matched word washed. Long
 * lists reveal incrementally (reuses useIncrementalReveal). */
export function ConcordanceList({ entries }: ConcordanceListProps) {
  const paginate = entries.length > THRESHOLD;
  const { visibleCount, sentinelRef, done, revealTo } = useIncrementalReveal<HTMLButtonElement>(
    entries.length,
    INITIAL,
    STEP,
  );

  if (entries.length === 0) {
    return <p className="px-4 py-6 text-center text-paper-500">No occurrences.</p>;
  }

  const visible = paginate ? entries.slice(0, visibleCount) : entries;
  return (
    <>
      <ul className="divide-y divide-paper-200 dark:divide-night-100">
        {visible.map((e) => (
          <li key={e.word_id} className="py-3">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <Link
                href={concordanceHref(e)}
                className="text-sm font-medium text-paper-600 underline-offset-2 hover:underline dark:text-paper-400"
              >
                {verseRef(e)}
              </Link>
              <span className="flex items-baseline gap-2">
                <span dir="rtl" className="font-arabic text-lg text-paper-900 dark:text-paper-100">
                  {e.text_arabic}
                </span>
                {e.transliteration && (
                  <span className="text-xs text-paper-500">{e.transliteration}</span>
                )}
              </span>
            </div>
            {e.gloss && (
              <p className="mb-1 text-sm text-paper-700 dark:text-paper-300">{e.gloss}</p>
            )}
            <p
              dir="rtl"
              className="font-arabic text-lg leading-loose text-paper-800 dark:text-paper-200"
            >
              {e.verse_words.map((w, i) => (
                <span key={w.id}>
                  {i > 0 && ' '}
                  <span className={w.id === e.word_id ? wash : undefined}>{w.text_arabic}</span>
                </span>
              ))}
            </p>
          </li>
        ))}
      </ul>
      {paginate && !done && (
        <button
          ref={sentinelRef}
          type="button"
          onClick={() => revealTo(visibleCount + STEP)}
          className="mx-auto mt-4 block rounded-full bg-paper-200 px-6 py-2 text-sm text-paper-700 transition-colors hover:bg-paper-300 dark:bg-night-100 dark:text-paper-300 dark:hover:bg-night-200"
        >
          Load more
        </button>
      )}
    </>
  );
}
```

- [ ] **Step 6: Run component test** → PASS

Run: `pnpm --filter @quran-corpus/web test -- ConcordanceList`

- [ ] **Step 7: Full web checks (all suites, lint, types)**

Run: `pnpm --filter @quran-corpus/web test` → all PASS (incl. `concordance`, `RootEntry`)
Run: `pnpm --filter @quran-corpus/web lint` → clean
Run: `pnpm --filter @quran-corpus/web type-check` → clean

- [ ] **Step 8: Commit**

```bash
git add packages/config/tailwind/preset.ts apps/web/src/components/dictionary/ConcordanceList.tsx apps/web/src/test/ConcordanceList.test.tsx apps/web/src/test/concordance.test.tsx
git commit -m "feat(web/dictionary): highlight matched word in concordance + paginate"
```

---

## Final verification (whole branch)

- [ ] `pnpm --filter @quran-corpus/data build`
- [ ] `pnpm --filter @quran-corpus/data test` → all PASS
- [ ] `pnpm --filter @quran-corpus/web test` → all PASS
- [ ] `pnpm --filter @quran-corpus/web lint && pnpm --filter @quran-corpus/web type-check` → clean
- [ ] Grep confirms no stray `verse_text` remains: `grep -rn "verse_text" apps/web/src packages/data/src` → no hits.
- [ ] Manual smoke (optional): `/dictionary` shows the letter grid; `?letter=ب` filters + marks active; a root page washes the matched word and paginates a long concordance.

## Self-Review Notes (author)

- **Spec coverage:** picker mechanism (Task 3), rootFirstLetter + empty-letter disable (Tasks 1, 3), option-C concordance (Task 2), soft-wash + accent token (Task 4), 20/20 pagination reuse (Task 4), all-modes grid visibility (Task 3 page). ✓
- **Type consistency:** `VerseWord`/`verse_words` defined in Task 2, consumed in Task 4; `rootFirstLetter` defined Task 1, consumed Tasks 3; `letterCounts`/`AlphabetGrid` defined + consumed within Task 3. ✓
- **Sort toggle clears letter:** `DictionaryIndex` sort links omit `letter`, so switching Alphabetical/By-frequency drops the filter — intended (spec §out-of-scope: sort behavior unchanged beyond grid presence).
