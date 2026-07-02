# Phase 06b — Word-by-Word Morphology UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the 06a morphology data in the UI: enrich the word bottom-sheet with the verbatim English description + Arabic grammar label + a "More details" link, and add a full word-detail route showing segments, structured features, concept tags, and a link into the dictionary.

**Architecture:** Consume `packages/data` directly in Server Components (no HTTP hop, per PRD §7). The existing `WordPopover` (client) gains display of new `Word` fields + a details link. A new server route `/word/[surah]/[ayah]/[position]` renders `WordDetailView` from `getWordByLocation` + `getWordDetail`. Motion via Framer Motion (existing patterns); anti-slop styling reuses the established `paper-*/night-*` token system.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind, Framer Motion, vitest + @testing-library/react.

## Global Constraints

- Depends on **06a merged** (schema + `packages/data` queries: `getWordByLocation`, `getWordDetail`, `getRootByBuckwalter`; types `Word` w/ `morphology_description|grammar_arabic|audio_url`, `WordDetail`, `WordSegment`, `ConceptTag`).
- Design: WCAG AA, `prefers-reduced-motion` respected, 60fps, distinctive typography, mixed RTL/LTR (CLAUDE.md §8). No AI-slop generic layouts.
- Reuse existing tokens/components; DRY — do not duplicate morphology-render logic between popover and detail view (extract a shared presenter where both need it).
- Concept tags render as **non-clickable labels** (ontology phase is future).
- Server Components read via `getDatabase()` (`apps/web/src/lib/db.ts`); DB pages set `export const dynamic = 'force-dynamic'` (existing pattern).
- Conventional Commits, TDD, one logical change per commit. Component tests mock `framer-motion` (existing pattern in `WordPopover.test.tsx`).

## Risks / Rollback

- **Location in URL:** use three numeric segments `/word/[surah]/[ayah]/[position]` (avoids encoding `(1:1:1)` colons). Validate/`notFound()` on non-numeric.
- **Missing detail data:** before the full word-detail scrape completes, `getWordDetail` may return a word with empty segments. UI must degrade gracefully (show what exists). Not a blocker.
- **Rollback:** additive — new route + new component + additive popover fields. Remove the route/component and revert popover to roll back; reader flow unaffected.

## File Structure

- `packages/data/src/types.ts` — MODIFY: extend `Word` with new fields (if not already).
- `packages/data/src/queries/words.ts` — MODIFY: map new `Word` columns in `rowToWord`.
- `apps/web/src/lib/wordLocation.ts` — CREATE: pure `Ayah`+`Word` → `{surah,ayah,position}` + href helper.
- `apps/web/src/components/morphology/MorphologySummary.tsx` — CREATE: shared presenter (description + grammar label + POS/root/lemma chips).
- `apps/web/src/components/reader/WordPopover.tsx` — MODIFY: use `MorphologySummary` + add details link.
- `apps/web/src/components/reader/ReaderView.tsx` — MODIFY: compute + pass word location to popover.
- `apps/web/src/components/morphology/WordDetailView.tsx` — CREATE: full detail (segments, features, concept tags, dictionary link).
- `apps/web/src/components/morphology/SegmentCard.tsx` — CREATE.
- `apps/web/src/app/word/[surah]/[ayah]/[position]/page.tsx` — CREATE: server route.
- Tests: `apps/web/src/test/{wordLocation,MorphologySummary,WordDetailView,SegmentCard}.test.tsx`, MODIFY `WordPopover.test.tsx`.

---

### Task 1: Extend `Word` type + row mapping for detail fields (data)

**Files:**
- Modify: `packages/data/src/types.ts`, `packages/data/src/queries/words.ts`, `packages/data/tests/words.test.ts`

**Interfaces:**
- Produces: `Word` interface gains `morphology_description: string | null`, `grammar_arabic: string | null`, `audio_url: string | null`; `rowToWord` maps them.

- [ ] **Step 1: Failing test** — add to `packages/data/tests/words.test.ts`:

```ts
it('maps morphology_description, grammar_arabic, audio_url', async () => {
  await db.execute(`UPDATE words SET morphology_description='desc', grammar_arabic='جار ومجرور' WHERE position=1`);
  const words = await getWordsByAyah(db, ayahId);
  const w = words.find((x) => x.position === 1)!;
  expect(w.morphology_description).toBe('desc');
  expect(w.grammar_arabic).toBe('جار ومجرور');
  expect(w.audio_url).toBeNull();
});
```

- [ ] **Step 2: Run — expect FAIL** (type error / undefined field)

Run: `pnpm --filter @quran-corpus/data test -- words`
Expected: FAIL.

- [ ] **Step 3: Implement** — in `types.ts` add the three fields to `Word`. In `words.ts` `rowToWord` add:

```ts
    morphology_description: (row['morphology_description'] as string | null) ?? null,
    grammar_arabic: (row['grammar_arabic'] as string | null) ?? null,
    audio_url: (row['audio_url'] as string | null) ?? null,
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter @quran-corpus/data test -- words && pnpm --filter @quran-corpus/data type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/data/src/types.ts packages/data/src/queries/words.ts packages/data/tests/words.test.ts
git commit -m "feat(data): expose word morphology_description/grammar_arabic/audio_url"
```

---

### Task 2: Word-location helper (pure)

**Files:**
- Create: `apps/web/src/lib/wordLocation.ts`, `apps/web/src/test/wordLocation.test.tsx`

**Interfaces:**
- Consumes: `Ayah` (has `surah_id`, `ayah_number`), `Word` (has `position`).
- Produces: `wordLocation(ayah:Ayah, word:Word)->{surah:number,ayah:number,position:number}`; `wordHref(loc)->string` = `/word/${surah}/${ayah}/${position}`.

- [ ] **Step 1: Failing test** — `wordLocation.test.tsx`:

```ts
import { describe, it, expect } from 'vitest';
import { wordLocation, wordHref } from '../lib/wordLocation';
import type { Ayah, Word } from '@quran-corpus/data';

const ayah = { id: 10, surah_id: 2, ayah_number: 5 } as Ayah;
const word = { id: 1, position: 3 } as Word;

describe('wordLocation', () => {
  it('derives surah/ayah/position', () => {
    expect(wordLocation(ayah, word)).toEqual({ surah: 2, ayah: 5, position: 3 });
  });
  it('builds href', () => {
    expect(wordHref({ surah: 2, ayah: 5, position: 3 })).toBe('/word/2/5/3');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @quran-corpus/web test -- wordLocation`
Expected: FAIL.

- [ ] **Step 3: Implement** — `wordLocation.ts`:

```ts
import type { Ayah, Word } from '@quran-corpus/data';

export interface WordLoc { surah: number; ayah: number; position: number; }

export function wordLocation(ayah: Ayah, word: Word): WordLoc {
  return { surah: ayah.surah_id, ayah: ayah.ayah_number, position: word.position };
}

export function wordHref(loc: WordLoc): string {
  return `/word/${loc.surah}/${loc.ayah}/${loc.position}`;
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter @quran-corpus/web test -- wordLocation`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/wordLocation.ts apps/web/src/test/wordLocation.test.tsx
git commit -m "feat(web): add word-location href helper"
```

---

### Task 3: Shared `MorphologySummary` presenter

**Files:**
- Create: `apps/web/src/components/morphology/MorphologySummary.tsx`, `apps/web/src/test/MorphologySummary.test.tsx`

**Interfaces:**
- Consumes: `Word`.
- Produces: `<MorphologySummary word={Word} gloss?={string} />` — renders transliteration, gloss, verbatim `morphology_description`, `grammar_arabic` (dir="rtl"), and POS/root/lemma chips. No interactivity (reusable in popover + detail). DRY: single source for chip rendering.

- [ ] **Step 1: Failing test** — `MorphologySummary.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MorphologySummary } from '../components/morphology/MorphologySummary';
import type { Word } from '@quran-corpus/data';

const word: Word = {
  id: 1, ayah_id: 1, position: 1, text_arabic: 'بِسْمِ', transliteration: 'bismi',
  root: 'س م و', lemma: 'ٱسْم', root_buckwalter: 'smw', lemma_buckwalter: null,
  pos_tag: 'N', morphology_json: null,
  morphology_description: 'prefixed preposition bi + genitive masculine noun',
  grammar_arabic: 'جار ومجرور', audio_url: null,
};

describe('MorphologySummary', () => {
  it('renders verbatim morphology description', () => {
    render(<MorphologySummary word={word} />);
    expect(screen.getByText(/prefixed preposition bi/)).toBeInTheDocument();
  });
  it('renders Arabic grammar label', () => {
    render(<MorphologySummary word={word} />);
    expect(screen.getByText('جار ومجرور')).toBeInTheDocument();
  });
  it('renders gloss when provided', () => {
    render(<MorphologySummary word={word} gloss="In (the) name" />);
    expect(screen.getByText('In (the) name')).toBeInTheDocument();
  });
  it('renders POS and root chips', () => {
    render(<MorphologySummary word={word} />);
    expect(screen.getByText('N')).toBeInTheDocument();
    expect(screen.getByText('س م و')).toBeInTheDocument();
  });
  it('omits description block when null', () => {
    render(<MorphologySummary word={{ ...word, morphology_description: null }} />);
    expect(screen.queryByText(/prefixed preposition/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @quran-corpus/web test -- MorphologySummary`
Expected: FAIL.

- [ ] **Step 3: Implement** — `MorphologySummary.tsx` (no `'use client'` needed; pure presentational). Render: transliteration (`text-paper-500`), gloss (`text-paper-700 dark:text-paper-300`), `morphology_description` paragraph when present, `grammar_arabic` with `dir="rtl" className="font-arabic ..."` when present, and chips for `pos_tag`/`root`/`lemma` reusing the popover chip classes (`rounded-full bg-paper-200 ... dark:bg-night-100`). Guard each block on presence.

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter @quran-corpus/web test -- MorphologySummary`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/morphology/MorphologySummary.tsx apps/web/src/test/MorphologySummary.test.tsx
git commit -m "feat(web): add shared MorphologySummary presenter"
```

---

### Task 4: Enrich `WordPopover` (use summary + details link)

**Files:**
- Modify: `apps/web/src/components/reader/WordPopover.tsx`, `apps/web/src/test/WordPopover.test.tsx`, `apps/web/src/components/reader/ReaderView.tsx`

**Interfaces:**
- Consumes: `MorphologySummary`, `wordHref`, `WordLoc`.
- Produces: `WordPopover` gains optional `href?: string` prop; when set, renders a "More details" link (Next `<Link>`). `ReaderView` computes href per selected word (it knows the ayah) and passes it.

- [ ] **Step 1: Failing test** — add to `WordPopover.test.tsx` (mock `next/link` to a plain anchor):

```tsx
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    <a href={href}>{children}</a>,
}));

it('renders a More details link when href is provided', () => {
  render(<WordPopover word={word} href="/word/1/1/1" onClose={vi.fn()} />);
  const link = screen.getByRole('link', { name: /more details/i });
  expect(link).toHaveAttribute('href', '/word/1/1/1');
});

it('renders verbatim description via MorphologySummary', () => {
  render(<WordPopover word={{ ...word, morphology_description: 'prefixed preposition bi + noun' }} onClose={vi.fn()} />);
  expect(screen.getByText(/prefixed preposition bi/)).toBeInTheDocument();
});
```

(Note: existing `word` fixture in this file must gain the three new fields — add `morphology_description: null, grammar_arabic: null, audio_url: null` to it.)

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @quran-corpus/web test -- WordPopover`
Expected: FAIL.

- [ ] **Step 3: Implement** — in `WordPopover.tsx`: add `href?: string` to props; replace the inline transliteration/gloss/chips/segments blocks with `<MorphologySummary word={word} gloss={gloss} />` (keep the Arabic title, drag handle, close button, backdrop, motion wrapper). After the summary, when `href`, render:

```tsx
{href && (
  <Link href={href} className="mt-5 inline-flex items-center gap-1 rounded-full bg-paper-900 px-4 py-2 text-sm font-medium text-paper-50 transition-colors hover:bg-paper-700 dark:bg-paper-100 dark:text-night-200">
    More details →
  </Link>
)}
```

Import `Link from 'next/link'`. In `ReaderView.tsx`: build a lookup `ayah` for the selected word (`ayahs.find(a => a.id === selectedWord.ayah_id)`), compute `wordHref(wordLocation(ayah, selectedWord))`, pass as `href` (only when ayah found).

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter @quran-corpus/web test -- WordPopover`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/reader/WordPopover.tsx apps/web/src/components/reader/ReaderView.tsx apps/web/src/test/WordPopover.test.tsx
git commit -m "feat(web/reader): enrich word sheet with morphology + details link"
```

---

### Task 5: `SegmentCard` component

**Files:**
- Create: `apps/web/src/components/morphology/SegmentCard.tsx`, `apps/web/src/test/SegmentCard.test.tsx`

**Interfaces:**
- Consumes: `WordSegment`.
- Produces: `<SegmentCard segment={WordSegment} index={number} />` — renders segment type + POS + parsed features (from `features_json`) + root/lemma when present.

- [ ] **Step 1: Failing test** — `SegmentCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SegmentCard } from '../components/morphology/SegmentCard';
import type { WordSegment } from '@quran-corpus/data';

const seg: WordSegment = {
  id: 1, word_id: 1, segment_index: 1, segment_type: 'stem', pos_tag: 'N',
  features_json: '{"case":"genitive","gender":"masculine"}', lemma: 'ٱسْم', root: 'smw',
};

describe('SegmentCard', () => {
  it('renders POS tag', () => {
    render(<SegmentCard segment={seg} index={1} />);
    expect(screen.getByText('N')).toBeInTheDocument();
  });
  it('renders segment type', () => {
    render(<SegmentCard segment={seg} index={1} />);
    expect(screen.getByText(/stem/i)).toBeInTheDocument();
  });
  it('renders parsed features', () => {
    render(<SegmentCard segment={seg} index={1} />);
    expect(screen.getByText(/genitive/)).toBeInTheDocument();
    expect(screen.getByText(/masculine/)).toBeInTheDocument();
  });
  it('handles null/invalid features_json gracefully', () => {
    render(<SegmentCard segment={{ ...seg, features_json: null }} index={1} />);
    expect(screen.getByText('N')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @quran-corpus/web test -- SegmentCard`
Expected: FAIL.

- [ ] **Step 3: Implement** — `SegmentCard.tsx`: safe-parse `features_json` (try/catch → `{}`), render a card (`rounded-xl border border-paper-200 dark:border-night-100 p-4`) with segment_type label, POS chip, and feature key:value pills (`Object.entries`), plus root/lemma (`font-arabic`) when present.

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter @quran-corpus/web test -- SegmentCard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/morphology/SegmentCard.tsx apps/web/src/test/SegmentCard.test.tsx
git commit -m "feat(web): add SegmentCard component"
```

---

### Task 6: `WordDetailView` component

**Files:**
- Create: `apps/web/src/components/morphology/WordDetailView.tsx`, `apps/web/src/test/WordDetailView.test.tsx`

**Interfaces:**
- Consumes: `WordDetail` (`{word, segments, concept_tags}`), optional `gloss`, optional `rootHref` (link into dictionary, `/dictionary/${root_buckwalter}`).
- Produces: `<WordDetailView detail={WordDetail} gloss?={string} rootHref?={string} />` — Arabic word heading, `MorphologySummary`, a segments section (`SegmentCard[]`), concept-tag labels (non-clickable), and a "View root in dictionary" link when `rootHref`.

- [ ] **Step 1: Failing test** — `WordDetailView.test.tsx` (mock `next/link`):

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WordDetailView } from '../components/morphology/WordDetailView';
import type { WordDetail } from '@quran-corpus/data';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const detail: WordDetail = {
  word: { id: 1, ayah_id: 1, position: 1, text_arabic: 'بِسْمِ', transliteration: 'bismi',
    root: 'س م و', lemma: null, root_buckwalter: 'smw', lemma_buckwalter: null, pos_tag: 'N',
    morphology_json: null, morphology_description: 'prefixed preposition bi + noun',
    grammar_arabic: 'جار ومجرور', audio_url: null },
  segments: [
    { id: 1, word_id: 1, segment_index: 0, segment_type: 'prefix', pos_tag: 'P', features_json: null, lemma: null, root: null },
    { id: 2, word_id: 1, segment_index: 1, segment_type: 'stem', pos_tag: 'N', features_json: '{"case":"genitive"}', lemma: null, root: 'smw' },
  ],
  concept_tags: [{ id: 1, word_id: 1, tag_label: 'Allah', tag_type: 'named-entity' }],
};

describe('WordDetailView', () => {
  it('renders the Arabic word', () => {
    render(<WordDetailView detail={detail} />);
    expect(screen.getByText('بِسْمِ')).toBeInTheDocument();
  });
  it('renders one card per segment', () => {
    render(<WordDetailView detail={detail} />);
    expect(screen.getAllByText(/prefix|stem/i).length).toBe(2);
  });
  it('renders concept tags as non-clickable labels', () => {
    render(<WordDetailView detail={detail} />);
    const tag = screen.getByText('Allah');
    expect(tag.closest('a')).toBeNull();
    expect(tag.closest('button')).toBeNull();
  });
  it('renders dictionary root link when rootHref provided', () => {
    render(<WordDetailView detail={detail} rootHref="/dictionary/smw" />);
    expect(screen.getByRole('link', { name: /root/i })).toHaveAttribute('href', '/dictionary/smw');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @quran-corpus/web test -- WordDetailView`
Expected: FAIL.

- [ ] **Step 3: Implement** — `WordDetailView.tsx`: heading (`font-arabic text-6xl`, dir="rtl"), `<MorphologySummary word={detail.word} gloss={gloss} />`, a "Segments" section mapping `detail.segments` (sorted by `segment_index`) to `<SegmentCard>`, concept tags as `<span>` labels, and `rootHref` `<Link>` "View root in dictionary →". Guard empty segments/tags.

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter @quran-corpus/web test -- WordDetailView`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/morphology/WordDetailView.tsx apps/web/src/test/WordDetailView.test.tsx
git commit -m "feat(web): add WordDetailView component"
```

---

### Task 7: Word-detail route `/word/[surah]/[ayah]/[position]`

**Files:**
- Create: `apps/web/src/app/word/[surah]/[ayah]/[position]/page.tsx`
- Test: `apps/web/src/test/wordDetailPage.test.tsx`

**Interfaces:**
- Consumes: `getDatabase`, `getWordByLocation`, `getWordDetail`, `getRootByBuckwalter`, `WordDetailView`.
- Produces: server page. Parses/validates params (numeric; else `notFound()`), fetches word by location → `notFound()` if missing, fetches detail + gloss (`getGlossesBySurahAndLang`? simpler: query gloss directly) + rootHref when `root_buckwalter` present. `export const dynamic = 'force-dynamic'`.

- [ ] **Step 1: Failing test** — `wordDetailPage.test.tsx`. Test the pure param-validation + data-assembly by extracting a helper OR test the page via mocked data layer. Simplest testable unit: a pure `parseWordParams(params)->WordLoc|null` exported from the page module; test it:

```tsx
import { describe, it, expect } from 'vitest';
import { parseWordParams } from '../app/word/[surah]/[ayah]/[position]/page';

describe('parseWordParams', () => {
  it('parses numeric params', () => {
    expect(parseWordParams({ surah: '1', ayah: '1', position: '1' })).toEqual({ surah: 1, ayah: 1, position: 1 });
  });
  it('rejects non-numeric', () => {
    expect(parseWordParams({ surah: 'x', ayah: '1', position: '1' })).toBeNull();
  });
  it('rejects out-of-range surah', () => {
    expect(parseWordParams({ surah: '200', ayah: '1', position: '1' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @quran-corpus/web test -- wordDetailPage`
Expected: FAIL.

- [ ] **Step 3: Implement** — `page.tsx`:

```tsx
export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { getDatabase } from '../../../../lib/db';
import { getWordByLocation, getWordDetail, getRootByBuckwalter } from '@quran-corpus/data';
import { WordDetailView } from '../../../../components/morphology/WordDetailView';

interface PageProps { params: Promise<{ surah: string; ayah: string; position: string }>; }

export function parseWordParams(p: { surah: string; ayah: string; position: string }) {
  const surah = Number(p.surah), ayah = Number(p.ayah), position = Number(p.position);
  if (![surah, ayah, position].every(Number.isInteger)) return null;
  if (surah < 1 || surah > 114 || ayah < 1 || position < 1) return null;
  return { surah, ayah, position };
}

export default async function WordPage({ params }: PageProps) {
  const loc = parseWordParams(await params);
  if (!loc) notFound();
  const db = await getDatabase();
  const word = await getWordByLocation(db, loc.surah, loc.ayah, loc.position);
  if (!word) notFound();
  const detail = await getWordDetail(db, word.id);
  if (!detail) notFound();
  const rootHref = word.root_buckwalter ? `/dictionary/${word.root_buckwalter}` : undefined;
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <WordDetailView detail={detail} {...(rootHref ? { rootHref } : {})} />
    </main>
  );
}
```

(Gloss wiring optional now; add if a single-word gloss query exists. If not, omit `gloss` prop — additive later.)

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter @quran-corpus/web test -- wordDetailPage && pnpm --filter @quran-corpus/web type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/word/[surah]/[ayah]/[position]/page.tsx" apps/web/src/test/wordDetailPage.test.tsx
git commit -m "feat(web): add word-detail route"
```

---

### Task 8: Full-suite quality gate

**Files:** none (verification).

- [ ] **Step 1: Lint + type-check + tests (both packages)**

Run:
```bash
pnpm --filter @quran-corpus/web lint
pnpm --filter @quran-corpus/web type-check
pnpm --filter @quran-corpus/web test
pnpm --filter @quran-corpus/data test
```
Expected: all PASS. Fix any regressions, re-run (loop step 2 of CLAUDE.md §4).

- [ ] **Step 2: Manual smoke (dev)** — `pnpm --filter @quran-corpus/web dev`; open a surah, tap a word → sheet shows description + grammar + "More details"; click through to `/word/1/1/1`; verify segments + (when present) concept tags + dictionary link. Confirm `prefers-reduced-motion` honored + AA contrast.

- [ ] **Step 3: Greptile** — run on the branch; must score ≥4/5 (CLAUDE.md §5). Address findings, re-run.

---

## Self-Review (done)

- **Spec coverage (§2.1):** verbatim English description + Arabic grammar label (Tasks 3,4,6) ✓; structured features/segments (Tasks 5,6) ✓; root→dictionary link (Tasks 6,7) ✓; quick sheet + full detail route (Tasks 4,7) ✓; concept tags non-clickable (Task 6) ✓.
- **Placeholders:** none — full code/commands per step. Gloss on detail route noted as optional-additive (not a gap; §2.1 quick-sheet gloss already ships).
- **Type consistency:** `WordDetail{word,segments,concept_tags}`, `WordSegment`, `wordHref`/`WordLoc`, `rootHref=/dictionary/<buckwalter>` consistent across tasks and with 06a exports.

## Execution Handoff

Per CLAUDE.md §13 (Sonnet+ floor, compact between tasks): **Subagent-Driven** recommended, or **Inline**. Greptile ≥4/5 before each commit; final gate in Task 8.
