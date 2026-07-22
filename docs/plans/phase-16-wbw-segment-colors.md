# Phase 16: WbW Segment Color-Coding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WbW page (card + list view) shows per-segment color-coded Arabic + short POS code beneath each segment, matching corpus.quran.com, reusing existing `posColor()`.

**Architecture:** New batched query `getSegmentsByWordIds` (packages/data) feeds `segments` onto `WbwCell`. New non-SVG `SegmentPills` component (sibling to `SegmentedWord`) renders the colored pills; wired into both `WbwWordCell` (card) and `WbwWordRow` (list), replacing the flat Arabic span + `posLabel` chip.

**Tech Stack:** Next.js/TS, libsql, Vitest + Testing Library.

## Global Constraints

- Reuse `posColor(posTag): string` (`apps/web/src/lib/posColor.ts`) as-is — no new color logic.
- `SegmentPills` is plain HTML/CSS, not SVG (rejected: too heavy per-cell in long list).
- No schema change. `word_segments` table already populated.
- Segment order = array order from `getSegmentsByWordIds` (`ORDER BY word_id, segment_index`) — same order `SegmentedWord` already consumes. Do not re-sort.
- Do not delete `posLabel` from `WbwCell` this phase (other consumers unconfirmed) — leave field, just stop rendering it in the two wired components.
- Spec: `docs/superpowers/specs/2026-07-22-wbw-segment-color-coding-design.md`.

---

## Task 1: `getSegmentsByWordIds` batched query

**Files:**
- Modify: `packages/data/src/queries/words.ts`
- Modify: `packages/data/src/index.ts`
- Test: `packages/data/tests/words.test.ts`

**Interfaces:**
- Produces: `getSegmentsByWordIds(db: Client, wordIds: number[]): Promise<WordSegment[]>`, exported from `@quran-corpus/data`.

- [ ] **Step 1: Write failing tests**

Append to `packages/data/tests/words.test.ts` (after the `getWordByLocation / getWordDetail` describe block, before final closing — add new `import` too):

```ts
// add to the existing import block at top of file:
import {
  getWordsByAyah,
  getWordsBySurah,
  getWordsBySurahAyahRange,
  getWordByLocation,
  getWordDetail,
  getSegmentsByWordIds,
} from '../src/queries/words.js';
```

```ts
describe('getSegmentsByWordIds', () => {
  it('returns empty array for empty input, without querying', async () => {
    expect(await getSegmentsByWordIds(db, [])).toEqual([]);
  });

  it('batches segments across multiple word ids, ordered by word then segment_index', async () => {
    const w1 = await getWordByLocation(db, 1, 1, 1);
    const w2 = await getWordByLocation(db, 1, 1, 2);
    await db.execute({
      sql: `INSERT INTO word_segments (word_id,segment_index,segment_type,pos_tag,form_arabic)
            VALUES (?,0,'prefix','P','بِ'),(?,1,'stem','N','سْمِ'),(?,0,'stem','PN','ٱللَّهِ')`,
      args: [w1!.id, w1!.id, w2!.id],
    });
    const segs = await getSegmentsByWordIds(db, [w1!.id, w2!.id]);
    expect(segs.filter((s) => s.word_id === w1!.id).map((s) => s.pos_tag)).toEqual(['P', 'N']);
    expect(segs.filter((s) => s.word_id === w2!.id).map((s) => s.pos_tag)).toEqual(['PN']);
  });

  it('returns empty array when no segments exist for the given ids', async () => {
    expect(await getSegmentsByWordIds(db, [999999])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests, verify fail**

Run: `cd packages/data && pnpm test -- words.test.ts`
Expected: FAIL — `getSegmentsByWordIds is not a function` (or import error).

- [ ] **Step 3: Implement**

In `packages/data/src/queries/words.ts`, append after `getWordDetail`:

```ts
export async function getSegmentsByWordIds(
  db: Client,
  wordIds: number[],
): Promise<WordSegment[]> {
  if (wordIds.length === 0) return [];
  const placeholders = wordIds.map(() => '?').join(',');
  const result = await db.execute({
    sql: `SELECT * FROM word_segments WHERE word_id IN (${placeholders}) ORDER BY word_id, segment_index`,
    args: wordIds,
  });
  return result.rows.map(rowToSegment);
}
```

In `packages/data/src/index.ts`, change:

```ts
export {
  getWordsByAyah,
  getWordsBySurah,
  getWordsBySurahAyahRange,
  getWordByLocation,
  getWordDetail,
} from './queries/words.js';
```

to:

```ts
export {
  getWordsByAyah,
  getWordsBySurah,
  getWordsBySurahAyahRange,
  getWordByLocation,
  getWordDetail,
  getSegmentsByWordIds,
} from './queries/words.js';
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd packages/data && pnpm test -- words.test.ts`
Expected: PASS, all `getSegmentsByWordIds` cases green.

- [ ] **Step 5: Commit**

```bash
git add packages/data/src/queries/words.ts packages/data/src/index.ts packages/data/tests/words.test.ts
git commit -m "feat(data): add batched getSegmentsByWordIds query"
```

---

## Task 2: `segments` field on `WbwCell` + fixture ripple

**Files:**
- Modify: `apps/web/src/components/wbw/types.ts`
- Modify: `apps/web/src/test/WbwWordCell.test.tsx`
- Modify: `apps/web/src/test/WbwWordRow.test.tsx`
- Modify: `apps/web/src/test/WbwAyahBlock.test.tsx`
- Modify: `apps/web/src/test/WbwAyahListBlock.test.tsx`
- Modify: `apps/web/src/test/WbwAyahs.test.tsx`
- Modify: `apps/web/src/test/WbwView.test.tsx`

**Interfaces:**
- Consumes: `WordSegment` type from `@quran-corpus/data` (Task 1's dependency, already exported).
- Produces: `WbwCell.segments: WordSegment[]` — required field every fixture in the codebase must supply from this task forward.

This is a type-only breaking change: adding a required field breaks every existing `WbwCell` literal at compile time. No new behavior yet — just make the codebase compile with the new field, default `[]` everywhere (existing tests don't exercise segments yet).

- [ ] **Step 1: Add the field**

In `apps/web/src/components/wbw/types.ts`, change:

```ts
import type { Surah } from '@quran-corpus/data';
```

to:

```ts
import type { Surah, WordSegment } from '@quran-corpus/data';
```

and change:

```ts
export interface WbwCell {
  surahId: number;
  ayahNumber: number;
  position: number;
  arabic: string;
  translit: string | null;
  gloss: string | null;
  glossLang: string | null;
  posLabel: string | null;
  morphologyDescription: string | null;
  grammarArabic: string | null;
}
```

to:

```ts
export interface WbwCell {
  surahId: number;
  ayahNumber: number;
  position: number;
  arabic: string;
  translit: string | null;
  gloss: string | null;
  glossLang: string | null;
  posLabel: string | null;
  segments: WordSegment[];
  morphologyDescription: string | null;
  grammarArabic: string | null;
}
```

- [ ] **Step 2: Run typecheck, verify it fails**

Run: `cd apps/web && pnpm typecheck` (or `pnpm tsc --noEmit` if no `typecheck` script)
Expected: FAIL — multiple `Property 'segments' is missing` errors in the 6 test files listed above (and `page.tsx`, fixed in Task 6).

- [ ] **Step 3: Fix each fixture**

In `apps/web/src/test/WbwWordCell.test.tsx`, change the `cell()` helper's returned object to add `segments: []`:

```ts
function cell(over: Partial<WbwCell> = {}): WbwCell {
  return {
    surahId: 1, ayahNumber: 1, position: 1,
    arabic: 'بِسْمِ', translit: "bis'mi", gloss: 'In (the) name', glossLang: null, posLabel: 'Preposition',
    segments: [],
    morphologyDescription: 'P – prefixed preposition bi', grammarArabic: 'جار ومجرور',
    ...over,
  };
}
```

Also add `segments: []` to the inline literal at the bottom of the same file (the "renders latin gloss/translit LTR" test):

```ts
const c = { surahId: 2, ayahNumber: 2, position: 3, arabic: 'فِيهِ',
  translit: 'fihi', gloss: 'in it,', glossLang: 'en', posLabel: 'Preposition',
  segments: [],
  morphologyDescription: null, grammarArabic: null };
```

In `apps/web/src/test/WbwWordRow.test.tsx`, same `cell()` helper shape — add `segments: []`:

```ts
function cell(over: Partial<WbwCell> = {}): WbwCell {
  return {
    surahId: 1, ayahNumber: 1, position: 1,
    arabic: 'بِسْمِ', translit: "bis'mi", gloss: 'In (the) name', glossLang: null, posLabel: 'Preposition',
    segments: [],
    morphologyDescription: 'P – prefixed preposition bi', grammarArabic: 'جار ومجرور',
    ...over,
  };
}
```

In `apps/web/src/test/WbwAyahBlock.test.tsx`, change the `c` helper:

```ts
const c = (position: number, arabic: string) => ({
  surahId: 1, ayahNumber: 3, position, arabic, translit: 't', gloss: 'g', glossLang: null, posLabel: 'Noun',
  segments: [],
  morphologyDescription: 'N – nominative masculine noun', grammarArabic: 'اسم مرفوع',
});
```

In `apps/web/src/test/WbwAyahListBlock.test.tsx`, identical change to its `c` helper:

```ts
const c = (position: number, arabic: string) => ({
  surahId: 1, ayahNumber: 3, position, arabic, translit: 't', gloss: 'g', glossLang: null, posLabel: 'Noun',
  segments: [],
  morphologyDescription: 'N – nominative masculine noun', grammarArabic: 'اسم مرفوع',
});
```

In `apps/web/src/test/WbwAyahs.test.tsx`, add `segments: []` to the one cell literal:

```ts
const ayahs: WbwAyah[] = [
  {
    ayahNumber: 1,
    cells: [
      {
        surahId: 1, ayahNumber: 1, position: 1, arabic: 'بِسْمِ', translit: "bis'mi",
        gloss: 'In (the) name', glossLang: null, posLabel: 'Preposition',
        segments: [],
        morphologyDescription: 'P', grammarArabic: 'جار ومجرور',
      },
    ],
    textUthmani: 'x',
  },
];
```

In `apps/web/src/test/WbwView.test.tsx`, add `segments: []` to both cell literals:

```ts
const ayahs: WbwAyah[] = [
  { ayahNumber: 1, cells: [{ surahId: 1, ayahNumber: 1, position: 1, arabic: 'بِسْمِ', translit: "bis'mi", gloss: 'In (the) name', glossLang: null, posLabel: 'Preposition', segments: [], morphologyDescription: 'P', grammarArabic: 'جار ومجرور' }], textUthmani: 'x' },
];
```

```ts
const midSurahAyahs: WbwAyah[] = [
  { ayahNumber: 16, cells: [{ surahId: 2, ayahNumber: 16, position: 1, arabic: 'أُو۟لَٰٓئِكَ', translit: "ulaaika", gloss: 'Those', glossLang: null, posLabel: 'Pronoun', segments: [], morphologyDescription: null, grammarArabic: null }], textUthmani: 'x' },
];
```

- [ ] **Step 4: Run typecheck + full web test suite, verify pass**

Run: `cd apps/web && pnpm typecheck && pnpm test`
Expected: typecheck clean; all existing WbW tests still PASS (behavior unchanged — `segments: []` triggers no rendering difference yet since nothing reads it).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/wbw/types.ts apps/web/src/test/WbwWordCell.test.tsx apps/web/src/test/WbwWordRow.test.tsx apps/web/src/test/WbwAyahBlock.test.tsx apps/web/src/test/WbwAyahListBlock.test.tsx apps/web/src/test/WbwAyahs.test.tsx apps/web/src/test/WbwView.test.tsx
git commit -m "feat(web): add segments field to WbwCell"
```

---

## Task 3: `SegmentPills` component

**Files:**
- Create: `apps/web/src/components/morphology/SegmentPills.tsx`
- Test: `apps/web/src/test/SegmentPills.test.tsx`

**Interfaces:**
- Consumes: `WordSegment` (from `@quran-corpus/data`), `posColor` (`apps/web/src/lib/posColor.ts`).
- Produces: `SegmentPills({ segments: WordSegment[]; fallbackWord: string }): JSX.Element` — default export none, named export `SegmentPills`.

- [ ] **Step 1: Write failing test**

Create `apps/web/src/test/SegmentPills.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SegmentPills } from '../components/morphology/SegmentPills';
import type { WordSegment } from '@quran-corpus/data';

function seg(over: Partial<WordSegment> = {}): WordSegment {
  return {
    id: 1, word_id: 1, segment_index: 0, segment_type: 'prefix',
    pos_tag: 'P', form_arabic: 'بِ', form_buckwalter: null,
    features_json: null, lemma: null, root: null,
    ...over,
  };
}

describe('SegmentPills', () => {
  it('falls back to the flat word when segments is empty', () => {
    render(<SegmentPills segments={[]} fallbackWord="بِسْمِ" />);
    expect(screen.getByText('بِسْمِ')).toBeInTheDocument();
  });

  it('renders one pill per segment with its Arabic form and POS code', () => {
    const segments = [
      seg({ id: 1, segment_index: 0, pos_tag: 'P', form_arabic: 'بِ' }),
      seg({ id: 2, segment_index: 1, pos_tag: 'N', form_arabic: 'سْمِ' }),
    ];
    render(<SegmentPills segments={segments} fallbackWord="بِسْمِ" />);
    expect(screen.getByText('بِ')).toBeInTheDocument();
    expect(screen.getByText('سْمِ')).toBeInTheDocument();
    expect(screen.getByText('P')).toBeInTheDocument();
    expect(screen.getByText('N')).toBeInTheDocument();
  });

  it('colors each segment by posColor(pos_tag)', () => {
    const segments = [seg({ id: 1, pos_tag: 'V', form_arabic: 'قُلْ' })];
    render(<SegmentPills segments={segments} fallbackWord="قُلْ" />);
    expect(screen.getByText('قُلْ')).toHaveStyle({ color: 'var(--pos-verb)' });
    expect(screen.getByText('V')).toHaveStyle({ color: 'var(--pos-verb)' });
  });

  it('renders empty pos_tag code as empty text without crashing', () => {
    const segments = [seg({ id: 1, pos_tag: null, form_arabic: 'قُلْ' })];
    render(<SegmentPills segments={segments} fallbackWord="قُلْ" />);
    expect(screen.getByText('قُلْ')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test, verify fail**

Run: `cd apps/web && pnpm test -- SegmentPills.test.tsx`
Expected: FAIL — module `../components/morphology/SegmentPills` not found.

- [ ] **Step 3: Implement**

Create `apps/web/src/components/morphology/SegmentPills.tsx`:

```tsx
import type { WordSegment } from '@quran-corpus/data';
import { posColor } from '../../lib/posColor';

export function SegmentPills({
  segments,
  fallbackWord,
}: {
  segments: WordSegment[];
  fallbackWord: string;
}) {
  if (segments.length === 0) {
    return (
      <span className="font-arabic text-2xl leading-[1.8] text-paper-900 dark:text-paper-100" dir="rtl">
        {fallbackWord}
      </span>
    );
  }

  return (
    <span className="flex items-end gap-0.5" dir="rtl">
      {segments.map((seg) => {
        const color = posColor(seg.pos_tag);
        return (
          <span
            key={seg.id}
            className="flex flex-col items-center rounded-md px-1 py-0.5"
            style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }}
          >
            <span className="font-arabic text-2xl leading-[1.8]" style={{ color }}>
              {seg.form_arabic ?? ''}
            </span>
            <span className="text-[10px] leading-none" style={{ color }}>
              {seg.pos_tag ?? ''}
            </span>
          </span>
        );
      })}
    </span>
  );
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `cd apps/web && pnpm test -- SegmentPills.test.tsx`
Expected: PASS, all 4 cases green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/morphology/SegmentPills.tsx apps/web/src/test/SegmentPills.test.tsx
git commit -m "feat(web): add SegmentPills component"
```

---

## Task 4: Wire `SegmentPills` into `WbwWordCell` (card view)

**Files:**
- Modify: `apps/web/src/components/wbw/WbwWordCell.tsx`
- Modify: `apps/web/src/test/WbwWordCell.test.tsx`

**Interfaces:**
- Consumes: `SegmentPills` from Task 3 (`../morphology/SegmentPills`), `cell.segments` from Task 2.

- [ ] **Step 1: Update failing test expectations**

In `apps/web/src/test/WbwWordCell.test.tsx`, change the import block to add `SegmentPills`'s dependency isn't needed directly, but update the "hides chip when posLabel null" test — since `posLabel` chip is removed from render entirely (segments now own the code label), replace that test:

```ts
  it('shows em dash for null translit/gloss', () => {
    render(<WbwWordCell cell={cell({ translit: null, gloss: null })} />);
    expect(screen.getAllByText('—').length).toBe(2);
  });
```

Add a new test for the segment-pill path right after it:

```ts
  it('renders SegmentPills when the cell has segments', () => {
    render(
      <WbwWordCell
        cell={cell({
          segments: [
            {
              id: 1, word_id: 1, segment_index: 0, segment_type: 'prefix',
              pos_tag: 'P', form_arabic: 'بِ', form_buckwalter: null,
              features_json: null, lemma: null, root: null,
            },
          ],
        })}
      />,
    );
    expect(screen.getByText('بِ')).toBeInTheDocument();
    expect(screen.getByText('P')).toBeInTheDocument();
  });

  it('falls back to the flat arabic word when segments is empty', () => {
    render(<WbwWordCell cell={cell({ segments: [] })} />);
    expect(screen.getByText('بِسْمِ')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test, verify fail**

Run: `cd apps/web && pnpm test -- WbwWordCell.test.tsx`
Expected: FAIL — `screen.getByText('بِ')` not found (component still renders whole word flat, no segment split).

- [ ] **Step 3: Implement**

In `apps/web/src/components/wbw/WbwWordCell.tsx`, change:

```tsx
import Link from 'next/link';
import { chip } from '../ui/chip';
import type { WbwCell } from './types';

export function WbwWordCell({ cell, pageLang }: { cell: WbwCell; pageLang?: string }) {
  const { surahId, ayahNumber, position, arabic, translit, gloss, glossLang, posLabel } = cell;
  return (
    <Link
      href={`/word/${surahId}/${ayahNumber}/${position}`}
      className="flex min-w-[4.5rem] flex-col items-center gap-1 rounded-xl border border-paper-200 px-3 py-2 text-center transition-colors hover:bg-paper-100 dark:border-night-100 dark:hover:bg-night-200"
    >
      <span className="font-arabic text-2xl leading-[1.8] text-paper-900 dark:text-paper-100" dir="rtl">
        {arabic}
      </span>
      <span className="text-xs text-paper-500 dark:text-paper-400" dir="ltr">{translit ?? '—'}</span>
      <span className="text-xs text-paper-700 dark:text-paper-300" dir="ltr">
        {gloss ?? '—'}
        {gloss && glossLang && pageLang && glossLang !== pageLang && (
          <span className="ml-1 text-paper-400" aria-label={`in ${glossLang}`}>
            ({glossLang})
          </span>
        )}
      </span>
      {posLabel && <span className={chip}>{posLabel}</span>}
    </Link>
  );
}
```

to:

```tsx
import Link from 'next/link';
import { SegmentPills } from '../morphology/SegmentPills';
import type { WbwCell } from './types';

export function WbwWordCell({ cell, pageLang }: { cell: WbwCell; pageLang?: string }) {
  const { surahId, ayahNumber, position, arabic, translit, gloss, glossLang, segments } = cell;
  return (
    <Link
      href={`/word/${surahId}/${ayahNumber}/${position}`}
      className="flex min-w-[4.5rem] flex-col items-center gap-1 rounded-xl border border-paper-200 px-3 py-2 text-center transition-colors hover:bg-paper-100 dark:border-night-100 dark:hover:bg-night-200"
    >
      <SegmentPills segments={segments} fallbackWord={arabic} />
      <span className="text-xs text-paper-500 dark:text-paper-400" dir="ltr">{translit ?? '—'}</span>
      <span className="text-xs text-paper-700 dark:text-paper-300" dir="ltr">
        {gloss ?? '—'}
        {gloss && glossLang && pageLang && glossLang !== pageLang && (
          <span className="ml-1 text-paper-400" aria-label={`in ${glossLang}`}>
            ({glossLang})
          </span>
        )}
      </span>
    </Link>
  );
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `cd apps/web && pnpm test -- WbwWordCell.test.tsx`
Expected: PASS, all cases green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/wbw/WbwWordCell.tsx apps/web/src/test/WbwWordCell.test.tsx
git commit -m "feat(web): render SegmentPills in WbwWordCell card view"
```

---

## Task 5: Wire `SegmentPills` into `WbwWordRow` (list view)

**Files:**
- Modify: `apps/web/src/components/wbw/WbwWordRow.tsx`
- Modify: `apps/web/src/test/WbwWordRow.test.tsx`

**Interfaces:**
- Consumes: `SegmentPills` from Task 3, `cell.segments` from Task 2.

- [ ] **Step 1: Update failing test expectations**

In `apps/web/src/test/WbwWordRow.test.tsx`, update the "shows em dash" test (drop `posLabel` from the null-fields list, since it's no longer rendered as a chip — `posLabel` stays a real field on the fixture but isn't asserted here):

```ts
  it('shows em dash for null translit/gloss/morphologyDescription/grammarArabic', () => {
    renderRow(
      cell({ translit: null, gloss: null, morphologyDescription: null, grammarArabic: null }),
    );
    expect(screen.getAllByText('—').length).toBe(3);
    expect(screen.queryByText('جار ومجرور')).toBeNull();
  });
```

Add new tests after it:

```ts
  it('renders SegmentPills in the arabic-word column when the cell has segments', () => {
    renderRow(
      cell({
        segments: [
          {
            id: 1, word_id: 1, segment_index: 0, segment_type: 'prefix',
            pos_tag: 'P', form_arabic: 'بِ', form_buckwalter: null,
            features_json: null, lemma: null, root: null,
          },
        ],
      }),
    );
    expect(screen.getByText('بِ')).toBeInTheDocument();
    expect(screen.getByText('P')).toBeInTheDocument();
  });

  it('falls back to the flat arabic word when segments is empty', () => {
    renderRow(cell({ segments: [] }));
    expect(screen.getByText('بِسْمِ')).toBeInTheDocument();
  });
```

Also update the first test ("renders translation, arabic, and morphology columns") to drop the now-removed chip assertion:

```ts
  it('renders translation, arabic, and morphology columns', () => {
    renderRow(cell());
    expect(screen.getByText('In (the) name')).toBeInTheDocument();
    expect(screen.getByText("bis'mi")).toBeInTheDocument();
    expect(screen.getByText('بِسْمِ')).toBeInTheDocument();
    expect(screen.getByText('P – prefixed preposition bi')).toBeInTheDocument();
    expect(screen.getByText('جار ومجرور')).toBeInTheDocument();
    expect(screen.getByText('(1:1:1)')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test, verify fail**

Run: `cd apps/web && pnpm test -- WbwWordRow.test.tsx`
Expected: FAIL — segment pill text not found (still renders flat word + chip).

- [ ] **Step 3: Implement**

In `apps/web/src/components/wbw/WbwWordRow.tsx`, change:

```tsx
import Link from 'next/link';
import type { ReactNode } from 'react';
import { chip } from '../ui/chip';
import type { WbwCell } from './types';

export function WbwWordRow({
  cell,
  pageLang,
  trailingMark,
}: {
  cell: WbwCell;
  pageLang?: string;
  trailingMark?: ReactNode;
}) {
  const {
    surahId,
    ayahNumber,
    position,
    arabic,
    translit,
    gloss,
    glossLang,
    posLabel,
    morphologyDescription,
    grammarArabic,
  } = cell;

  return (
    <tr className="border-b border-paper-100 align-top dark:border-night-50">
      <td className="py-3 pr-3">
        <div className="text-sm text-paper-900 dark:text-paper-100" dir="ltr">
          {gloss ?? '—'}
          {gloss && glossLang && pageLang && glossLang !== pageLang && (
            <span className="ml-1 text-paper-400" aria-label={`in ${glossLang}`}>
              ({glossLang})
            </span>
          )}
        </div>
        <div className="text-xs text-paper-500 dark:text-paper-400" dir="ltr">
          {translit ?? '—'}
        </div>
        <div className="text-xs text-paper-400 tabular-nums">{`(${surahId}:${ayahNumber}:${position})`}</div>
      </td>
      <td className="px-3 py-3 text-center">
        <Link
          href={`/word/${surahId}/${ayahNumber}/${position}`}
          className="inline-flex flex-col items-center gap-1 hover:opacity-80"
        >
          <span className="font-arabic text-2xl leading-[1.8] text-paper-900 dark:text-paper-100" dir="rtl">
            {arabic}
          </span>
          {posLabel && <span className={chip}>{posLabel}</span>}
        </Link>
        {trailingMark}
      </td>
      <td className="py-3 pl-3 text-sm text-paper-700 dark:text-paper-300">
        <div>{morphologyDescription ?? '—'}</div>
        <div className="font-arabic text-base text-paper-600 dark:text-paper-400" dir="rtl">
          {grammarArabic ?? '—'}
        </div>
      </td>
    </tr>
  );
}
```

to:

```tsx
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SegmentPills } from '../morphology/SegmentPills';
import type { WbwCell } from './types';

export function WbwWordRow({
  cell,
  pageLang,
  trailingMark,
}: {
  cell: WbwCell;
  pageLang?: string;
  trailingMark?: ReactNode;
}) {
  const {
    surahId,
    ayahNumber,
    position,
    arabic,
    translit,
    gloss,
    glossLang,
    segments,
    morphologyDescription,
    grammarArabic,
  } = cell;

  return (
    <tr className="border-b border-paper-100 align-top dark:border-night-50">
      <td className="py-3 pr-3">
        <div className="text-sm text-paper-900 dark:text-paper-100" dir="ltr">
          {gloss ?? '—'}
          {gloss && glossLang && pageLang && glossLang !== pageLang && (
            <span className="ml-1 text-paper-400" aria-label={`in ${glossLang}`}>
              ({glossLang})
            </span>
          )}
        </div>
        <div className="text-xs text-paper-500 dark:text-paper-400" dir="ltr">
          {translit ?? '—'}
        </div>
        <div className="text-xs text-paper-400 tabular-nums">{`(${surahId}:${ayahNumber}:${position})`}</div>
      </td>
      <td className="px-3 py-3 text-center">
        <Link
          href={`/word/${surahId}/${ayahNumber}/${position}`}
          className="inline-flex flex-col items-center gap-1 hover:opacity-80"
        >
          <SegmentPills segments={segments} fallbackWord={arabic} />
        </Link>
        {trailingMark}
      </td>
      <td className="py-3 pl-3 text-sm text-paper-700 dark:text-paper-300">
        <div>{morphologyDescription ?? '—'}</div>
        <div className="font-arabic text-base text-paper-600 dark:text-paper-400" dir="rtl">
          {grammarArabic ?? '—'}
        </div>
      </td>
    </tr>
  );
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `cd apps/web && pnpm test -- WbwWordRow.test.tsx`
Expected: PASS, all cases green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/wbw/WbwWordRow.tsx apps/web/src/test/WbwWordRow.test.tsx
git commit -m "feat(web): render SegmentPills in WbwWordRow list view"
```

---

## Task 6: Wire `getSegmentsByWordIds` into the WbW page

**Files:**
- Modify: `apps/web/src/app/surah/[id]/words/page.tsx`

**Interfaces:**
- Consumes: `getSegmentsByWordIds` (Task 1), `WbwCell.segments` (Task 2).

No new test file — this task wires existing, already-tested pieces (`getSegmentsByWordIds` unit-tested in Task 1, cell-building logic here is a plain loop with no branching worth a dedicated unit test — the two component tests already cover the segments-populated and empty-segments render paths end to end). Verify via typecheck + full suite, since `page.tsx` is a server component excluded from unit render tests (consistent with how `glossByWordId`/`posLabel` wiring above it is untested today).

- [ ] **Step 1: Implement**

In `apps/web/src/app/surah/[id]/words/page.tsx`, change the import:

```tsx
import {
  getSurahById,
  getAllSurahs,
  getAyahsBySurah,
  getWordsBySurahAyahRange,
  getGlossesWithFallback,
  posLabelEn,
} from '@quran-corpus/data';
```

to:

```tsx
import {
  getSurahById,
  getAllSurahs,
  getAyahsBySurah,
  getWordsBySurahAyahRange,
  getGlossesWithFallback,
  getSegmentsByWordIds,
  posLabelEn,
} from '@quran-corpus/data';
import type { WordSegment } from '@quran-corpus/data';
```

Change:

```tsx
  // ponytail: ayahs+glosses load the whole surah; only words are windowed. Fine at homelab scale — add getAyahsBySurahRange / getGlossesBySurahAyahRange if a large surah measures slow.
  const [ayahRows, words, glosses, allSurahs] = await Promise.all([
    getAyahsBySurah(db, surahId),
    getWordsBySurahAyahRange(db, surahId, lo, hi),
    getGlossesWithFallback(db, surahId, lang),
    getAllSurahs(db),
  ]);
```

to:

```tsx
  // ponytail: ayahs+glosses load the whole surah; only words are windowed. Fine at homelab scale — add getAyahsBySurahRange / getGlossesBySurahAyahRange if a large surah measures slow.
  const [ayahRows, words, glosses, allSurahs] = await Promise.all([
    getAyahsBySurah(db, surahId),
    getWordsBySurahAyahRange(db, surahId, lo, hi),
    getGlossesWithFallback(db, surahId, lang),
    getAllSurahs(db),
  ]);
  const segments = await getSegmentsByWordIds(db, words.map((w) => w.id));
```

(Kept as a separate `await` rather than folding into the `Promise.all` above: it depends on `words`, which the `Promise.all` itself produces — sequencing it after is correct, not a missed-parallelization bug.)

Change:

```tsx
  const glossByWordId = new Map<number, { text: string; lang: string }>();
  for (const g of glosses) glossByWordId.set(g.word_id, { text: g.gloss_text, lang: g.gloss_lang });
```

to:

```tsx
  const glossByWordId = new Map<number, { text: string; lang: string }>();
  for (const g of glosses) glossByWordId.set(g.word_id, { text: g.gloss_text, lang: g.gloss_lang });

  const segmentsByWordId = new Map<number, WordSegment[]>();
  for (const s of segments) {
    let arr = segmentsByWordId.get(s.word_id);
    if (!arr) {
      arr = [];
      segmentsByWordId.set(s.word_id, arr);
    }
    arr.push(s);
  }
```

Change:

```tsx
    arr.push({
      surahId,
      ayahNumber,
      position: w.position,
      arabic: w.text_arabic,
      translit: w.transliteration,
      gloss: glossByWordId.get(w.id)?.text ?? null,
      glossLang: glossByWordId.get(w.id)?.lang ?? null,
      posLabel: posLabelEn(w.pos_tag),
      morphologyDescription: w.morphology_description,
      grammarArabic: w.grammar_arabic,
    });
```

to:

```tsx
    arr.push({
      surahId,
      ayahNumber,
      position: w.position,
      arabic: w.text_arabic,
      translit: w.transliteration,
      gloss: glossByWordId.get(w.id)?.text ?? null,
      glossLang: glossByWordId.get(w.id)?.lang ?? null,
      posLabel: posLabelEn(w.pos_tag),
      segments: segmentsByWordId.get(w.id) ?? [],
      morphologyDescription: w.morphology_description,
      grammarArabic: w.grammar_arabic,
    });
```

- [ ] **Step 2: Run typecheck + full web test suite**

Run: `cd apps/web && pnpm typecheck && pnpm test`
Expected: typecheck clean; all tests PASS (no test exercises `page.tsx` directly — this step's job is to confirm nothing downstream broke).

- [ ] **Step 3: Manual smoke check**

Start dev server (`pnpm dev` from `apps/web`, or the project's existing running instance) and visit `/surah/1/words` in both card and list view. Confirm:
- Each word's Arabic renders as colored per-segment pills with a short code beneath each segment (not one flat word + English chip).
- Words with no `word_segments` rows (if any exist in the seeded DB) still render the flat Arabic word, no blank cell.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/surah/[id]/words/page.tsx
git commit -m "feat(web): wire segments into the WbW page"
```

---

## Self-Review

**Spec coverage:**
- §1 Data layer → Task 1. ✅
- §2 WbW page wiring → Task 6. ✅
- §3 `WbwCell` type → Task 2. ✅
- §4 `SegmentPills` component → Task 3. ✅
- §5 Wire into both views → Tasks 4, 5. ✅
- §6 Untouched (word-detail page, `posColor.ts`, schema) → no task touches them. ✅
- Testing section (data unit test, component test, existing-test ripple) → Tasks 1, 3, 2/4/5. ✅
- Risks (visual density, rollback) → no code change needed pre-emptively; rollback path is per-task revert (each task commits independently). ✅

**Placeholder scan:** none found — every step has literal code/commands.

**Type consistency:** `WbwCell.segments: WordSegment[]` (Task 2) is consumed identically in Tasks 4/5/6; `SegmentPills({ segments, fallbackWord })` (Task 3) signature matches both call sites (Tasks 4, 5) exactly.
