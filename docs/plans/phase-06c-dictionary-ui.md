# Phase 06c — Quranic Dictionary UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Quranic Dictionary UI over the 06a data layer: by-root entry (Lane's definition + derived forms + full concordance), browse alphabetical + by frequency, search by root/meaning, plus Verb Concordance and Lemma Frequency tools.

**Architecture:** Server Components read `packages/data` directly (no HTTP hop, PRD §7). Routes: `/dictionary` (index: browse + search), `/dictionary/[root]` (root entry, `[root]` = Buckwalter), `/dictionary/lemma-frequency`, `/dictionary/verb-concordance`. Search is server-rendered via `?q=` (no client fetch). Reuse `paper-*/night-*` tokens + `MorphologySummary` conventions; mixed RTL/LTR for Arabic forms + Latin translit. Lane's definitions are additive — UI never gates on them.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind, Framer Motion, vitest + @testing-library/react.

## Global Constraints

- Depends on **06a merged** (queries: `getAllRoots`, `getRootsByFrequency`, `searchRoots`, `getRootEntry`, `getRootConcordance`, `getLemmaFrequency`, `getVerbConcordance`; types `Root`, `RootForm`, `RootDefinition`, `RootEntry`, `ConcordanceEntry`, `LemmaFrequencyEntry`, `VerbConcordanceEntry`). Depends on **06b** for the word-detail link target (concordance rows link to `/word/s/a/p`).
- Design: WCAG AA, `prefers-reduced-motion`, 60fps, distinctive typography, elegant RTL/LTR, no AI-slop (CLAUDE.md §8).
- DRY: shared list-row + Arabic-form rendering extracted; no duplication across the four routes.
- Server Components use `getDatabase()`; DB pages `export const dynamic = 'force-dynamic'`.
- `[root]` param = Buckwalter (URL-safe ASCII). Concordance verse-ref links reuse 06b `wordHref`.
- Conventional Commits, TDD, one logical change per commit. Component tests mock `next/link` + (where used) `framer-motion`.

## Risks / Rollback

- **Large lists:** all-roots (~1600) and full concordance (some roots >300 occurrences) — paginate/cap. Index: alphabetical grouped by first Buckwalter letter; frequency capped (`getRootsByFrequency` limit). Concordance: render all for a root (bounded ≤~600) but virtualize only if a perf issue is measured (ponytail — don't pre-optimize).
- **Empty Lane's layer:** if `root_definitions` empty, the definition block is simply omitted. Not a blocker.
- **Rollback:** additive routes/components; remove `app/dictionary/**` + dictionary components to revert. Reader + word-detail unaffected.

## File Structure

- `apps/web/src/lib/concordance.ts` — CREATE: `ConcordanceEntry` → verse-ref string + href (reuses `wordHref`).
- `apps/web/src/components/dictionary/RootListRow.tsx` — CREATE: shared root list row (Arabic + translit + count).
- `apps/web/src/components/dictionary/DictionarySearch.tsx` — CREATE: search form (client, submits `?q=`).
- `apps/web/src/components/dictionary/DictionaryIndex.tsx` — CREATE: browse (alphabetical/frequency toggle) + results.
- `apps/web/src/components/dictionary/RootEntry.tsx` — CREATE: root header + Lane's def + form groups + concordance.
- `apps/web/src/components/dictionary/FormGroup.tsx` — CREATE: one derived-form group.
- `apps/web/src/components/dictionary/ConcordanceList.tsx` — CREATE: occurrence list.
- `apps/web/src/app/dictionary/page.tsx` — CREATE: index route (browse + search via `?q=`,`?sort=`).
- `apps/web/src/app/dictionary/[root]/page.tsx` — CREATE: root entry route.
- `apps/web/src/app/dictionary/lemma-frequency/page.tsx` — CREATE.
- `apps/web/src/app/dictionary/verb-concordance/page.tsx` — CREATE.
- Tests under `apps/web/src/test/`: `concordance`, `RootListRow`, `DictionarySearch`, `DictionaryIndex`, `RootEntry`, `FormGroup`, `ConcordanceList`, `dictionaryIndexPage` (param parsing).

---

### Task 1: Concordance ref helper (pure)

**Files:**
- Create: `apps/web/src/lib/concordance.ts`, `apps/web/src/test/concordance.test.tsx`

**Interfaces:**
- Consumes: `ConcordanceEntry`, `wordHref` (06b).
- Produces: `verseRef(e:ConcordanceEntry)->string` = `${surah_id}:${ayah_number}:${position}`; `concordanceHref(e)->string` = `/word/${surah_id}/${ayah_number}/${position}`.

- [ ] **Step 1: Failing test** — `concordance.test.tsx`:

```ts
import { describe, it, expect } from 'vitest';
import { verseRef, concordanceHref } from '../lib/concordance';
import type { ConcordanceEntry } from '@quran-corpus/data';

const e = { surah_id: 2, ayah_number: 79, position: 3, word_id: 5,
  text_arabic: 'يَكْتُبُونَ', transliteration: 'yaktubūna', gloss: 'they write',
  verse_text: '...' } as ConcordanceEntry;

describe('concordance helpers', () => {
  it('verseRef', () => expect(verseRef(e)).toBe('2:79:3'));
  it('concordanceHref', () => expect(concordanceHref(e)).toBe('/word/2/79/3'));
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @quran-corpus/web test -- concordance`
Expected: FAIL.

- [ ] **Step 3: Implement** — `concordance.ts`:

```ts
import type { ConcordanceEntry } from '@quran-corpus/data';
import { wordHref } from './wordLocation';

export const verseRef = (e: ConcordanceEntry): string =>
  `${e.surah_id}:${e.ayah_number}:${e.position}`;

export const concordanceHref = (e: ConcordanceEntry): string =>
  wordHref({ surah: e.surah_id, ayah: e.ayah_number, position: e.position });
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter @quran-corpus/web test -- concordance`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/concordance.ts apps/web/src/test/concordance.test.tsx
git commit -m "feat(web): add concordance ref/href helpers"
```

---

### Task 2: `RootListRow` shared component

**Files:**
- Create: `apps/web/src/components/dictionary/RootListRow.tsx`, `apps/web/src/test/RootListRow.test.tsx`

**Interfaces:**
- Consumes: `Root`.
- Produces: `<RootListRow root={Root} />` — a `next/link` to `/dictionary/${root_buckwalter}` showing Arabic root (`font-arabic`, dir="rtl"), Buckwalter, and occurrence count. Reused by index, search results, frequency list.

- [ ] **Step 1: Failing test** — `RootListRow.test.tsx` (mock `next/link`):

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RootListRow } from '../components/dictionary/RootListRow';
import type { Root } from '@quran-corpus/data';

vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

const root: Root = { id: 1, root_buckwalter: 'ktb', root_arabic: 'ك ت ب', occurrence_count: 319 };

describe('RootListRow', () => {
  it('links to the root entry', () => {
    render(<RootListRow root={root} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/dictionary/ktb');
  });
  it('shows Arabic root and count', () => {
    render(<RootListRow root={root} />);
    expect(screen.getByText('ك ت ب')).toBeInTheDocument();
    expect(screen.getByText(/319/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @quran-corpus/web test -- RootListRow`
Expected: FAIL.

- [ ] **Step 3: Implement** — `RootListRow.tsx`: `<Link href={/dictionary/${root.root_buckwalter}}>` styled row (`flex items-center justify-between rounded-lg px-4 py-3 hover:bg-paper-200 dark:hover:bg-night-100`), Arabic `font-arabic text-2xl dir=rtl`, Buckwalter muted, count badge.

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter @quran-corpus/web test -- RootListRow`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/dictionary/RootListRow.tsx apps/web/src/test/RootListRow.test.tsx
git commit -m "feat(web/dictionary): add RootListRow"
```

---

### Task 3: `DictionarySearch` component

**Files:**
- Create: `apps/web/src/components/dictionary/DictionarySearch.tsx`, `apps/web/src/test/DictionarySearch.test.tsx`

**Interfaces:**
- Produces: `<DictionarySearch defaultValue?={string} />` — a client `<form method="get" action="/dictionary">` with a text `<input name="q">` and submit; navigates to `/dictionary?q=...`. Accessible label.

- [ ] **Step 1: Failing test** — `DictionarySearch.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DictionarySearch } from '../components/dictionary/DictionarySearch';

describe('DictionarySearch', () => {
  it('renders a labelled search input', () => {
    render(<DictionarySearch />);
    expect(screen.getByRole('searchbox', { name: /search/i })).toBeInTheDocument();
  });
  it('submits to /dictionary via GET', () => {
    render(<DictionarySearch />);
    const form = screen.getByRole('search');
    expect(form).toHaveAttribute('action', '/dictionary');
  });
  it('prefills defaultValue', () => {
    render(<DictionarySearch defaultValue="ktb" />);
    expect(screen.getByRole('searchbox')).toHaveValue('ktb');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @quran-corpus/web test -- DictionarySearch`
Expected: FAIL.

- [ ] **Step 3: Implement** — `DictionarySearch.tsx` (`'use client'` optional; a plain GET form needs no JS — prefer no client directive for simplicity/perf, ponytail). `<form role="search" action="/dictionary" method="get">` with `<input type="search" name="q" aria-label="Search roots or meaning" defaultValue=... role auto=searchbox>` + submit button. Style with tokens.

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter @quran-corpus/web test -- DictionarySearch`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/dictionary/DictionarySearch.tsx apps/web/src/test/DictionarySearch.test.tsx
git commit -m "feat(web/dictionary): add search form"
```

---

### Task 4: `DictionaryIndex` component

**Files:**
- Create: `apps/web/src/components/dictionary/DictionaryIndex.tsx`, `apps/web/src/test/DictionaryIndex.test.tsx`

**Interfaces:**
- Consumes: `Root[]`, `DictionarySearch`, `RootListRow`.
- Produces: `<DictionaryIndex roots={Root[]} sort={'alpha'|'freq'} query?={string} />` — renders search, an alpha/freq toggle (links `?sort=alpha` / `?sort=freq`), tool links (Lemma Frequency, Verb Concordance), and the root rows. When `query` set, header reads "Results for …".

- [ ] **Step 1: Failing test** — `DictionaryIndex.test.tsx` (mock `next/link`):

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DictionaryIndex } from '../components/dictionary/DictionaryIndex';
import type { Root } from '@quran-corpus/data';

vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

const roots: Root[] = [
  { id: 1, root_buckwalter: 'ktb', root_arabic: 'ك ت ب', occurrence_count: 319 },
  { id: 2, root_buckwalter: 'smw', root_arabic: 'س م و', occurrence_count: 5 },
];

describe('DictionaryIndex', () => {
  it('renders a row per root', () => {
    render(<DictionaryIndex roots={roots} sort="alpha" />);
    expect(screen.getAllByRole('link').filter((l) => l.getAttribute('href')?.startsWith('/dictionary/'))).toHaveLength(2);
  });
  it('links to the frequency + verb-concordance tools', () => {
    render(<DictionaryIndex roots={roots} sort="alpha" />);
    expect(screen.getByRole('link', { name: /lemma frequency/i })).toHaveAttribute('href', '/dictionary/lemma-frequency');
    expect(screen.getByRole('link', { name: /verb concordance/i })).toHaveAttribute('href', '/dictionary/verb-concordance');
  });
  it('shows results header when query set', () => {
    render(<DictionaryIndex roots={roots} sort="alpha" query="ktb" />);
    expect(screen.getByText(/results for/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @quran-corpus/web test -- DictionaryIndex`
Expected: FAIL.

- [ ] **Step 3: Implement** — `DictionaryIndex.tsx`: `<DictionarySearch defaultValue={query} />`; toggle links (`/dictionary?sort=alpha` / `?sort=freq`) with active styling; a row of tool `<Link>`s to `/dictionary/lemma-frequency` + `/dictionary/verb-concordance`; conditional "Results for {query}" header; `roots.map(r => <RootListRow key={r.id} root={r} />)`; empty-state text when none.

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter @quran-corpus/web test -- DictionaryIndex`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/dictionary/DictionaryIndex.tsx apps/web/src/test/DictionaryIndex.test.tsx
git commit -m "feat(web/dictionary): add index/browse component"
```

---

### Task 5: Index route `/dictionary`

**Files:**
- Create: `apps/web/src/app/dictionary/page.tsx`, `apps/web/src/test/dictionaryIndexPage.test.tsx`

**Interfaces:**
- Consumes: `getDatabase`, `getAllRoots`, `getRootsByFrequency`, `searchRoots`, `DictionaryIndex`.
- Produces: server page reading `searchParams` `{q?, sort?}`. If `q` → `searchRoots`; else `sort==='freq'` → `getRootsByFrequency`, default `getAllRoots`. Exports pure `parseSort(v)->'alpha'|'freq'`.

- [ ] **Step 1: Failing test** — `dictionaryIndexPage.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { parseSort } from '../app/dictionary/page';

describe('parseSort', () => {
  it("defaults to alpha", () => expect(parseSort(undefined)).toBe('alpha'));
  it("accepts freq", () => expect(parseSort('freq')).toBe('freq'));
  it("rejects junk -> alpha", () => expect(parseSort('xyz')).toBe('alpha'));
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @quran-corpus/web test -- dictionaryIndexPage`
Expected: FAIL.

- [ ] **Step 3: Implement** — `page.tsx`:

```tsx
export const dynamic = 'force-dynamic';

import { getDatabase } from '../../lib/db';
import { getAllRoots, getRootsByFrequency, searchRoots } from '@quran-corpus/data';
import { DictionaryIndex } from '../../components/dictionary/DictionaryIndex';

export function parseSort(v: string | undefined): 'alpha' | 'freq' {
  return v === 'freq' ? 'freq' : 'alpha';
}

interface PageProps { searchParams: Promise<{ q?: string; sort?: string }>; }

export default async function DictionaryPage({ searchParams }: PageProps) {
  const { q, sort: rawSort } = await searchParams;
  const sort = parseSort(rawSort);
  const db = await getDatabase();
  const query = q?.trim();
  const roots = query
    ? await searchRoots(db, query)
    : sort === 'freq'
      ? await getRootsByFrequency(db)
      : await getAllRoots(db);
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-paper-900 dark:text-paper-100">Quranic Dictionary</h1>
      <DictionaryIndex roots={roots} sort={sort} {...(query ? { query } : {})} />
    </main>
  );
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter @quran-corpus/web test -- dictionaryIndexPage && pnpm --filter @quran-corpus/web type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dictionary/page.tsx apps/web/src/test/dictionaryIndexPage.test.tsx
git commit -m "feat(web/dictionary): add index route with browse + search"
```

---

### Task 6: `FormGroup` + `ConcordanceList` components

**Files:**
- Create: `apps/web/src/components/dictionary/FormGroup.tsx`, `apps/web/src/components/dictionary/ConcordanceList.tsx`
- Test: `apps/web/src/test/FormGroup.test.tsx`, `apps/web/src/test/ConcordanceList.test.tsx`

**Interfaces:**
- Produces: `<FormGroup form={RootForm} />` — POS label, Arabic form (`font-arabic`), translit, gloss, count. `<ConcordanceList entries={ConcordanceEntry[]} />` — each row: verse-ref link (`concordanceHref`), Arabic form, translit, gloss, full verse text (`dir=rtl font-arabic`).

- [ ] **Step 1: Failing tests** — `FormGroup.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormGroup } from '../components/dictionary/FormGroup';
import type { RootForm } from '@quran-corpus/data';

const form: RootForm = { id: 1, root_id: 1, sort_order: 0, pos_label: 'Noun',
  form_arabic: 'كِتَٰب', form_translit: 'kitāb', gloss: 'book', occurrence_count: 260 };

describe('FormGroup', () => {
  it('renders pos label, form, count', () => {
    render(<FormGroup form={form} />);
    expect(screen.getByText('Noun')).toBeInTheDocument();
    expect(screen.getByText('كِتَٰب')).toBeInTheDocument();
    expect(screen.getByText(/260/)).toBeInTheDocument();
  });
});
```

`ConcordanceList.test.tsx` (mock `next/link`):

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConcordanceList } from '../components/dictionary/ConcordanceList';
import type { ConcordanceEntry } from '@quran-corpus/data';

vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

const entries: ConcordanceEntry[] = [
  { surah_id: 2, ayah_number: 79, position: 3, word_id: 5, text_arabic: 'يَكْتُبُونَ',
    transliteration: 'yaktubūna', gloss: 'they write', verse_text: 'فَوَيْلٌ ...' },
];

describe('ConcordanceList', () => {
  it('renders a ref link per entry', () => {
    render(<ConcordanceList entries={entries} />);
    expect(screen.getByRole('link', { name: /2:79:3/ })).toHaveAttribute('href', '/word/2/79/3');
  });
  it('renders gloss + arabic form', () => {
    render(<ConcordanceList entries={entries} />);
    expect(screen.getByText('they write')).toBeInTheDocument();
    expect(screen.getByText('يَكْتُبُونَ')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @quran-corpus/web test -- FormGroup ConcordanceList`
Expected: FAIL.

- [ ] **Step 3: Implement** — both components with tokens; `ConcordanceList` uses `concordanceHref`/`verseRef` from Task 1. Guard empty arrays.

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter @quran-corpus/web test -- FormGroup ConcordanceList`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/dictionary/FormGroup.tsx apps/web/src/components/dictionary/ConcordanceList.tsx apps/web/src/test/FormGroup.test.tsx apps/web/src/test/ConcordanceList.test.tsx
git commit -m "feat(web/dictionary): add FormGroup + ConcordanceList"
```

---

### Task 7: `RootEntry` component

**Files:**
- Create: `apps/web/src/components/dictionary/RootEntry.tsx`, `apps/web/src/test/RootEntry.test.tsx`

**Interfaces:**
- Consumes: `RootEntry` type (`{root, forms, definitions}`), `ConcordanceEntry[]`, `FormGroup`, `ConcordanceList`.
- Produces: `<RootEntry entry={RootEntry} concordance={ConcordanceEntry[]} />` — header (Arabic root, Buckwalter, "occurs N times"), Lane's definition block (only when `definitions` non-empty, with source attribution), form groups, concordance section with count.

- [ ] **Step 1: Failing test** — `RootEntry.test.tsx` (mock `next/link`):

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RootEntry } from '../components/dictionary/RootEntry';
import type { RootEntry as RootEntryT, ConcordanceEntry } from '@quran-corpus/data';

vi.mock('next/link', () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

const entry: RootEntryT = {
  root: { id: 1, root_buckwalter: 'ktb', root_arabic: 'ك ت ب', occurrence_count: 319 },
  forms: [{ id: 1, root_id: 1, sort_order: 0, pos_label: 'Noun', form_arabic: 'كِتَٰب', form_translit: 'kitāb', gloss: 'book', occurrence_count: 260 }],
  definitions: [{ id: 1, root_id: 1, source: 'lane', definition: "To write; to prescribe." }],
};
const concordance: ConcordanceEntry[] = [];

describe('RootEntry', () => {
  it('renders occurrence count', () => {
    render(<RootEntry entry={entry} concordance={concordance} />);
    expect(screen.getByText(/319/)).toBeInTheDocument();
  });
  it("renders Lane's definition with attribution", () => {
    render(<RootEntry entry={entry} concordance={concordance} />);
    expect(screen.getByText(/To write/)).toBeInTheDocument();
    expect(screen.getByText(/lane/i)).toBeInTheDocument();
  });
  it('renders form groups', () => {
    render(<RootEntry entry={entry} concordance={concordance} />);
    expect(screen.getByText('Noun')).toBeInTheDocument();
  });
  it('omits definition block when none', () => {
    render(<RootEntry entry={{ ...entry, definitions: [] }} concordance={concordance} />);
    expect(screen.queryByText(/To write/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @quran-corpus/web test -- RootEntry`
Expected: FAIL.

- [ ] **Step 3: Implement** — `RootEntry.tsx`: header with `font-arabic` root + `occurs {count} times`; when `definitions.length`, a definition card per source with a small "Lane's Lexicon" attribution label; `entry.forms.map(FormGroup)`; a "Concordance ({concordance.length})" section rendering `<ConcordanceList entries={concordance} />`.

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter @quran-corpus/web test -- RootEntry`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/dictionary/RootEntry.tsx apps/web/src/test/RootEntry.test.tsx
git commit -m "feat(web/dictionary): add RootEntry component"
```

---

### Task 8: Root entry route `/dictionary/[root]`

**Files:**
- Create: `apps/web/src/app/dictionary/[root]/page.tsx`
- Test: covered by component tests + type-check (route is thin data-assembly).

**Interfaces:**
- Consumes: `getDatabase`, `getRootEntry`, `getRootConcordance`, `RootEntry`.
- Produces: server page. `[root]` = Buckwalter. `getRootEntry` → `notFound()` if null; `getRootConcordance` for the list. `export const dynamic = 'force-dynamic'`.

- [ ] **Step 1: Implement** — `page.tsx`:

```tsx
export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { getDatabase } from '../../../lib/db';
import { getRootEntry, getRootConcordance } from '@quran-corpus/data';
import { RootEntry } from '../../../components/dictionary/RootEntry';

interface PageProps { params: Promise<{ root: string }>; }

export default async function RootPage({ params }: PageProps) {
  const { root } = await params;
  const bw = decodeURIComponent(root);
  const db = await getDatabase();
  const entry = await getRootEntry(db, bw);
  if (!entry) notFound();
  const concordance = await getRootConcordance(db, bw);
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <RootEntry entry={entry} concordance={concordance} />
    </main>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm --filter @quran-corpus/web type-check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/dictionary/[root]/page.tsx"
git commit -m "feat(web/dictionary): add root entry route"
```

---

### Task 9: Lemma Frequency + Verb Concordance routes

**Files:**
- Create: `apps/web/src/app/dictionary/lemma-frequency/page.tsx`, `apps/web/src/app/dictionary/verb-concordance/page.tsx`
- Create: `apps/web/src/components/dictionary/FrequencyTable.tsx`, `apps/web/src/test/FrequencyTable.test.tsx`

**Interfaces:**
- Consumes: `getLemmaFrequency`, `getVerbConcordance`, `LemmaFrequencyEntry`, `VerbConcordanceEntry`.
- Produces: `<FrequencyTable rows={{label:string, sub?:string, count:number}[]} caption={string} />` — a shared ranked table (rank, label Arabic-aware, count). Both routes map their query rows into this shape (DRY).

- [ ] **Step 1: Failing test** — `FrequencyTable.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FrequencyTable } from '../components/dictionary/FrequencyTable';

describe('FrequencyTable', () => {
  it('renders ranked rows with counts', () => {
    render(<FrequencyTable caption="Lemma Frequency" rows={[
      { label: 'ٱللَّه', count: 2699 }, { label: 'رَبّ', count: 970 },
    ]} />);
    expect(screen.getByText('ٱللَّه')).toBeInTheDocument();
    expect(screen.getByText(/2699/)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /lemma frequency/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @quran-corpus/web test -- FrequencyTable`
Expected: FAIL.

- [ ] **Step 3: Implement** — `FrequencyTable.tsx` (`<table aria-label={caption}>`, rank column, `font-arabic` label, count). Then the two routes:

`lemma-frequency/page.tsx`:
```tsx
export const dynamic = 'force-dynamic';
import { getDatabase } from '../../../lib/db';
import { getLemmaFrequency } from '@quran-corpus/data';
import { FrequencyTable } from '../../../components/dictionary/FrequencyTable';

export default async function LemmaFrequencyPage() {
  const db = await getDatabase();
  const rows = (await getLemmaFrequency(db)).map((r) => ({ label: r.lemma, count: r.count }));
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-paper-900 dark:text-paper-100">Lemma Frequency</h1>
      <FrequencyTable caption="Lemma Frequency" rows={rows} />
    </main>
  );
}
```

`verb-concordance/page.tsx`: analogous, `getVerbConcordance`, map `{label: r.form_arabic, sub: r.lemma ?? undefined, count: r.count}`, caption "Verb Concordance".

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter @quran-corpus/web test -- FrequencyTable && pnpm --filter @quran-corpus/web type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/dictionary/FrequencyTable.tsx apps/web/src/test/FrequencyTable.test.tsx apps/web/src/app/dictionary/lemma-frequency/page.tsx apps/web/src/app/dictionary/verb-concordance/page.tsx
git commit -m "feat(web/dictionary): add lemma-frequency + verb-concordance routes"
```

---

### Task 10: Cross-links + About/Credits attribution + full quality gate

**Files:**
- Modify: `apps/web/src/app/page.tsx` (or nav) — add a Dictionary entry link.
- Modify: `apps/web/src/app/about/page.tsx` — add corpus.quran.com (GPL, © Kais Dukes / Leeds) + Lane's Lexicon (public domain) attributions (PRD §10).
- Test: MODIFY `apps/web/src/test/*` if a nav/about test exists; else add a minimal about-content test.

- [ ] **Step 1: Failing test** — add/extend an about test asserting the new attributions render:

```tsx
it('credits corpus.quran.com and Lane\'s Lexicon', () => {
  render(<About />);
  expect(screen.getByText(/corpus\.quran\.com/i)).toBeInTheDocument();
  expect(screen.getByText(/Lane's Lexicon/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @quran-corpus/web test -- about`
Expected: FAIL.

- [ ] **Step 3: Implement** — add the attributions to `about/page.tsx` (GPL attribution + source link; Lane's public-domain note). Add a "Dictionary" `<Link href="/dictionary">` to the home/nav surface.

- [ ] **Step 4: Full gate**

Run:
```bash
pnpm --filter @quran-corpus/web lint
pnpm --filter @quran-corpus/web type-check
pnpm --filter @quran-corpus/web test
pnpm --filter @quran-corpus/data test
```
Expected: all PASS.

- [ ] **Step 5: Manual smoke + Greptile** — dev server: `/dictionary` browse (alpha/freq), search `ktb`, open `/dictionary/ktb` (forms + Lane's def + concordance links → word detail), `/dictionary/lemma-frequency`, `/dictionary/verb-concordance`. Verify RTL/LTR, AA contrast, reduced-motion. Run Greptile ≥4/5; fix findings; re-run.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/about/page.tsx apps/web/src/app/page.tsx apps/web/src/test/
git commit -m "feat(web): link dictionary + credit corpus/Lane sources"
```

---

## Self-Review (done)

- **Spec coverage (§2.2):** by-root entry w/ occurrence count + derived forms + counts (Tasks 6,7,8) ✓; full concordance w/ verse ref + form + gloss + verse text + word-detail link (Tasks 1,6,7,8) ✓; Lane's definitions additive (Task 7) ✓; browse alphabetical + by frequency (Tasks 4,5) ✓; search by root/meaning (Tasks 3,5) ✓; Verb Concordance + Lemma Frequency (Task 9) ✓; source attribution (Task 10, PRD §10) ✓.
- **Placeholders:** none — full code/commands per step. Route tasks without a component test rely on exported pure helpers (`parseSort`) + type-check + component coverage (honest, not a gap).
- **Type consistency:** `[root]`=Buckwalter everywhere; `RootEntry{root,forms,definitions}`, `ConcordanceEntry`, `concordanceHref`→`/word/s/a/p` (matches 06b route), tool hrefs `/dictionary/lemma-frequency`,`/dictionary/verb-concordance` consistent.

## Execution Handoff

Per CLAUDE.md §13 (Sonnet+ floor, compact between tasks): **Subagent-Driven** recommended, or **Inline**. Greptile ≥4/5 before each commit; final gate in Task 10. **This completes Phase 06** — after approval, compact at phase level (CLAUDE.md §13) before any Phase 07 work.
