# WbW List View + Verse Nav Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a corpus.quran.com-style list/table view to the WbW page (`/surah/[id]/words`) as an alternative to the existing card view, toggled by a 2-pill switcher and persisted in localStorage, plus a "Go to verse" picker on the WbW page itself.

**Architecture:** Server-side data plumbing extends the already-fetched `Word` rows with two fields (`morphology_description`, `grammar_arabic`) that were being dropped; a new client component (`WbwAyahs`) owns view-mode state and switches between the existing card renderer and a new list/table renderer per ayah; the existing `VersePicker` is reused unchanged, just newly mounted on the WbW page.

**Tech Stack:** Next.js (App Router), TypeScript, Tailwind CSS, Vitest + Testing Library (existing stack, no new deps).

**Spec:** `docs/superpowers/specs/2026-07-20-wbw-list-view-and-verse-nav-design.md`

## Global Constraints

- One logical change per commit, Conventional Commits format, scope `web/wbw` or `web` (CLAUDE.md §9).
- No `// @ts-ignore`, no disabled lint rules without inline justification (CLAUDE.md §4).
- Run `pnpm --filter web test`, `pnpm --filter web lint`, `pnpm --filter web type-check` before each commit — all must pass (CLAUDE.md §4 step 3).
- Greptile must score 5/5 before this work is considered done (CLAUDE.md §5) — run it after the final task, fix any findings, re-run to confirm.
- WCAG AA: `ViewToggle` buttons need `aria-pressed`; table needs `<caption className="sr-only">` + `scope="col"` headers (CLAUDE.md §8), matching `FrequencyTable.tsx`'s existing pattern.
- `packages/data` schema is not touched — `morphology_description`/`grammar_arabic` columns already exist and are already fetched by `getWordsBySurahAyahRange`.
- If executed via subagent-driven-development: Sonnet-floor subagents, compact context after each task's review passes (CLAUDE.md §13).

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/web/src/components/wbw/types.ts` | Modify — `WbwCell` gains `morphologyDescription`, `grammarArabic`. |
| `apps/web/src/app/surah/[id]/words/page.tsx` | Modify — fetch `getAllSurahs`, populate the 2 new `WbwCell` fields, pass `pickerSurahs` to `WbwView`. |
| `apps/web/src/components/wbw/WbwView.tsx` | Modify — render `VersePicker` when `pickerSurahs` provided; delegate ayah rendering to `WbwAyahs`. |
| `apps/web/src/components/wbw/WbwAyahs.tsx` | New — client, owns `viewMode` state + localStorage persistence, renders `ViewToggle` + per-ayah card/list switch. |
| `apps/web/src/components/wbw/ViewToggle.tsx` | New — controlled 2-option pill (Card/List). |
| `apps/web/src/components/wbw/WbwAyahListBlock.tsx` | New — list-mode ayah section (medallion/bookmark header + table body). |
| `apps/web/src/components/wbw/WbwWordRow.tsx` | New — one `<tr>`: Translation / Arabic / Syntax & morphology columns. |
| `apps/web/src/test/WbwWordCell.test.tsx` | Modify — fixture gains the 2 new fields. |
| `apps/web/src/test/WbwAyahBlock.test.tsx` | Modify — fixture gains the 2 new fields. |
| `apps/web/src/test/WbwView.test.tsx` | Modify — mock `next/navigation`; add `pickerSurahs` test. |
| `apps/web/src/test/ViewToggle.test.tsx` | New. |
| `apps/web/src/test/WbwWordRow.test.tsx` | New. |
| `apps/web/src/test/WbwAyahListBlock.test.tsx` | New. |
| `apps/web/src/test/WbwAyahs.test.tsx` | New. |

---

## Task 1: Extend `WbwCell` with morphology fields, wire into `page.tsx`

**Files:**
- Modify: `apps/web/src/components/wbw/types.ts`
- Modify: `apps/web/src/app/surah/[id]/words/page.tsx`
- Modify: `apps/web/src/test/WbwWordCell.test.tsx`
- Modify: `apps/web/src/test/WbwAyahBlock.test.tsx`
- Modify: `apps/web/src/test/WbwView.test.tsx` (fixtures only — VersePicker test comes in Task 2)

**Interfaces:**
- Produces: `WbwCell.morphologyDescription: string | null`, `WbwCell.grammarArabic: string | null` — consumed by `WbwWordRow` in Task 4.

- [ ] **Step 1: Add the new fields to the three existing test fixtures (will fail type-check — excess properties not yet on `WbwCell`)**

In `apps/web/src/test/WbwWordCell.test.tsx`, change the `cell()` helper:

```ts
function cell(over: Partial<WbwCell> = {}): WbwCell {
  return {
    surahId: 1, ayahNumber: 1, position: 1,
    arabic: 'بِسْمِ', translit: "bis'mi", gloss: 'In (the) name', glossLang: null, posLabel: 'Preposition',
    morphologyDescription: 'P – prefixed preposition bi', grammarArabic: 'جار ومجرور',
    ...over,
  };
}
```

In `apps/web/src/test/WbwAyahBlock.test.tsx`, change the `c()` helper:

```ts
const c = (position: number, arabic: string) => ({
  surahId: 1, ayahNumber: 3, position, arabic, translit: 't', gloss: 'g', glossLang: null, posLabel: 'Noun',
  morphologyDescription: 'N – nominative masculine noun', grammarArabic: 'اسم مرفوع',
});
```

In `apps/web/src/test/WbwView.test.tsx`, add the two fields to both cell literals (in `ayahs` and `midSurahAyahs`):

```ts
const ayahs: WbwAyah[] = [
  { ayahNumber: 1, cells: [{ surahId: 1, ayahNumber: 1, position: 1, arabic: 'بِسْمِ', translit: "bis'mi", gloss: 'In (the) name', glossLang: null, posLabel: 'Preposition', morphologyDescription: 'P', grammarArabic: 'جار ومجرور' }], textUthmani: 'x' },
];
```

```ts
const midSurahAyahs: WbwAyah[] = [
  { ayahNumber: 16, cells: [{ surahId: 2, ayahNumber: 16, position: 1, arabic: 'أُو۟لَٰٓئِكَ', translit: "ulaaika", gloss: 'Those', glossLang: null, posLabel: 'Pronoun', morphologyDescription: null, grammarArabic: null }], textUthmani: 'x' },
];
```

- [ ] **Step 2: Run type-check, confirm it fails on the fixtures**

Run: `pnpm --filter web type-check`
Expected: FAIL — `Object literal may only specify known properties, and 'morphologyDescription' does not exist in type 'WbwCell'.`

- [ ] **Step 3: Extend `WbwCell`**

In `apps/web/src/components/wbw/types.ts`, change:

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

- [ ] **Step 4: Populate the fields in `page.tsx`**

In `apps/web/src/app/surah/[id]/words/page.tsx`, in the `for (const w of words)` loop, change the pushed object:

```ts
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

- [ ] **Step 5: Run type-check and tests, confirm pass**

Run: `pnpm --filter web type-check && pnpm --filter web test`
Expected: PASS (all existing WbW tests green, no behavior change — card view renders identically since `WbwWordCell` doesn't read the 2 new fields).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/wbw/types.ts apps/web/src/app/surah/\[id\]/words/page.tsx apps/web/src/test/WbwWordCell.test.tsx apps/web/src/test/WbwAyahBlock.test.tsx apps/web/src/test/WbwView.test.tsx
git commit -m "feat(web/wbw): thread morphology_description/grammar_arabic into WbwCell"
```

---

## Task 2: Verse picker on the WbW page (`getAllSurahs` + `VersePicker` in `WbwView`)

**Files:**
- Modify: `apps/web/src/app/surah/[id]/words/page.tsx`
- Modify: `apps/web/src/components/wbw/WbwView.tsx`
- Modify: `apps/web/src/test/WbwView.test.tsx`

**Interfaces:**
- Consumes: `VersePicker` (`apps/web/src/components/wbw/VersePicker.tsx`, unchanged) — `{ surahs: PickerSurah[] }`. `toPickerSurah` (`types.ts`).
- Produces: `WbwView` prop `pickerSurahs?: PickerSurah[]` (optional, default `[]` — so the 4 existing `WbwView` tests that don't pass it keep working without mocking `next/navigation`).

- [ ] **Step 1: Write the failing test**

In `apps/web/src/test/WbwView.test.tsx`, add the router mock near the top (above the other imports, same pattern as `VersePicker.test.tsx`):

```ts
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
```

(add `vi` to the existing `import { describe, it, expect } from 'vitest'` → `import { describe, it, expect, vi } from 'vitest'`)

Add a new test at the end of the `describe('WbwView', ...)` block:

```ts
  it('renders a Go to verse VersePicker when pickerSurahs is provided', () => {
    render(
      <WbwView
        surah={surah}
        ayahs={ayahs}
        page={1}
        totalPages={1}
        scrollAyah={null}
        pickerSurahs={[{ id: 1, name_translit: 'Al-Fatihah', ayah_count: 7 }]}
      />,
    );
    expect(screen.getByLabelText(/surah/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go/i })).toBeInTheDocument();
  });

  it('omits the VersePicker when pickerSurahs is not provided', () => {
    render(<WbwView surah={surah} ayahs={ayahs} page={1} totalPages={1} scrollAyah={null} />);
    expect(screen.queryByLabelText(/surah/i)).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- WbwView`
Expected: FAIL — `Unable to find a label with the text of: /surah/i` (VersePicker not rendered yet).

- [ ] **Step 3: Wire `getAllSurahs` in `page.tsx`**

In `apps/web/src/app/surah/[id]/words/page.tsx`, change the import:

```ts
import {
  getSurahById,
  getAllSurahs,
  getAyahsBySurah,
  getWordsBySurahAyahRange,
  getGlossesWithFallback,
  posLabelEn,
} from '@quran-corpus/data';
import { WbwView } from '../../../../components/wbw/WbwView';
import type { WbwCell, WbwAyah } from '../../../../components/wbw/types';
import { toPickerSurah, type PickerSurah } from '../../../../components/wbw/types';
```

Change the parallel fetch to also load all surahs:

```ts
  const [ayahRows, words, glosses, allSurahs] = await Promise.all([
    getAyahsBySurah(db, surahId),
    getWordsBySurahAyahRange(db, surahId, lo, hi),
    getGlossesWithFallback(db, surahId, lang),
    getAllSurahs(db),
  ]);
  const pickerSurahs: PickerSurah[] = allSurahs.map(toPickerSurah);
```

Pass it to `WbwView`:

```tsx
      <WbwView
        surah={surah}
        ayahs={ayahs}
        page={page}
        totalPages={totalPages}
        scrollAyah={scrollAyah}
        pageLang={lang}
        pickerSurahs={pickerSurahs}
      />
```

- [ ] **Step 4: Render `VersePicker` conditionally in `WbwView.tsx`**

In `apps/web/src/components/wbw/WbwView.tsx`, add imports:

```ts
import { VersePicker } from './VersePicker';
import type { PickerSurah } from './types';
```

Add the prop to `WbwViewProps`:

```ts
interface WbwViewProps {
  surah: Surah;
  ayahs: WbwAyah[];
  page: number;
  totalPages: number;
  scrollAyah: number | null;
  pageLang?: string;
  pickerSurahs?: PickerSurah[];
}
```

Destructure it (default `[]`) and render a section right after the header, before the `Bismillah`/ayah loop:

```tsx
export function WbwView({ surah, ayahs, page, totalPages, scrollAyah, pageLang, pickerSurahs = [] }: WbwViewProps) {
  return (
    <div>
      <header className="mb-4 text-center">
        {/* ...unchanged... */}
      </header>

      {pickerSurahs.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-paper-500 dark:text-paper-400">
            Go to verse
          </h2>
          <VersePicker surahs={pickerSurahs} />
        </section>
      )}

      {page === 1 && <Bismillah surahId={surah.id} />}
      {/* ...ayah loop unchanged for this task... */}
```

(Keep the rest of the file — header markup, `Bismillah`, ayah-loop, `Pager`, `ScrollToAyah` — exactly as it is today; Task 3/5 changes the ayah-loop itself.)

- [ ] **Step 5: Run tests, confirm pass**

Run: `pnpm --filter web test -- WbwView`
Expected: PASS (6 tests: 4 existing + 2 new).

- [ ] **Step 6: Full suite + type-check**

Run: `pnpm --filter web type-check && pnpm --filter web test && pnpm --filter web lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/surah/\[id\]/words/page.tsx apps/web/src/components/wbw/WbwView.tsx apps/web/src/test/WbwView.test.tsx
git commit -m "feat(web/wbw): add Go to verse picker to the WbW page itself"
```

---

## Task 3: `ViewToggle` component

**Files:**
- Create: `apps/web/src/components/wbw/ViewToggle.tsx`
- Test: `apps/web/src/test/ViewToggle.test.tsx`

**Interfaces:**
- Produces: `export type ViewMode = 'card' | 'list'`, `ViewToggle({ mode: ViewMode, onChange: (mode: ViewMode) => void })` — consumed by `WbwAyahs` (Task 5).

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/test/ViewToggle.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ViewToggle } from '../components/wbw/ViewToggle';

describe('ViewToggle', () => {
  it('renders both options with the current mode pressed', () => {
    render(<ViewToggle mode="card" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Card' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange with the other mode when clicked', () => {
    const onChange = vi.fn();
    render(<ViewToggle mode="card" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(onChange).toHaveBeenCalledWith('list');
  });

  it('reflects list as the pressed mode when passed', () => {
    render(<ViewToggle mode="list" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Card' })).toHaveAttribute('aria-pressed', 'false');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- ViewToggle`
Expected: FAIL — cannot find module `../components/wbw/ViewToggle`.

- [ ] **Step 3: Implement `ViewToggle.tsx`**

Create `apps/web/src/components/wbw/ViewToggle.tsx`:

```tsx
export type ViewMode = 'card' | 'list';

const OPTIONS: { mode: ViewMode; label: string }[] = [
  { mode: 'card', label: 'Card' },
  { mode: 'list', label: 'List' },
];

export function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  return (
    <div
      role="group"
      aria-label="Word-by-word view"
      className="inline-flex rounded-full border border-paper-200 p-0.5 dark:border-night-100"
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.mode}
          type="button"
          aria-pressed={mode === opt.mode}
          onClick={() => onChange(opt.mode)}
          className={`rounded-full px-3 py-1 text-sm transition-colors ${
            mode === opt.mode
              ? 'bg-paper-900 text-paper-50 dark:bg-paper-100 dark:text-night-300'
              : 'text-paper-600 hover:bg-paper-100 dark:text-paper-400 dark:hover:bg-night-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test -- ViewToggle`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/wbw/ViewToggle.tsx apps/web/src/test/ViewToggle.test.tsx
git commit -m "feat(web/wbw): add ViewToggle pill component"
```

---

## Task 4: `WbwWordRow` + `WbwAyahListBlock`

**Files:**
- Create: `apps/web/src/components/wbw/WbwWordRow.tsx`
- Create: `apps/web/src/components/wbw/WbwAyahListBlock.tsx`
- Test: `apps/web/src/test/WbwWordRow.test.tsx`
- Test: `apps/web/src/test/WbwAyahListBlock.test.tsx`

**Interfaces:**
- Consumes: `WbwCell` (Task 1's extended shape), `chip` (`../ui/chip`), `AyahMedallion` (`../reader/ornaments/AyahMedallion`), `BookmarkButton` (`../shared/BookmarkButton`), `WbwAyah` (`./types`).
- Produces: `WbwWordRow({ cell: WbwCell, pageLang?: string })` (one `<tr>`), `WbwAyahListBlock({ surahId, ayah: WbwAyah, pageLang? })` (one `<section id="ayah-N">` + `<table>`) — consumed by `WbwAyahs` (Task 5).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/test/WbwWordRow.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WbwWordRow } from '../components/wbw/WbwWordRow';
import type { WbwCell } from '../components/wbw/types';

function cell(over: Partial<WbwCell> = {}): WbwCell {
  return {
    surahId: 1, ayahNumber: 1, position: 1,
    arabic: 'بِسْمِ', translit: "bis'mi", gloss: 'In (the) name', glossLang: null, posLabel: 'Preposition',
    morphologyDescription: 'P – prefixed preposition bi', grammarArabic: 'جار ومجرور',
    ...over,
  };
}

function renderRow(cellProps: WbwCell, pageLang?: string) {
  return render(
    <table>
      <tbody>
        <WbwWordRow cell={cellProps} {...(pageLang ? { pageLang } : {})} />
      </tbody>
    </table>,
  );
}

describe('WbwWordRow', () => {
  it('renders translation, arabic, and morphology columns', () => {
    renderRow(cell());
    expect(screen.getByText('In (the) name')).toBeInTheDocument();
    expect(screen.getByText("bis'mi")).toBeInTheDocument();
    expect(screen.getByText('بِسْمِ')).toBeInTheDocument();
    expect(screen.getByText('Preposition')).toBeInTheDocument();
    expect(screen.getByText('P – prefixed preposition bi')).toBeInTheDocument();
    expect(screen.getByText('جار ومجرور')).toBeInTheDocument();
    expect(screen.getByText('(1:1:1)')).toBeInTheDocument();
  });

  it('links the arabic word to the word detail page', () => {
    renderRow(cell({ surahId: 2, ayahNumber: 255, position: 1 }));
    expect(screen.getByRole('link')).toHaveAttribute('href', '/word/2/255/1');
  });

  it('shows em dash for null translit/gloss/morphologyDescription; hides the grammarArabic line when null', () => {
    renderRow(
      cell({ translit: null, gloss: null, posLabel: null, morphologyDescription: null, grammarArabic: null }),
    );
    expect(screen.getAllByText('—').length).toBe(2);
    expect(screen.queryByText('جار ومجرور')).toBeNull();
  });

  it('marks an EN-fallback gloss while viewing uz, same as the card cell', () => {
    renderRow(cell({ gloss: 'Allah', glossLang: 'en' }), 'uz');
    expect(screen.getByText(/\(en\)/i)).toBeInTheDocument();
  });
});
```

Create `apps/web/src/test/WbwAyahListBlock.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WbwAyahListBlock } from '../components/wbw/WbwAyahListBlock';
import type { WbwAyah } from '../components/wbw/types';

const c = (position: number, arabic: string) => ({
  surahId: 1, ayahNumber: 3, position, arabic, translit: 't', gloss: 'g', glossLang: null, posLabel: 'Noun',
  morphologyDescription: 'N – nominative masculine noun', grammarArabic: 'اسم مرفوع',
});

describe('WbwAyahListBlock', () => {
  it('has scroll anchor id and renders a table row per word', () => {
    const ayah: WbwAyah = { ayahNumber: 3, cells: [c(1, 'الف'), c(2, 'باء')], textUthmani: 'x' };
    const { container } = render(<WbwAyahListBlock surahId={1} ayah={ayah} />);
    expect(container.querySelector('#ayah-3')).not.toBeNull();
    expect(screen.getAllByRole('row').length).toBe(3); // header row + 2 word rows
  });

  it('falls back to text_uthmani when the ayah has no words', () => {
    const ayah: WbwAyah = { ayahNumber: 4, cells: [], textUthmani: 'نَصُّ الآية' };
    render(<WbwAyahListBlock surahId={1} ayah={ayah} />);
    expect(screen.getByText('نَصُّ الآية')).toBeInTheDocument();
  });

  it('renders a bookmark button', () => {
    const ayah: WbwAyah = { ayahNumber: 3, cells: [c(1, 'الف')], textUthmani: 'x' };
    render(<WbwAyahListBlock surahId={1} ayah={ayah} />);
    expect(screen.getByRole('button', { name: /bookmark ayah 3/i })).toBeInTheDocument();
  });

  it('column headers match the corpus.quran.com layout', () => {
    const ayah: WbwAyah = { ayahNumber: 3, cells: [c(1, 'الف')], textUthmani: 'x' };
    render(<WbwAyahListBlock surahId={1} ayah={ayah} />);
    expect(screen.getByRole('columnheader', { name: 'Translation' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Arabic word' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Syntax and morphology' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter web test -- WbwWordRow WbwAyahListBlock`
Expected: FAIL — cannot find modules `../components/wbw/WbwWordRow` / `../components/wbw/WbwAyahListBlock`.

- [ ] **Step 3: Implement `WbwWordRow.tsx`**

Create `apps/web/src/components/wbw/WbwWordRow.tsx`:

```tsx
import Link from 'next/link';
import { chip } from '../ui/chip';
import type { WbwCell } from './types';

export function WbwWordRow({ cell, pageLang }: { cell: WbwCell; pageLang?: string }) {
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
      </td>
      <td className="py-3 pl-3 text-sm text-paper-700 dark:text-paper-300">
        <div>{morphologyDescription ?? '—'}</div>
        {grammarArabic && (
          <div className="font-arabic text-base text-paper-600 dark:text-paper-400" dir="rtl">
            {grammarArabic}
          </div>
        )}
      </td>
    </tr>
  );
}
```

- [ ] **Step 4: Implement `WbwAyahListBlock.tsx`**

Create `apps/web/src/components/wbw/WbwAyahListBlock.tsx`:

```tsx
import { WbwWordRow } from './WbwWordRow';
import type { WbwAyah } from './types';
import { AyahMedallion } from '../reader/ornaments/AyahMedallion';
import { BookmarkButton } from '../shared/BookmarkButton';

export function WbwAyahListBlock({
  surahId,
  ayah,
  pageLang,
}: {
  surahId: number;
  ayah: WbwAyah;
  pageLang?: string;
}) {
  return (
    <section
      id={`ayah-${ayah.ayahNumber}`}
      className="scroll-mt-20 border-b border-paper-200 py-5 dark:border-night-100"
    >
      <div className="mb-3 flex items-center gap-2">
        <AyahMedallion n={ayah.ayahNumber} />
        <BookmarkButton surahId={surahId} ayahNumber={ayah.ayahNumber} view="wbw" />
      </div>
      {ayah.cells.length > 0 ? (
        <div className="overflow-x-auto">
          <table aria-label={`Ayah ${ayah.ayahNumber} words`} className="w-full text-left">
            <caption className="sr-only">{`Ayah ${ayah.ayahNumber} word-by-word`}</caption>
            <thead>
              <tr className="border-b border-paper-200 text-xs uppercase tracking-wide text-paper-500 dark:border-night-100">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Translation
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Arabic word
                </th>
                <th scope="col" className="py-2 pl-3 font-medium">
                  Syntax and morphology
                </th>
              </tr>
            </thead>
            <tbody>
              {ayah.cells.map((cell) => (
                <WbwWordRow key={cell.position} cell={cell} {...(pageLang ? { pageLang } : {})} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="font-arabic text-2xl leading-[2.4] text-paper-900 dark:text-paper-100" dir="rtl">
          {ayah.textUthmani}
        </p>
      )}
    </section>
  );
}
```

(`overflow-x-auto` wrapper: the 3-column table is denser than wrapped cards — this guards against forcing page-level horizontal scroll on narrow viewports, per the spec's risk note. Verified in Task 6's manual browser check.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter web test -- WbwWordRow WbwAyahListBlock`
Expected: PASS (4 + 4 tests).

- [ ] **Step 6: Full suite + type-check + lint**

Run: `pnpm --filter web type-check && pnpm --filter web test && pnpm --filter web lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/wbw/WbwWordRow.tsx apps/web/src/components/wbw/WbwAyahListBlock.tsx apps/web/src/test/WbwWordRow.test.tsx apps/web/src/test/WbwAyahListBlock.test.tsx
git commit -m "feat(web/wbw): add list-view table components (WbwWordRow, WbwAyahListBlock)"
```

---

## Task 5: `WbwAyahs` (view-mode state + localStorage), wired into `WbwView`

**Files:**
- Create: `apps/web/src/components/wbw/WbwAyahs.tsx`
- Modify: `apps/web/src/components/wbw/WbwView.tsx`
- Test: `apps/web/src/test/WbwAyahs.test.tsx`
- Modify: `apps/web/src/test/WbwView.test.tsx`

**Interfaces:**
- Consumes: `WbwAyahBlock` (existing), `WbwAyahListBlock` (Task 4), `ViewToggle`/`ViewMode` (Task 3).
- Produces: `WbwAyahs({ surahId: number, ayahs: WbwAyah[], pageLang?: string })` — replaces `WbwView`'s direct `ayahs.map(...)` call.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/test/WbwAyahs.test.tsx`:

```tsx
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WbwAyahs } from '../components/wbw/WbwAyahs';
import type { WbwAyah } from '../components/wbw/types';

const ayahs: WbwAyah[] = [
  {
    ayahNumber: 1,
    cells: [
      {
        surahId: 1, ayahNumber: 1, position: 1, arabic: 'بِسْمِ', translit: "bis'mi",
        gloss: 'In (the) name', glossLang: null, posLabel: 'Preposition',
        morphologyDescription: 'P', grammarArabic: 'جار ومجرور',
      },
    ],
    textUthmani: 'x',
  },
];

describe('WbwAyahs', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('defaults to card view when nothing is stored', () => {
    render(<WbwAyahs surahId={1} ayahs={ayahs} />);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('restores list view from localStorage on mount', () => {
    localStorage.setItem('wbw-view-mode', 'list');
    render(<WbwAyahs surahId={1} ayahs={ayahs} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('ignores an invalid stored value and stays on card', () => {
    localStorage.setItem('wbw-view-mode', 'grid');
    render(<WbwAyahs surahId={1} ayahs={ayahs} />);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('toggling to List switches the render and persists the choice', () => {
    render(<WbwAyahs surahId={1} ayahs={ayahs} />);
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(localStorage.getItem('wbw-view-mode')).toBe('list');
  });

  it('toggling back to Card removes the table and persists the choice', () => {
    localStorage.setItem('wbw-view-mode', 'list');
    render(<WbwAyahs surahId={1} ayahs={ayahs} />);
    fireEvent.click(screen.getByRole('button', { name: 'Card' }));
    expect(screen.queryByRole('table')).toBeNull();
    expect(localStorage.getItem('wbw-view-mode')).toBe('card');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- WbwAyahs`
Expected: FAIL — cannot find module `../components/wbw/WbwAyahs`.

- [ ] **Step 3: Implement `WbwAyahs.tsx`**

Create `apps/web/src/components/wbw/WbwAyahs.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { WbwAyahBlock } from './WbwAyahBlock';
import { WbwAyahListBlock } from './WbwAyahListBlock';
import { ViewToggle, type ViewMode } from './ViewToggle';
import type { WbwAyah } from './types';

const STORAGE_KEY = 'wbw-view-mode';

function isViewMode(v: unknown): v is ViewMode {
  return v === 'card' || v === 'list';
}

export function WbwAyahs({
  surahId,
  ayahs,
  pageLang,
}: {
  surahId: number;
  ayahs: WbwAyah[];
  pageLang?: string;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>('card');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isViewMode(stored)) setViewMode(stored);
    } catch {
      // storage unavailable (private browsing/quota) — stay on the default
    }
  }, []);

  function handleChange(mode: ViewMode) {
    setViewMode(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // storage unavailable — view still switches for this page load
    }
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <ViewToggle mode={viewMode} onChange={handleChange} />
      </div>
      {ayahs.map((ayah) =>
        viewMode === 'card' ? (
          <WbwAyahBlock key={ayah.ayahNumber} surahId={surahId} ayah={ayah} {...(pageLang ? { pageLang } : {})} />
        ) : (
          <WbwAyahListBlock
            key={ayah.ayahNumber}
            surahId={surahId}
            ayah={ayah}
            {...(pageLang ? { pageLang } : {})}
          />
        ),
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test -- WbwAyahs`
Expected: PASS (5 tests).

- [ ] **Step 5: Wire `WbwAyahs` into `WbwView.tsx`, replacing the direct ayah loop**

In `apps/web/src/components/wbw/WbwView.tsx`, replace:

```tsx
      {ayahs.map((ayah) => (
        <WbwAyahBlock
          key={ayah.ayahNumber}
          surahId={surah.id}
          ayah={ayah}
          {...(pageLang ? { pageLang } : {})}
        />
      ))}
```

with:

```tsx
      <WbwAyahs surahId={surah.id} ayahs={ayahs} {...(pageLang ? { pageLang } : {})} />
```

Update the import line (drop the now-unused `WbwAyahBlock` import, add `WbwAyahs`):

```ts
import { WbwAyahs } from './WbwAyahs';
```

- [ ] **Step 6: Run the full WbwView suite, confirm it still passes**

Run: `pnpm --filter web test -- WbwView`
Expected: PASS — the existing assertions (`screen.getByText('بِسْمِ')`, etc.) still find the card-rendered cell, since `WbwAyahs` defaults to `'card'` and `WbwAyahBlock`'s output is unchanged.

- [ ] **Step 7: Full suite + type-check + lint**

Run: `pnpm --filter web type-check && pnpm --filter web test && pnpm --filter web lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/wbw/WbwAyahs.tsx apps/web/src/components/wbw/WbwView.tsx apps/web/src/test/WbwAyahs.test.tsx
git commit -m "feat(web/wbw): wire card/list view toggle into the WbW page"
```

---

## Task 6: Manual browser verification + final gate + Greptile

**Note:** CLAUDE.md §10 calls for a Playwright E2E smoke test, but this repo has
**no Playwright installed at all** (no config, no `.spec.ts` files, not in
`apps/web/package.json`) — the 08f design doc planned one but it was never
actually set up. Standing that infrastructure up (installing the package,
writing `playwright.config.ts`, wiring a CI job) is a separate, repo-wide
gap unrelated to this feature — out of scope here (YAGNI: don't bundle
unrelated infra work into a feature PR). Flag this gap to the user in the
PR description; this task instead does the manual-browser verification
CLAUDE.md's UI-change instructions require, plus the unit/component suite
and the Greptile gate.

**Files:** none new — verification only.

- [ ] **Step 1: Run the dev server and exercise the feature**

Run: `pnpm --filter web dev`

In a mobile-viewport browser (or devtools device emulation), navigate to
`/surah/1/words` and check:
- Card view renders as before (regression check).
- Click "List" → table renders per ayah, 3 columns (Translation / Arabic
  word / Syntax and morphology), medallion header still present per ayah,
  no horizontal page scroll at a 375px-wide viewport.
- Click an Arabic word in list view → lands on `/word/1/1/[n]` detail page.
- Reload the page → List view is still selected (localStorage persisted).
- Use the "Go to verse" picker at the top of the page → pick Surah 2,
  Ayah 255 → Go → lands on `/surah/2/words?ayah=255`, scrolled to that
  ayah, **and** still in List view (view mode persists across navigation).
- Toggle back to Card, reload → Card persists.
- Repeat in dark mode (theme toggle) — no unreadable/invisible text in
  either column set.

- [ ] **Step 2: Full unit/component suite + type-check + lint**

Run: `pnpm --filter web type-check && pnpm --filter web test && pnpm --filter web lint`
Expected: PASS, zero warnings suppressed without justification comments (CLAUDE.md §4).

- [ ] **Step 3: Commit any fixups found during manual verification**

```bash
git add -A
git commit -m "fix(web/wbw): address issues found in manual verification"
```

(Skip this step if manual verification found nothing to fix.)

- [ ] **Step 4: Push, open PR, run Greptile, address findings until 5/5** (CLAUDE.md §5 — hard block, no override). Re-run Greptile after any fix; do not merge below 5/5. Note the missing Playwright infra (Step 1's note above) in the PR body as a known pre-existing gap, not something this PR silently skips.

---

## Non-goals (carried from spec — do not implement)

- No change to card view's own fields/behavior.
- No change to pagination, deep-link (`?ayah=`) resolution, or `Pager`.
- No corpus-matching color system for POS tags — reuse existing `chip`.
- No whole-surah continuous scroll.
- No new API route (`page.tsx` already server-renders; `getAllSurahs` is called directly, no `/api/surahs` round trip needed here).

## Acceptance criteria (testable — from spec, verify all before closing this phase)

1. `/surah/1/words` in Card mode renders exactly as it does today (Task 1/2/5 regression tests cover this).
2. Toggling to List mode renders a table per ayah: Translation | Arabic | Syntax & morphology columns, ayah medallion header kept, same 15-ayah page window (Task 4/5/6).
3. List mode's Arabic cell links to `/word/[s]/[a]/[p]` (Task 4, `WbwWordRow` test).
4. Null `morphology_description`/`grammar_arabic` → '—', no crash (Task 4, `WbwWordRow` null-fields test).
5. `/surah/[id]/words` shows a "Go to verse" `VersePicker`; navigating preserves the previously-chosen view mode (Task 2, Task 6 manual check).
6. Reload after choosing List → still List; storage-disabled → no crash, defaults to Card (Task 5 tests).
7. lint + type-check + tests pass; Greptile 5/5; a11y (`aria-pressed`, `scope="col"`, RTL) intact (Task 6).
