# Phase 15 — Sajdah Mark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** show the mushaf sajdah symbol (`۩`) on the 15 verses of prostration, on both the Reader and WbW (card + list) views.

**Architecture:** `ayahs.text_uthmani` already embeds `۩` for exactly the right 15 ayahs (Tanzil source, verified against the live DB). Add a pure `isSajdahAyah(text)` helper in `packages/data`, one shared `SajdahMark` ornament component, and wire both into the 3 render sites that currently drop the mark (their per-word rendering never produces a `۩` token). No schema change, no hand-authored ayah list.

**Tech Stack:** Next.js/TypeScript/Tailwind (existing `apps/web`), `packages/data` pure-function text modules, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-20-sajdah-mark-design.md`

## Global Constraints

- One logical change per commit, Conventional Commits, scope `data` or `web/reader`/`web/wbw` (CLAUDE.md §9).
- No `@ts-ignore`, no disabled lint rules without inline justification (CLAUDE.md §4).
- `pnpm --filter @quran-corpus/data test` / `pnpm --filter web test` / `type-check` / `lint` must all pass before each commit.
- Greptile 5/5 hard block (CLAUDE.md §5), run after Task 5, no override.
- **Client-barrel rule (memory: data-client-barrel-poison):** `isSajdahAyah` must be exported from `packages/data/src/client.ts` (browser-safe entry), and every client component (`AyahView.tsx`, `WbwAyahBlock.tsx`, `WbwAyahListBlock.tsx`) must import it from `@quran-corpus/data/client`, never the root `@quran-corpus/data` barrel — the barrel drags in `@libsql/client` and breaks hydration. `packages/data/tests/client-entry.test.ts` walks the module graph from `client.ts` and will fail if this is violated.
- Never touch `words.text_arabic` / `WbwCell.arabic` content or `WordToken`/`WbwWordCell` click targets — the mark is always a trailing sibling, never merged into a word's own string.
- `SajdahMark` is the single shared component for all 3 sites (DRY, CLAUDE.md §3).

---

### Task 1: Data layer — `isSajdahAyah`

**Files:**
- Create: `packages/data/src/text/sajdah.ts`
- Modify: `packages/data/src/index.ts`
- Modify: `packages/data/src/client.ts`
- Test: `packages/data/tests/sajdah.test.ts`

**Interfaces:**
- Produces: `isSajdahAyah(textUthmani: string): boolean`, exported from both `@quran-corpus/data` and `@quran-corpus/data/client`.

- [ ] **Step 1: Write the failing test**

`packages/data/tests/sajdah.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isSajdahAyah } from '../src/text/sajdah.js';

describe('isSajdahAyah', () => {
  it('true when the Uthmani text contains the sajdah mark', () => {
    expect(isSajdahAyah('فَٱسْجُدُوا۟ لِلَّهِ وَٱعْبُدُوا۟ ۩')).toBe(true);
  });

  it('false when the text has no sajdah mark', () => {
    expect(isSajdahAyah('بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ')).toBe(false);
  });

  it('false for an empty string', () => {
    expect(isSajdahAyah('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @quran-corpus/data test -- sajdah`
Expected: FAIL — `Cannot find module '../src/text/sajdah.js'`

- [ ] **Step 3: Write the implementation**

`packages/data/src/text/sajdah.ts`:

```ts
/** Ayahs of prostration (sajdah tilawah) mark themselves in the Tanzil-sourced
 *  Uthmani text with U+06E9 ARABIC PLACE OF SAJDAH (۩) -- present for exactly
 *  the 15 ayahs of the Shafi'i/Hanbali convention. Deriving from that existing
 *  character avoids a hand-authored (surah, ayah) list that could drift out of
 *  sync with a future re-import. */
export function isSajdahAyah(textUthmani: string): boolean {
  return textUthmani.includes('۩');
}
```

- [ ] **Step 4: Export from the root barrel**

In `packages/data/src/index.ts`, immediately after the existing line:

```ts
export { trimConcordanceVerse } from './text/concordanceTrim.js';
```

add:

```ts
export { isSajdahAyah } from './text/sajdah.js';
```

- [ ] **Step 5: Export from the client-safe entry**

In `packages/data/src/client.ts`, immediately after the existing line:

```ts
export { trimConcordanceVerse } from './text/concordanceTrim.js';
export type { TrimmedVerse } from './text/concordanceTrim.js';
```

add:

```ts
export { isSajdahAyah } from './text/sajdah.js';
```

`sajdah.ts` has zero imports, so this can't reintroduce the `@libsql/client` poison — `client-entry.test.ts`'s module-graph walk will confirm.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @quran-corpus/data test -- sajdah`
Expected: PASS (3 tests)

- [ ] **Step 7: Run full data package gate**

Run: `pnpm --filter @quran-corpus/data test && pnpm --filter @quran-corpus/data type-check`
Expected: all existing tests still pass (including `client-entry.test.ts`), 0 type errors.

- [ ] **Step 8: Commit**

```bash
git add packages/data/src/text/sajdah.ts packages/data/src/index.ts packages/data/src/client.ts packages/data/tests/sajdah.test.ts
git commit -m "feat(data): add isSajdahAyah helper for the 15 prostration verses"
```

---

### Task 2: `SajdahMark` ornament component

**Files:**
- Create: `apps/web/src/components/reader/ornaments/SajdahMark.tsx`
- Test: `apps/web/src/test/SajdahMark.test.tsx`

**Interfaces:**
- Consumes: nothing (no props required besides optional `className`).
- Produces: `SajdahMark({ className }: { className?: string })` — importable from `apps/web/src/components/reader/ornaments/SajdahMark`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/test/SajdahMark.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SajdahMark } from '../components/reader/ornaments/SajdahMark';

describe('SajdahMark', () => {
  it('renders the sajdah glyph with an a11y label', () => {
    render(<SajdahMark />);
    expect(screen.getByLabelText('Verse of Prostration (Sajdah)')).toBeInTheDocument();
    expect(screen.getByText('۩')).toBeInTheDocument();
  });

  it('merges an extra className', () => {
    render(<SajdahMark className="ml-1" />);
    expect(screen.getByLabelText('Verse of Prostration (Sajdah)')).toHaveClass('ml-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- SajdahMark`
Expected: FAIL — cannot find module `../components/reader/ornaments/SajdahMark`

- [ ] **Step 3: Write the implementation**

`apps/web/src/components/reader/ornaments/SajdahMark.tsx`:

```tsx
export function SajdahMark({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Verse of Prostration (Sajdah)"
      className={`font-arabic text-2xl text-paper-600 dark:text-paper-200 ${className ?? ''}`.trim()}
    >
      ۩
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test -- SajdahMark`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/reader/ornaments/SajdahMark.tsx apps/web/src/test/SajdahMark.test.tsx
git commit -m "feat(web/reader): add shared SajdahMark ornament component"
```

---

### Task 3: Wire into the Reader (`AyahView.tsx`)

**Files:**
- Modify: `apps/web/src/components/reader/AyahView.tsx`
- Modify: `apps/web/src/test/AyahView.test.tsx`

**Interfaces:**
- Consumes: `isSajdahAyah` from `@quran-corpus/data/client` (Task 1), `SajdahMark` from `./ornaments/SajdahMark` (Task 2).

**Design note:** the mark must appear only on the per-word render path (`words.length > 0`). The `words.length === 0` fallback renders `ayah.text_uthmani` as raw text, which *already contains* `۩` inline (that's the DB source string) — appending `SajdahMark` there too would show the glyph twice. So the trailing sibling goes inside the `words.length > 0` branch only, wrapped in a fragment.

- [ ] **Step 1: Write the failing test**

In `apps/web/src/test/AyahView.test.tsx`, add a sajdah-ayah fixture and two tests. Insert after the existing `const words: Word[] = [...]` block (before `const translation: Translation = ...`):

```ts
const sajdahAyah: Ayah = {
  id: 2,
  surah_id: 96,
  ayah_number: 19,
  text_uthmani: 'كَلَّا لَا تُطِعْهُ وَٱسْجُدْ وَٱقْتَرِب ۩',
  text_simple: null,
  juz: 30,
  page: 597,
  audio_url: null,
};

const sajdahWords: Word[] = [
  { id: 3, ayah_id: 2, position: 1, text_arabic: 'وَٱسْجُدْ', transliteration: null, root: null, lemma: null, root_buckwalter: null, lemma_buckwalter: null, pos_tag: null, morphology_json: null, morphology_description: null, grammar_arabic: null, audio_url: null },
];
```

Add at the end of the `describe('AyahView', ...)` block, before the closing `});`:

```ts
  it('shows the sajdah mark for a prostration ayah', () => {
    render(<AyahView ayah={sajdahAyah} words={sajdahWords} onWordClick={vi.fn()} {...audioProps} />);
    expect(screen.getByLabelText('Verse of Prostration (Sajdah)')).toBeInTheDocument();
  });

  it('does not show the sajdah mark for a non-prostration ayah', () => {
    render(<AyahView ayah={ayah} words={words} onWordClick={vi.fn()} {...audioProps} />);
    expect(screen.queryByLabelText('Verse of Prostration (Sajdah)')).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- AyahView`
Expected: FAIL — "shows the sajdah mark for a prostration ayah" cannot find label.

- [ ] **Step 3: Modify `AyahView.tsx`**

Add imports after the existing `import type { Ayah, Word, Translation } from '@quran-corpus/data';` line:

```tsx
import { isSajdahAyah } from '@quran-corpus/data/client';
import { SajdahMark } from './ornaments/SajdahMark';
```

Replace the word-row block:

```tsx
      <div dir="rtl" className="flex flex-wrap gap-x-1 gap-y-2 font-arabic text-3xl leading-[2.4]">
        {words.length > 0 ? (
          words.map((word) => (
            <WordToken key={word.id} word={word} onClick={onWordClick} />
          ))
        ) : (
          <span className="text-paper-900 dark:text-paper-100">{ayah.text_uthmani}</span>
        )}
      </div>
```

with:

```tsx
      <div dir="rtl" className="flex flex-wrap gap-x-1 gap-y-2 font-arabic text-3xl leading-[2.4]">
        {words.length > 0 ? (
          <>
            {words.map((word) => (
              <WordToken key={word.id} word={word} onClick={onWordClick} />
            ))}
            {isSajdahAyah(ayah.text_uthmani) && <SajdahMark />}
          </>
        ) : (
          <span className="text-paper-900 dark:text-paper-100">{ayah.text_uthmani}</span>
        )}
      </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test -- AyahView`
Expected: PASS (11 tests: 9 existing + 2 new)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/reader/AyahView.tsx apps/web/src/test/AyahView.test.tsx
git commit -m "feat(web/reader): show sajdah mark after the last word token"
```

---

### Task 4: Wire into the WbW card view (`WbwAyahBlock.tsx`)

**Files:**
- Modify: `apps/web/src/components/wbw/WbwAyahBlock.tsx`
- Modify: `apps/web/src/test/WbwAyahBlock.test.tsx`

**Interfaces:**
- Consumes: `isSajdahAyah` from `@quran-corpus/data/client`, `SajdahMark` from `../reader/ornaments/SajdahMark`.

**Design note:** unlike `AyahView`, the cells row already sits inside its own wrapping `<div>`, so the mark is a plain trailing sibling of `ayah.cells.map(...)` — no fragment needed.

- [ ] **Step 1: Write the failing test**

In `apps/web/src/test/WbwAyahBlock.test.tsx`, add at the end of the `describe` block, before the closing `});`:

```ts
  it('shows the sajdah mark when the ayah text contains it', () => {
    const ayah: WbwAyah = { ayahNumber: 3, cells: [c(1, 'الف')], textUthmani: 'نَصّ ۩' };
    render(<WbwAyahBlock surahId={1} ayah={ayah} />);
    expect(screen.getByLabelText('Verse of Prostration (Sajdah)')).toBeInTheDocument();
  });

  it('does not show the sajdah mark otherwise', () => {
    const ayah: WbwAyah = { ayahNumber: 3, cells: [c(1, 'الف')], textUthmani: 'نَصّ' };
    render(<WbwAyahBlock surahId={1} ayah={ayah} />);
    expect(screen.queryByLabelText('Verse of Prostration (Sajdah)')).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- WbwAyahBlock`
Expected: FAIL — first new test can't find the label.

- [ ] **Step 3: Modify `WbwAyahBlock.tsx`**

Add imports after `import { BookmarkButton } from '../shared/BookmarkButton';`:

```tsx
import { isSajdahAyah } from '@quran-corpus/data/client';
import { SajdahMark } from '../reader/ornaments/SajdahMark';
```

Replace:

```tsx
      {ayah.cells.length > 0 ? (
        <div className="flex flex-wrap gap-2" dir="rtl">
          {ayah.cells.map((cell) => (
            <WbwWordCell key={cell.position} cell={cell} {...(pageLang ? { pageLang } : {})} />
          ))}
        </div>
      ) : (
```

with:

```tsx
      {ayah.cells.length > 0 ? (
        <div className="flex flex-wrap gap-2" dir="rtl">
          {ayah.cells.map((cell) => (
            <WbwWordCell key={cell.position} cell={cell} {...(pageLang ? { pageLang } : {})} />
          ))}
          {isSajdahAyah(ayah.textUthmani) && <SajdahMark />}
        </div>
      ) : (
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web test -- WbwAyahBlock`
Expected: PASS (6 tests: 4 existing + 2 new)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/wbw/WbwAyahBlock.tsx apps/web/src/test/WbwAyahBlock.test.tsx
git commit -m "feat(web/wbw): show sajdah mark after the last word cell (card view)"
```

---

### Task 5: Wire into the WbW list view (`WbwAyahListBlock.tsx` + `WbwWordRow.tsx`)

**Files:**
- Modify: `apps/web/src/components/wbw/WbwWordRow.tsx`
- Modify: `apps/web/src/components/wbw/WbwAyahListBlock.tsx`
- Modify: `apps/web/src/test/WbwAyahListBlock.test.tsx`

**Interfaces:**
- Consumes: `isSajdahAyah` from `@quran-corpus/data/client`, `SajdahMark` from `../reader/ornaments/SajdahMark`.
- Produces: `WbwWordRow` gains an optional prop `trailingMark?: ReactNode`, rendered inside the "Arabic word" `<td>` as a sibling **after** the `<Link>` (not inside it — so it's never part of the word's click target). Default (`undefined`) renders nothing extra; every existing call site is unaffected.

**Design note:** a table has no free-floating trailing element the way a flex row does. The spec calls for the mark to sit inside the last row's "Arabic word" cell. Rather than duplicating `WbwWordRow`'s markup in `WbwAyahListBlock`, add one optional, backward-compatible prop so the shared row component can carry it — `WbwAyahListBlock` passes it only for the last cell in the map, only when the ayah is a sajdah ayah.

- [ ] **Step 1: Write the failing test**

In `apps/web/src/test/WbwAyahListBlock.test.tsx`, add at the end of the `describe` block, before the closing `});`:

```ts
  it('shows the sajdah mark inside the last row when the ayah is a prostration verse', () => {
    const ayah: WbwAyah = { ayahNumber: 3, cells: [c(1, 'الف'), c(2, 'باء')], textUthmani: 'نَصّ ۩' };
    render(<WbwAyahListBlock surahId={1} ayah={ayah} />);
    expect(screen.getByLabelText('Verse of Prostration (Sajdah)')).toBeInTheDocument();
    const rows = screen.getAllByRole('row');
    expect(rows[rows.length - 1]).toHaveTextContent('۩');
  });

  it('does not show the sajdah mark otherwise', () => {
    const ayah: WbwAyah = { ayahNumber: 3, cells: [c(1, 'الف')], textUthmani: 'نَصّ' };
    render(<WbwAyahListBlock surahId={1} ayah={ayah} />);
    expect(screen.queryByLabelText('Verse of Prostration (Sajdah)')).toBeNull();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- WbwAyahListBlock`
Expected: FAIL — first new test can't find the label.

- [ ] **Step 3: Modify `WbwWordRow.tsx`**

Add `import type { ReactNode } from 'react';` at the top of the file.

Replace the function signature:

```tsx
export function WbwWordRow({ cell, pageLang }: { cell: WbwCell; pageLang?: string }) {
```

with:

```tsx
export function WbwWordRow({
  cell,
  pageLang,
  trailingMark,
}: {
  cell: WbwCell;
  pageLang?: string;
  trailingMark?: ReactNode;
}) {
```

Replace the "Arabic word" `<td>`:

```tsx
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
```

with:

```tsx
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
```

- [ ] **Step 4: Modify `WbwAyahListBlock.tsx`**

Add imports after `import { BookmarkButton } from '../shared/BookmarkButton';`:

```tsx
import { isSajdahAyah } from '@quran-corpus/data/client';
import { SajdahMark } from '../reader/ornaments/SajdahMark';
```

Replace the `tbody`:

```tsx
            <tbody>
              {ayah.cells.map((cell) => (
                <WbwWordRow key={cell.position} cell={cell} {...(pageLang ? { pageLang } : {})} />
              ))}
            </tbody>
```

with:

```tsx
            <tbody>
              {ayah.cells.map((cell, i) => (
                <WbwWordRow
                  key={cell.position}
                  cell={cell}
                  {...(pageLang ? { pageLang } : {})}
                  {...(i === ayah.cells.length - 1 && isSajdahAyah(ayah.textUthmani)
                    ? { trailingMark: <SajdahMark className="ml-1" /> }
                    : {})}
                />
              ))}
            </tbody>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter web test -- WbwAyahListBlock WbwWordRow`
Expected: PASS (6 tests in `WbwAyahListBlock.test.tsx`: 4 existing + 2 new; any existing `WbwWordRow` tests unaffected)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/wbw/WbwWordRow.tsx apps/web/src/components/wbw/WbwAyahListBlock.tsx apps/web/src/test/WbwAyahListBlock.test.tsx
git commit -m "feat(web/wbw): show sajdah mark in the last row's Arabic-word cell (list view)"
```

---

### Task 6: Full gate, manual check, Greptile 5/5 (human/controller step)

**Files:** none (verification only).

- [ ] **Step 1: Full automated gate**

Run from repo root:

```bash
pnpm --filter @quran-corpus/data build
pnpm --filter @quran-corpus/data test
pnpm --filter web test
pnpm --filter web type-check
pnpm --filter web lint
```

Expected: all green, 0 type errors, 0 lint errors.

- [ ] **Step 2: Manual browser check (best-effort)**

Start dev server, visit the Reader and both WbW views (card + list) for a known sajdah ayah (e.g. 96:19, An-Naml 27:26, or As-Sajdah 32:15) and a neighboring non-sajdah ayah. Confirm the mark renders once, after the last word/cell/row, in both light and dark theme, and is absent on the neighbor. If the sandbox has no DB credentials (as in the Phase 14 worktree — confirmed pre-existing gap, not introduced here), note that explicitly rather than claiming visual verification that didn't happen.

- [ ] **Step 3: Open PR / push per CLAUDE.md §9 commit discipline**

Push branch, open PR against `main`.

- [ ] **Step 4: Run Greptile, address findings, re-run until 5/5**

Per CLAUDE.md §5: fix every finding or document a false-positive justification in the PR/commit body. Re-run after each fix. Score < 5/5 is a hard block — no merge until it clears.

- [ ] **Step 5: Final review, then superpowers:finishing-a-development-branch**

Once Greptile is 5/5 and no Critical/Important findings remain open, hand off to `finishing-a-development-branch` for merge/PR-keep/discard disposition.
