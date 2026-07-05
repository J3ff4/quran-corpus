# Phase 08f — Word-by-Word Page + Verse Picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a dedicated per-surah word-by-word page (`/surah/[id]/words`) with server-side `?page=N` pagination, plus a global verse picker (Home + SearchSheet) that jumps to any ayah on that page.

**Architecture:** RSC resolves the page window server-side, fetches only that ayah range's words (new windowed query), joins glosses + POS labels, serializes bounded cell data to mostly-server components. Only client JS = a thin scroll-to-anchor + the picker. Reader (mushaf) flow untouched.

**Tech Stack:** Next.js 15 App Router (RSC), TypeScript, Tailwind, libSQL/Turso via `@quran-corpus/data`, Vitest + Testing Library.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-05-phase-08f-wbw-and-verse-picker-design.md`.
- `PAGE_SIZE = 15` ayahs/page (exact, shared const).
- `packages/data` stays Next-free (portable). No web imports there.
- DRY/SOLID/OWASP (CLAUDE.md §3): validate all route inputs; no duplicated logic; POS decode = one code path (`packages/data`).
- English gloss only on WbW cells (`language_code = 'en'`).
- Deep-link precedence: `?ayah` beats `?page`.
- Greptile 5/5 hard block (CLAUDE.md §5) before merge.
- Conventional Commits; `git add` explicit paths (never `-A`); never commit `STATUS.md` / untracked scraper artifacts.
- Test cmds: `packages/data` → `pnpm --filter @quran-corpus/data test`; web → `pnpm --filter web test` (script `vitest run`).
- No Playwright infra in repo → e2e smoke deferred; acceptance covered by component/data tests + a live-DB manual check (final task).

---

### Task 1: `getWordsBySurahAyahRange` query

**Files:**
- Modify: `packages/data/src/queries/words.ts` (add fn + it uses existing `rowToWord`)
- Modify: `packages/data/src/index.ts` (export)
- Test: `packages/data/tests/words.test.ts` (add describe block)

**Interfaces:**
- Consumes: existing `rowToWord`, `Client`.
- Produces: `getWordsBySurahAyahRange(db: Client, surahId: number, loAyah: number, hiAyah: number): Promise<Word[]>` — words whose ayah_number ∈ [lo,hi], ordered ayah_number then position.

- [ ] **Step 1: Write failing test** — append to `packages/data/tests/words.test.ts`. Existing seed has surah 1, one ayah (number 1) with 3 words. Add a second ayah + word so range filtering is observable.

```ts
describe('getWordsBySurahAyahRange', () => {
  it('returns only words within the ayah range, ordered', async () => {
    // add ayah 2 with one word (seed in beforeAll has only ayah 1)
    const r = await db.execute({
      sql: `INSERT INTO ayahs (surah_id, ayah_number, text_uthmani)
            VALUES (1, 2, 'قُلْ') RETURNING id`,
      args: [],
    });
    const ayah2Id = r.rows[0]?.['id'] as number;
    await db.execute({
      sql: `INSERT INTO words (ayah_id, position, text_arabic, transliteration, pos_tag)
            VALUES (?, 1, 'قُلْ', 'qul', 'V')`,
      args: [ayah2Id],
    });

    const only1 = await getWordsBySurahAyahRange(db, 1, 1, 1);
    expect(only1).toHaveLength(3);

    const only2 = await getWordsBySurahAyahRange(db, 1, 2, 2);
    expect(only2.map((w) => w.text_arabic)).toEqual(['قُلْ']);

    const both = await getWordsBySurahAyahRange(db, 1, 1, 2);
    expect(both).toHaveLength(4);
    // ordered ayah then position: ayah1 pos1..3, then ayah2 pos1
    expect(both.map((w) => w.position)).toEqual([1, 2, 3, 1]);
  });

  it('returns empty array for an out-of-range window', async () => {
    expect(await getWordsBySurahAyahRange(db, 1, 50, 60)).toHaveLength(0);
  });
});
```

Add `getWordsBySurahAyahRange` to the import at the top of the test file.

- [ ] **Step 2: Run — expect FAIL** (`getWordsBySurahAyahRange is not a function`)

Run: `pnpm --filter @quran-corpus/data test -- words`
Expected: FAIL

- [ ] **Step 3: Implement** — add to `packages/data/src/queries/words.ts` after `getWordsBySurah`:

```ts
export async function getWordsBySurahAyahRange(
  db: Client,
  surahId: number,
  loAyah: number,
  hiAyah: number,
): Promise<Word[]> {
  const result = await db.execute({
    sql: `SELECT w.*
          FROM words w
          JOIN ayahs a ON a.id = w.ayah_id
          WHERE a.surah_id = ? AND a.ayah_number BETWEEN ? AND ?
          ORDER BY a.ayah_number, w.position`,
    args: [surahId, loAyah, hiAyah],
  });
  return result.rows.map(rowToWord);
}
```

Add to `packages/data/src/index.ts` words export block:

```ts
export {
  getWordsByAyah,
  getWordsBySurah,
  getWordsBySurahAyahRange,
  getWordByLocation,
  getWordDetail,
} from './queries/words.js';
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter @quran-corpus/data test -- words`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/data/src/queries/words.ts packages/data/src/index.ts packages/data/tests/words.test.ts
git commit -m "feat(data): add getWordsBySurahAyahRange windowed query"
```

---

### Task 2: `posLabelEn` word-level POS decode

**Files:**
- Modify: `packages/data/src/morphology/decode.ts` (add fn, reuse `POS_LABELS`)
- Modify: `packages/data/src/index.ts` (export)
- Test: `packages/data/tests/morphology-decode.test.ts` (add cases)

**Interfaces:**
- Consumes: existing `POS_LABELS` (already imported in decode.ts).
- Produces: `posLabelEn(tag: string | null | undefined): string | null` — English POS label; unknown non-empty tag → raw tag; null/empty → null. Same tag source as `SegmentCard` (one code path).

- [ ] **Step 1: Write failing test** — append to `packages/data/tests/morphology-decode.test.ts` (add `posLabelEn` to its import from `../src/morphology/decode.js`):

```ts
describe('posLabelEn', () => {
  it('maps a known POS code to its English label', () => {
    expect(posLabelEn('N')).toBe('Noun');
    expect(posLabelEn('V')).toBe('Verb');
  });
  it('returns the raw code for an unknown tag', () => {
    expect(posLabelEn('ZZZ')).toBe('ZZZ');
  });
  it('returns null for null/empty', () => {
    expect(posLabelEn(null)).toBeNull();
    expect(posLabelEn(undefined)).toBeNull();
    expect(posLabelEn('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @quran-corpus/data test -- morphology-decode`
Expected: FAIL

- [ ] **Step 3: Implement** — add to `packages/data/src/morphology/decode.ts`:

```ts
/**
 * English POS label for a word-level pos_tag. Same table as decodeSegment
 * (one source of truth). Unknown non-empty tag → raw tag; null/empty → null
 * (caller hides the chip).
 */
export function posLabelEn(tag: string | null | undefined): string | null {
  if (!tag) return null;
  return POS_LABELS[tag]?.en ?? tag;
}
```

Add to `packages/data/src/index.ts`:

```ts
export { decodeSegment, posLabelEn } from './morphology/decode.js';
```

(Replace the existing `export { decodeSegment } ...` line.)

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter @quran-corpus/data test -- morphology-decode`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/data/src/morphology/decode.ts packages/data/src/index.ts packages/data/tests/morphology-decode.test.ts
git commit -m "feat(data): add posLabelEn word-level POS decoder"
```

---

### Task 3: Route params — `parseSurahId` + `resolvePage`

**Files:**
- Create: `apps/web/src/app/surah/[id]/words/params.ts`
- Test: `apps/web/src/test/wbw-params.test.ts`

**Interfaces:**
- Produces:
  - `PAGE_SIZE = 15`
  - `parseSurahId(p: { id: string }): number | null`
  - `interface PageResolution { page: number; lo: number; hi: number; scrollAyah: number | null; totalPages: number }`
  - `resolvePage(ayahCount: number, rawPage: string | undefined, rawAyah: string | undefined): PageResolution`
- Rules: `?ayah` valid 1..ayahCount → its page + scrollAyah; else `?page` clamped 1..totalPages, scrollAyah null. `lo=(page-1)*PAGE_SIZE+1`, `hi=min(page*PAGE_SIZE, ayahCount)`.

- [ ] **Step 1: Write failing test** — `apps/web/src/test/wbw-params.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseSurahId, resolvePage, PAGE_SIZE } from '../app/surah/[id]/words/params';

describe('parseSurahId', () => {
  it('accepts 1..114', () => {
    expect(parseSurahId({ id: '1' })).toBe(1);
    expect(parseSurahId({ id: '114' })).toBe(114);
  });
  it('rejects non-digits and out-of-range', () => {
    expect(parseSurahId({ id: '0' })).toBeNull();
    expect(parseSurahId({ id: '115' })).toBeNull();
    expect(parseSurahId({ id: '1e2' })).toBeNull();
    expect(parseSurahId({ id: 'x' })).toBeNull();
  });
});

describe('resolvePage', () => {
  it('PAGE_SIZE is 15', () => expect(PAGE_SIZE).toBe(15));

  it('defaults to page 1 when no params', () => {
    const r = resolvePage(7, undefined, undefined);
    expect(r).toEqual({ page: 1, lo: 1, hi: 7, scrollAyah: null, totalPages: 1 });
  });

  it('clamps ?page to totalPages', () => {
    // 286 ayahs → ceil(286/15)=20 pages
    const r = resolvePage(286, '99', undefined);
    expect(r.page).toBe(20);
    expect(r.lo).toBe(286); // (20-1)*15+1
    expect(r.hi).toBe(286);
    expect(r.totalPages).toBe(20);
  });

  it('clamps bad ?page to 1', () => {
    expect(resolvePage(286, 'abc', undefined).page).toBe(1);
    expect(resolvePage(286, '0', undefined).page).toBe(1);
  });

  it('?ayah resolves to its page and sets scrollAyah', () => {
    const r = resolvePage(286, undefined, '255'); // ceil(255/15)=17
    expect(r.page).toBe(17);
    expect(r.scrollAyah).toBe(255);
    expect(r.lo).toBe(241); // (17-1)*15+1
    expect(r.hi).toBe(255); // min(17*15=255, 286)
  });

  it('?ayah beats ?page when both present', () => {
    const r = resolvePage(286, '1', '255');
    expect(r.page).toBe(17);
    expect(r.scrollAyah).toBe(255);
  });

  it('out-of-range ?ayah is ignored (no scroll, page 1)', () => {
    const r = resolvePage(7, undefined, '99');
    expect(r.page).toBe(1);
    expect(r.scrollAyah).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter web test -- wbw-params`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement** — `apps/web/src/app/surah/[id]/words/params.ts`:

```ts
// Kept out of page.tsx: Next route modules may only export reserved names.
// This sibling holds the pure, unit-tested param logic (page + its test import it).

export const PAGE_SIZE = 15;

export function parseSurahId(p: { id: string }): number | null {
  if (!/^\d+$/.test(p.id)) return null;
  const n = Number(p.id);
  return n >= 1 && n <= 114 ? n : null;
}

export interface PageResolution {
  page: number;
  lo: number;
  hi: number;
  scrollAyah: number | null;
  totalPages: number;
}

export function resolvePage(
  ayahCount: number,
  rawPage: string | undefined,
  rawAyah: string | undefined,
): PageResolution {
  const totalPages = Math.max(1, Math.ceil(ayahCount / PAGE_SIZE));

  let page: number;
  let scrollAyah: number | null = null;

  const ayahNum = rawAyah !== undefined && /^\d+$/.test(rawAyah) ? Number(rawAyah) : NaN;
  if (Number.isInteger(ayahNum) && ayahNum >= 1 && ayahNum <= ayahCount) {
    page = Math.ceil(ayahNum / PAGE_SIZE);
    scrollAyah = ayahNum;
  } else {
    const p = rawPage !== undefined && /^\d+$/.test(rawPage) ? Number(rawPage) : 1;
    page = Math.min(Math.max(p, 1), totalPages);
  }

  const lo = (page - 1) * PAGE_SIZE + 1;
  const hi = Math.min(page * PAGE_SIZE, ayahCount);
  return { page, lo, hi, scrollAyah, totalPages };
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter web test -- wbw-params`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/surah/[id]/words/params.ts" apps/web/src/test/wbw-params.test.ts
git commit -m "feat(web): add WbW route param + page-window resolver"
```

---

### Task 4: WbW shared types + `GET /api/surahs`

**Files:**
- Create: `apps/web/src/components/wbw/types.ts`
- Create: `apps/web/src/app/api/surahs/route.ts`
- Test: `apps/web/src/test/api-surahs.test.ts`

**Interfaces:**
- Produces (types.ts):
  - `interface PickerSurah { id: number; name_translit: string; ayah_count: number }`
  - `interface WbwCell { surahId: number; ayahNumber: number; position: number; arabic: string; translit: string | null; gloss: string | null; posLabel: string | null }`
  - `interface WbwAyah { ayahNumber: number; cells: WbwCell[]; textUthmani: string }`
- Produces (route): `GET` returns `PickerSurah[]` (JSON); DB error → 500 `{ error: string }`.

- [ ] **Step 1: Create types** — `apps/web/src/components/wbw/types.ts`:

```ts
export interface PickerSurah {
  id: number;
  name_translit: string;
  ayah_count: number;
}

export interface WbwCell {
  surahId: number;
  ayahNumber: number;
  position: number;
  arabic: string;
  translit: string | null;
  gloss: string | null;
  posLabel: string | null;
}

export interface WbwAyah {
  ayahNumber: number;
  cells: WbwCell[];
  textUthmani: string;
}
```

- [ ] **Step 2: Write failing test** — `apps/web/src/test/api-surahs.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

const surahsStub = [
  { id: 1, name_arabic: 'الفاتحة', name_translit: 'Al-Fatihah', name_translation: 'The Opening', revelation_type: 'meccan', ayah_count: 7, order_number: 1 },
  { id: 2, name_arabic: 'البقرة', name_translit: 'Al-Baqarah', name_translation: 'The Cow', revelation_type: 'medinan', ayah_count: 286, order_number: 2 },
];

vi.mock('../lib/db', () => ({ getDatabase: vi.fn(async () => ({})) }));
vi.mock('@quran-corpus/data', () => ({ getAllSurahs: vi.fn(async () => surahsStub) }));

import { GET } from '../app/api/surahs/route';

describe('GET /api/surahs', () => {
  it('returns only {id,name_translit,ayah_count}', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([
      { id: 1, name_translit: 'Al-Fatihah', ayah_count: 7 },
      { id: 2, name_translit: 'Al-Baqarah', ayah_count: 286 },
    ]);
  });

  it('returns 500 JSON when the DB throws', async () => {
    const data = await import('@quran-corpus/data');
    vi.mocked(data.getAllSurahs).mockRejectedValueOnce(new Error('boom'));
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to load surahs' });
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

Run: `pnpm --filter web test -- api-surahs`
Expected: FAIL (route module not found)

- [ ] **Step 4: Implement** — `apps/web/src/app/api/surahs/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getAllSurahs } from '@quran-corpus/data';
import { getDatabase } from '../../../lib/db';
import type { PickerSurah } from '../../../components/wbw/types';

// Static Quran metadata (114 rows) — safe to cache hard.
export const revalidate = false;

export async function GET(): Promise<Response> {
  try {
    const db = await getDatabase();
    const surahs = await getAllSurahs(db);
    const out: PickerSurah[] = surahs.map((s) => ({
      id: s.id,
      name_translit: s.name_translit,
      ayah_count: s.ayah_count,
    }));
    return NextResponse.json(out, {
      headers: { 'Cache-Control': 'public, max-age=86400, immutable' },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load surahs' }, { status: 500 });
  }
}
```

- [ ] **Step 5: Run — expect PASS**

Run: `pnpm --filter web test -- api-surahs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/wbw/types.ts apps/web/src/app/api/surahs/route.ts apps/web/src/test/api-surahs.test.ts
git commit -m "feat(web): add /api/surahs endpoint + WbW shared types"
```

---

### Task 5: Shared `chip` class + `WbwWordCell`

**Files:**
- Create: `apps/web/src/components/ui/chip.ts`
- Modify: `apps/web/src/components/morphology/SegmentCard.tsx` (import shared `chip`, drop local const)
- Create: `apps/web/src/components/wbw/WbwWordCell.tsx`
- Test: `apps/web/src/test/WbwWordCell.test.tsx`

**Interfaces:**
- Consumes: `WbwCell` (Task 4).
- Produces: `chip` (string), `WbwWordCell({ cell }: { cell: WbwCell })`.

- [ ] **Step 1: Extract shared chip** — `apps/web/src/components/ui/chip.ts`:

```ts
// Shared pill class (POS/feature chips). Single source so SegmentCard and the
// WbW cell can't drift. Not a new design token — same paper/night tokens.
export const chip =
  'rounded-full bg-paper-200 px-2.5 py-0.5 text-xs text-paper-700 dark:bg-night-100 dark:text-paper-300';
```

In `apps/web/src/components/morphology/SegmentCard.tsx`, delete the local `const chip = ...` and add at top:

```ts
import { chip } from '../ui/chip';
```

(Leave all `chip` usages unchanged. Existing SegmentCard test must still pass — verify in Step 5.)

- [ ] **Step 2: Write failing test** — `apps/web/src/test/WbwWordCell.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WbwWordCell } from '../components/wbw/WbwWordCell';
import type { WbwCell } from '../components/wbw/types';

function cell(over: Partial<WbwCell> = {}): WbwCell {
  return {
    surahId: 1, ayahNumber: 1, position: 1,
    arabic: 'بِسْمِ', translit: "bis'mi", gloss: 'In (the) name', posLabel: 'Preposition',
    ...over,
  };
}

describe('WbwWordCell', () => {
  it('renders arabic, translit, gloss, POS label', () => {
    render(<WbwWordCell cell={cell()} />);
    expect(screen.getByText('بِسْمِ')).toBeInTheDocument();
    expect(screen.getByText("bis'mi")).toBeInTheDocument();
    expect(screen.getByText('In (the) name')).toBeInTheDocument();
    expect(screen.getByText('Preposition')).toBeInTheDocument();
  });

  it('links to the word detail page', () => {
    render(<WbwWordCell cell={cell({ surahId: 2, ayahNumber: 255, position: 1 })} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/word/2/255/1');
  });

  it('shows em dash for null translit/gloss and hides chip when posLabel null', () => {
    render(<WbwWordCell cell={cell({ translit: null, gloss: null, posLabel: null })} />);
    expect(screen.getAllByText('—').length).toBe(2);
    expect(screen.queryByText('Preposition')).toBeNull();
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

Run: `pnpm --filter web test -- WbwWordCell`
Expected: FAIL

- [ ] **Step 4: Implement** — `apps/web/src/components/wbw/WbwWordCell.tsx`:

```tsx
import Link from 'next/link';
import { chip } from '../ui/chip';
import type { WbwCell } from './types';

export function WbwWordCell({ cell }: { cell: WbwCell }) {
  const { surahId, ayahNumber, position, arabic, translit, gloss, posLabel } = cell;
  return (
    <Link
      href={`/word/${surahId}/${ayahNumber}/${position}`}
      className="flex min-w-[4.5rem] flex-col items-center gap-1 rounded-xl border border-paper-200 px-3 py-2 text-center transition-colors hover:bg-paper-100 dark:border-night-100 dark:hover:bg-night-200"
    >
      <span className="font-arabic text-2xl leading-tight text-paper-900 dark:text-paper-100" dir="rtl">
        {arabic}
      </span>
      <span className="text-xs text-paper-500 dark:text-paper-400">{translit ?? '—'}</span>
      <span className="text-xs text-paper-700 dark:text-paper-300">{gloss ?? '—'}</span>
      {posLabel && <span className={chip}>{posLabel}</span>}
    </Link>
  );
}
```

- [ ] **Step 5: Run — expect PASS** (both WbwWordCell and unchanged SegmentCard)

Run: `pnpm --filter web test -- WbwWordCell SegmentCard`
Expected: PASS (SegmentCard still green after chip extraction)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/ui/chip.ts apps/web/src/components/morphology/SegmentCard.tsx apps/web/src/components/wbw/WbwWordCell.tsx apps/web/src/test/WbwWordCell.test.tsx
git commit -m "feat(web): add WbwWordCell + extract shared chip class"
```

---

### Task 6: `WbwAyahBlock`

**Files:**
- Create: `apps/web/src/components/wbw/WbwAyahBlock.tsx`
- Test: `apps/web/src/test/WbwAyahBlock.test.tsx`

**Interfaces:**
- Consumes: `WbwAyah`, `WbwWordCell`.
- Produces: `WbwAyahBlock({ ayah }: { ayah: WbwAyah })` — element with `id="ayah-${n}"`, ayah-number badge, RTL flex-wrap of cells; empty cells → `text_uthmani` fallback.

- [ ] **Step 1: Write failing test** — `apps/web/src/test/WbwAyahBlock.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WbwAyahBlock } from '../components/wbw/WbwAyahBlock';
import type { WbwAyah } from '../components/wbw/types';

const c = (position: number, arabic: string) => ({
  surahId: 1, ayahNumber: 3, position, arabic, translit: 't', gloss: 'g', posLabel: 'Noun',
});

describe('WbwAyahBlock', () => {
  it('has scroll anchor id and renders cells', () => {
    const ayah: WbwAyah = { ayahNumber: 3, cells: [c(1, 'الف'), c(2, 'باء')], textUthmani: 'x' };
    const { container } = render(<WbwAyahBlock ayah={ayah} />);
    expect(container.querySelector('#ayah-3')).not.toBeNull();
    expect(screen.getByText('الف')).toBeInTheDocument();
    expect(screen.getByText('باء')).toBeInTheDocument();
  });

  it('falls back to text_uthmani when the ayah has no words', () => {
    const ayah: WbwAyah = { ayahNumber: 4, cells: [], textUthmani: 'نَصُّ الآية' };
    render(<WbwAyahBlock ayah={ayah} />);
    expect(screen.getByText('نَصُّ الآية')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter web test -- WbwAyahBlock`
Expected: FAIL

- [ ] **Step 3: Implement** — `apps/web/src/components/wbw/WbwAyahBlock.tsx`:

```tsx
import { WbwWordCell } from './WbwWordCell';
import type { WbwAyah } from './types';

export function WbwAyahBlock({ ayah }: { ayah: WbwAyah }) {
  return (
    <section id={`ayah-${ayah.ayahNumber}`} className="scroll-mt-20 border-b border-paper-200 py-5 dark:border-night-100">
      <span className="mb-3 inline-block rounded-full bg-paper-100 px-2.5 py-0.5 text-xs font-medium text-paper-500 dark:bg-night-200 dark:text-paper-400">
        {ayah.ayahNumber}
      </span>
      {ayah.cells.length > 0 ? (
        <div className="flex flex-row-reverse flex-wrap gap-2" dir="rtl">
          {ayah.cells.map((cell) => (
            <WbwWordCell key={cell.position} cell={cell} />
          ))}
        </div>
      ) : (
        <p className="font-arabic text-2xl leading-loose text-paper-900 dark:text-paper-100" dir="rtl">
          {ayah.textUthmani}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter web test -- WbwAyahBlock`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/wbw/WbwAyahBlock.tsx apps/web/src/test/WbwAyahBlock.test.tsx
git commit -m "feat(web): add WbwAyahBlock with scroll anchor + fallback"
```

---

### Task 7: `Pager`

**Files:**
- Create: `apps/web/src/components/wbw/Pager.tsx`
- Test: `apps/web/src/test/Pager.test.tsx`

**Interfaces:**
- Produces: `Pager({ surahId, page, totalPages }: { surahId: number; page: number; totalPages: number })` — Prev/Next `next/link` to `?page=N`, disabled/omitted at ends, "Page N / M"; renders nothing when `totalPages === 1`.

- [ ] **Step 1: Write failing test** — `apps/web/src/test/Pager.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Pager } from '../components/wbw/Pager';

describe('Pager', () => {
  it('renders nothing for a single-page surah', () => {
    const { container } = render(<Pager surahId={1} page={1} totalPages={1} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows Next but not Prev on the first page', () => {
    render(<Pager surahId={2} page={1} totalPages={20} />);
    expect(screen.getByText('Page 1 / 20')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /next/i })).toHaveAttribute('href', '/surah/2/words?page=2');
    expect(screen.queryByRole('link', { name: /prev/i })).toBeNull();
  });

  it('shows Prev but not Next on the last page', () => {
    render(<Pager surahId={2} page={20} totalPages={20} />);
    expect(screen.getByRole('link', { name: /prev/i })).toHaveAttribute('href', '/surah/2/words?page=19');
    expect(screen.queryByRole('link', { name: /next/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter web test -- Pager`
Expected: FAIL

- [ ] **Step 3: Implement** — `apps/web/src/components/wbw/Pager.tsx`:

```tsx
import Link from 'next/link';

export function Pager({ surahId, page, totalPages }: { surahId: number; page: number; totalPages: number }) {
  if (totalPages <= 1) return null;
  const link = 'rounded-lg border border-paper-200 px-4 py-2 text-sm text-paper-700 transition-colors hover:bg-paper-100 dark:border-night-100 dark:text-paper-300 dark:hover:bg-night-200';
  return (
    <nav className="mt-6 flex items-center justify-between" aria-label="Word-by-word pages">
      {page > 1 ? (
        <Link href={`/surah/${surahId}/words?page=${page - 1}`} className={link} rel="prev">
          ← Prev
        </Link>
      ) : (
        <span />
      )}
      <span className="text-sm text-paper-500 dark:text-paper-400">
        Page {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <Link href={`/surah/${surahId}/words?page=${page + 1}`} className={link} rel="next">
          Next →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter web test -- Pager`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/wbw/Pager.tsx apps/web/src/test/Pager.test.tsx
git commit -m "feat(web): add WbW Pager (server-side page nav)"
```

---

### Task 8: `ScrollToAyah`

**Files:**
- Create: `apps/web/src/components/wbw/ScrollToAyah.tsx`
- Test: `apps/web/src/test/ScrollToAyah.test.tsx`

**Interfaces:**
- Produces: `ScrollToAyah({ ayah }: { ayah: number })` — `'use client'`, renders null; on mount scrolls `#ayah-${ayah}` into view (`smooth`/`auto` per `useReducedMotion`).

- [ ] **Step 1: Write failing test** — `apps/web/src/test/ScrollToAyah.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('framer-motion', () => ({ useReducedMotion: () => false }));

import { ScrollToAyah } from '../components/wbw/ScrollToAyah';

describe('ScrollToAyah', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('scrolls the matching anchor into view on mount', () => {
    const el = document.createElement('div');
    el.id = 'ayah-255';
    const scrollSpy = vi.fn();
    (el as unknown as { scrollIntoView: () => void }).scrollIntoView = scrollSpy;
    document.body.appendChild(el);

    render(<ScrollToAyah ayah={255} />);
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    el.remove();
  });

  it('does nothing when the anchor is absent', () => {
    expect(() => render(<ScrollToAyah ayah={999} />)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter web test -- ScrollToAyah`
Expected: FAIL

- [ ] **Step 3: Implement** — `apps/web/src/components/wbw/ScrollToAyah.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { useReducedMotion } from 'framer-motion';

export function ScrollToAyah({ ayah }: { ayah: number }) {
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = document.getElementById(`ayah-${ayah}`);
    el?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, [ayah, reduce]);
  return null;
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter web test -- ScrollToAyah`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/wbw/ScrollToAyah.tsx apps/web/src/test/ScrollToAyah.test.tsx
git commit -m "feat(web): add ScrollToAyah deep-link scroller"
```

---

### Task 9: `WbwView` (compose) + `page.tsx` (wire server-side)

**Files:**
- Create: `apps/web/src/components/wbw/WbwView.tsx`
- Create: `apps/web/src/app/surah/[id]/words/page.tsx`
- Test: `apps/web/src/test/WbwView.test.tsx`

**Interfaces:**
- Consumes: `WbwAyahBlock`, `Pager`, `ScrollToAyah`, `Surah`, `WbwAyah`; from Task 1/2 `getWordsBySurahAyahRange`, `posLabelEn`; existing `getSurahById`, `getAyahsBySurah`, `getGlossesBySurahAndLang`, `getDatabase`; from Task 3 `parseSurahId`, `resolvePage`.
- Produces: `WbwView({ surah, ayahs, page, totalPages, scrollAyah })`; the route page (default export, `dynamic='force-dynamic'`).

- [ ] **Step 1: Write failing test** (WbwView only — page.tsx is DB-wired, verified in the final live-DB task) — `apps/web/src/test/WbwView.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WbwView } from '../components/wbw/WbwView';
import type { WbwAyah } from '../components/wbw/types';
import type { Surah } from '@quran-corpus/data';

const surah: Surah = {
  id: 1, name_arabic: 'الفاتحة', name_translit: 'Al-Fatihah', name_translation: 'The Opening',
  revelation_type: 'meccan', ayah_count: 7, order_number: 1,
};
const ayahs: WbwAyah[] = [
  { ayahNumber: 1, cells: [{ surahId: 1, ayahNumber: 1, position: 1, arabic: 'بِسْمِ', translit: "bis'mi", gloss: 'In (the) name', posLabel: 'Preposition' }], textUthmani: 'x' },
];

describe('WbwView', () => {
  it('renders surah name, a back-to-reader link, and ayah blocks', () => {
    render(<WbwView surah={surah} ayahs={ayahs} page={1} totalPages={1} scrollAyah={null} />);
    expect(screen.getByText('Al-Fatihah')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /read/i })).toHaveAttribute('href', '/surah/1');
    expect(screen.getByText('بِسْمِ')).toBeInTheDocument();
  });

  it('omits the Pager for a single page', () => {
    render(<WbwView surah={surah} ayahs={ayahs} page={1} totalPages={1} scrollAyah={null} />);
    expect(screen.queryByText(/Page 1 \//)).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter web test -- WbwView`
Expected: FAIL

- [ ] **Step 3: Implement `WbwView`** — `apps/web/src/components/wbw/WbwView.tsx`:

```tsx
import Link from 'next/link';
import type { Surah } from '@quran-corpus/data';
import { WbwAyahBlock } from './WbwAyahBlock';
import { Pager } from './Pager';
import { ScrollToAyah } from './ScrollToAyah';
import type { WbwAyah } from './types';

interface WbwViewProps {
  surah: Surah;
  ayahs: WbwAyah[];
  page: number;
  totalPages: number;
  scrollAyah: number | null;
}

export function WbwView({ surah, ayahs, page, totalPages, scrollAyah }: WbwViewProps) {
  return (
    <div>
      <header className="mb-4 text-center">
        <p className="font-arabic text-3xl text-paper-900 dark:text-paper-100">{surah.name_arabic}</p>
        <p className="text-paper-500">{surah.name_translit} · word by word</p>
        <Link
          href={`/surah/${surah.id}`}
          className="mt-2 inline-block text-sm text-paper-600 hover:text-paper-900 dark:text-paper-400 dark:hover:text-paper-100"
        >
          ← Read (mushaf)
        </Link>
      </header>

      {ayahs.map((ayah) => (
        <WbwAyahBlock key={ayah.ayahNumber} ayah={ayah} />
      ))}

      <Pager surahId={surah.id} page={page} totalPages={totalPages} />
      {scrollAyah != null && <ScrollToAyah ayah={scrollAyah} />}
    </div>
  );
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter web test -- WbwView`
Expected: PASS

- [ ] **Step 5: Implement `page.tsx`** — `apps/web/src/app/surah/[id]/words/page.tsx`:

```tsx
export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { getDatabase } from '../../../../lib/db';
import {
  getSurahById,
  getAyahsBySurah,
  getWordsBySurahAyahRange,
  getGlossesBySurahAndLang,
  posLabelEn,
} from '@quran-corpus/data';
import { WbwView } from '../../../../components/wbw/WbwView';
import type { WbwCell, WbwAyah } from '../../../../components/wbw/types';
import { parseSurahId, resolvePage } from './params';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; ayah?: string }>;
}

export default async function WbwPage({ params, searchParams }: PageProps) {
  const surahId = parseSurahId(await params);
  if (surahId == null) notFound();
  const { page: rawPage, ayah: rawAyah } = await searchParams;

  const db = await getDatabase();
  const surah = await getSurahById(db, surahId);
  if (!surah) notFound();

  const { page, lo, hi, scrollAyah, totalPages } = resolvePage(surah.ayah_count, rawPage, rawAyah);

  const [ayahRows, words, glosses] = await Promise.all([
    getAyahsBySurah(db, surahId),
    getWordsBySurahAyahRange(db, surahId, lo, hi),
    getGlossesBySurahAndLang(db, surahId, 'en'),
  ]);

  const glossByWordId = new Map<number, string>();
  for (const g of glosses) glossByWordId.set(g.word_id, g.gloss_text);

  const numberByAyahId = new Map<number, number>();
  const uthmaniByNumber = new Map<number, string>();
  for (const a of ayahRows) {
    numberByAyahId.set(a.id, a.ayah_number);
    uthmaniByNumber.set(a.ayah_number, a.text_uthmani);
  }

  const cellsByNumber = new Map<number, WbwCell[]>();
  for (const w of words) {
    const ayahNumber = numberByAyahId.get(w.ayah_id);
    if (ayahNumber == null) continue;
    let arr = cellsByNumber.get(ayahNumber);
    if (!arr) {
      arr = [];
      cellsByNumber.set(ayahNumber, arr);
    }
    arr.push({
      surahId,
      ayahNumber,
      position: w.position,
      arabic: w.text_arabic,
      translit: w.transliteration,
      gloss: glossByWordId.get(w.id) ?? null,
      posLabel: posLabelEn(w.pos_tag),
    });
  }

  const ayahs: WbwAyah[] = [];
  for (let n = lo; n <= hi; n++) {
    ayahs.push({
      ayahNumber: n,
      cells: cellsByNumber.get(n) ?? [],
      textUthmani: uthmaniByNumber.get(n) ?? '',
    });
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <WbwView surah={surah} ayahs={ayahs} page={page} totalPages={totalPages} scrollAyah={scrollAyah} />
    </main>
  );
}
```

- [ ] **Step 6: Type-check + lint the new page/component**

Run: `pnpm --filter web type-check && pnpm --filter web lint`
Expected: PASS (no errors)

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/wbw/WbwView.tsx "apps/web/src/app/surah/[id]/words/page.tsx" apps/web/src/test/WbwView.test.tsx
git commit -m "feat(web): add WbW page route + WbwView composition"
```

---

### Task 10: `VersePicker`

**Files:**
- Create: `apps/web/src/components/wbw/VersePicker.tsx`
- Test: `apps/web/src/test/VersePicker.test.tsx`

**Interfaces:**
- Consumes: `PickerSurah` (Task 4).
- Produces: `VersePicker({ surahs }: { surahs: PickerSurah[] })` — `'use client'`; two `<select>` (surah → ayah, ayah options 1..ayah_count rebuilt + reset to 1 on surah change); "Go" → `router.push('/surah/${sid}/words?ayah=${ayah}')`.

- [ ] **Step 1: Write failing test** — `apps/web/src/test/VersePicker.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

import { VersePicker } from '../components/wbw/VersePicker';

const surahs = [
  { id: 1, name_translit: 'Al-Fatihah', ayah_count: 7 },
  { id: 2, name_translit: 'Al-Baqarah', ayah_count: 286 },
];

describe('VersePicker', () => {
  beforeEach(() => mockPush.mockClear());

  it('ayah options track the selected surah count', () => {
    render(<VersePicker surahs={surahs} />);
    const ayahSelect = screen.getByLabelText(/ayah/i);
    expect(within(ayahSelect).getAllByRole('option')).toHaveLength(7); // Fatihah default
    fireEvent.change(screen.getByLabelText(/surah/i), { target: { value: '2' } });
    expect(within(ayahSelect).getAllByRole('option')).toHaveLength(286);
  });

  it('Go pushes /surah/[id]/words?ayah=N', () => {
    render(<VersePicker surahs={surahs} />);
    fireEvent.change(screen.getByLabelText(/surah/i), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/ayah/i), { target: { value: '255' } });
    fireEvent.click(screen.getByRole('button', { name: /go/i }));
    expect(mockPush).toHaveBeenCalledWith('/surah/2/words?ayah=255');
  });

  it('resets ayah to 1 when the surah changes', () => {
    render(<VersePicker surahs={surahs} />);
    fireEvent.change(screen.getByLabelText(/surah/i), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/ayah/i), { target: { value: '255' } });
    fireEvent.change(screen.getByLabelText(/surah/i), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /go/i }));
    expect(mockPush).toHaveBeenCalledWith('/surah/1/words?ayah=1');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter web test -- VersePicker`
Expected: FAIL

- [ ] **Step 3: Implement** — `apps/web/src/components/wbw/VersePicker.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PickerSurah } from './types';

const selectClass =
  'rounded-lg border border-paper-300 bg-paper-50 px-3 py-2 text-paper-900 dark:border-night-100 dark:bg-night-50 dark:text-paper-100';

export function VersePicker({ surahs }: { surahs: PickerSurah[] }) {
  const router = useRouter();
  const [surahId, setSurahId] = useState(surahs[0]?.id ?? 1);
  const [ayah, setAyah] = useState(1);

  const ayahCount = surahs.find((s) => s.id === surahId)?.ayah_count ?? 1;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs text-paper-500 dark:text-paper-400">
        Surah
        <select
          className={selectClass}
          value={surahId}
          onChange={(e) => {
            setSurahId(Number(e.target.value));
            setAyah(1);
          }}
        >
          {surahs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id}. {s.name_translit}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs text-paper-500 dark:text-paper-400">
        Ayah
        <select className={selectClass} value={ayah} onChange={(e) => setAyah(Number(e.target.value))}>
          {Array.from({ length: ayahCount }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={() => router.push(`/surah/${surahId}/words?ayah=${ayah}`)}
        className="rounded-lg bg-paper-900 px-4 py-2 text-sm font-medium text-paper-50 transition-colors hover:bg-paper-700 dark:bg-paper-100 dark:text-night-300 dark:hover:bg-paper-300"
      >
        Go
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter web test -- VersePicker`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/wbw/VersePicker.tsx apps/web/src/test/VersePicker.test.tsx
git commit -m "feat(web): add VersePicker (surah/ayah jump)"
```

---

### Task 11: Home "Go to verse" card

**Files:**
- Modify: `apps/web/src/app/page.tsx`

**Interfaces:**
- Consumes: `getAllSurahs` (already imported), `VersePicker`, `PickerSurah`.

- [ ] **Step 1: Edit** — in `apps/web/src/app/page.tsx` add imports:

```tsx
import { VersePicker } from '../components/wbw/VersePicker';
import type { PickerSurah } from '../components/wbw/types';
```

In `HomePage`, after `const surahs = await getAllSurahs(db);` add:

```tsx
  const pickerSurahs: PickerSurah[] = surahs.map((s) => ({
    id: s.id,
    name_translit: s.name_translit,
    ayah_count: s.ayah_count,
  }));
```

Insert a card just above the existing `{featured.length > 0 && (` section:

```tsx
      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-paper-500 dark:text-paper-400">
          Go to verse
        </h2>
        <VersePicker surahs={pickerSurahs} />
      </section>
```

- [ ] **Step 2: Type-check + lint**

Run: `pnpm --filter web type-check && pnpm --filter web lint`
Expected: PASS

- [ ] **Step 3: Manual smoke (optional but recommended)**

Run: `pnpm --filter web dev` → open `/`, pick Surah 2 / Ayah 255 / Go → lands on `/surah/2/words?ayah=255` scrolled to ayah 255. Ctrl-C after.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat(web): add Go-to-verse picker card to Home"
```

---

### Task 12: SearchSheet "Go to verse" (lazy `/api/surahs`)

**Files:**
- Modify: `apps/web/src/components/search/SearchSheet.tsx`
- Test: `apps/web/src/test/SearchSheet.test.tsx` (create — none exists)

**Interfaces:**
- Consumes: `VersePicker`, `PickerSurah`, `GET /api/surahs`.
- Behavior: on first `open`, fetch `/api/surahs` once (cache in state); mount `<VersePicker>` when loaded; fetch failure → picker omitted (degrade, no crash).

- [ ] **Step 1: Write failing test** — `apps/web/src/test/SearchSheet.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...p }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) => <div {...p}>{children}</div>,
  },
  useReducedMotion: () => true,
}));

import { SearchSheet } from '../components/search/SearchSheet';

const surahs = [{ id: 1, name_translit: 'Al-Fatihah', ayah_count: 7 }];

describe('SearchSheet verse picker', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => surahs })) as unknown as typeof fetch;
  });
  afterEach(() => vi.restoreAllMocks());

  it('fetches /api/surahs on open and shows the picker', async () => {
    render(<SearchSheet open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByLabelText(/surah/i)).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith('/api/surahs');
  });

  it('does not fetch when closed', () => {
    render(<SearchSheet open={false} onClose={() => {}} />);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter web test -- SearchSheet`
Expected: FAIL

- [ ] **Step 3: Implement** — in `apps/web/src/components/search/SearchSheet.tsx`:

Add imports:

```tsx
import { VersePicker } from '../wbw/VersePicker';
import type { PickerSurah } from '../wbw/types';
```

Add state near the other `useState`:

```tsx
  const [surahs, setSurahs] = useState<PickerSurah[] | null>(null);
```

Add an effect (fetch once on first open):

```tsx
  // Lazy-load the surah list the first time the sheet opens (cached after).
  useEffect(() => {
    if (!open || surahs !== null) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/surahs');
        if (!res.ok) return;
        const data = (await res.json()) as PickerSurah[];
        if (alive) setSurahs(data);
      } catch {
        // Network/DB error — picker stays hidden, search still works.
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, surahs]);
```

Render the picker inside the sheet, just above the search `<input>` row (after the opening `<motion.div role="dialog" ...>` block's first child). Insert:

```tsx
            {surahs && (
              <div className="mb-4 border-b border-paper-200 pb-4 dark:border-night-100">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-paper-500 dark:text-paper-400">
                  Go to verse
                </p>
                <VersePicker surahs={surahs} />
              </div>
            )}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter web test -- SearchSheet`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/search/SearchSheet.tsx apps/web/src/test/SearchSheet.test.tsx
git commit -m "feat(web): add Go-to-verse picker to SearchSheet"
```

---

### Task 13: Reader cross-link (`SurahHeader`)

**Files:**
- Modify: `apps/web/src/components/reader/SurahHeader.tsx`
- Test: `apps/web/src/test/SurahHeader.test.tsx` (create — none exists)

**Interfaces:**
- Behavior: header gains a "Word by word →" `next/link` to `/surah/${surah.id}/words`.

- [ ] **Step 1: Write failing test** — `apps/web/src/test/SurahHeader.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SurahHeader } from '../components/reader/SurahHeader';
import type { Surah } from '@quran-corpus/data';

const surah: Surah = {
  id: 2, name_arabic: 'البقرة', name_translit: 'Al-Baqarah', name_translation: 'The Cow',
  revelation_type: 'medinan', ayah_count: 286, order_number: 2,
};

describe('SurahHeader', () => {
  it('links to the word-by-word page', () => {
    render(<SurahHeader surah={surah} />);
    expect(screen.getByRole('link', { name: /word by word/i })).toHaveAttribute('href', '/surah/2/words');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter web test -- SurahHeader`
Expected: FAIL

- [ ] **Step 3: Implement** — in `apps/web/src/components/reader/SurahHeader.tsx`, add inside the `<div className="text-center">`, after the `name_translation · … · ayahs` `<p>`:

```tsx
        <Link
          href={`/surah/${surah.id}/words`}
          className="mt-3 inline-block text-sm text-paper-600 hover:text-paper-900 dark:text-paper-400 dark:hover:text-paper-100"
        >
          Word by word →
        </Link>
```

(`Link` is already imported in this file.)

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm --filter web test -- SurahHeader`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/reader/SurahHeader.tsx apps/web/src/test/SurahHeader.test.tsx
git commit -m "feat(web): link reader header to word-by-word page"
```

---

### Task 14: Full gate — lint / type-check / tests / live-DB verify / Greptile

**Files:** none (verification only).

- [ ] **Step 1: Whole-repo quality gate**

Run:
```bash
pnpm --filter @quran-corpus/data test
pnpm --filter web type-check
pnpm --filter web lint
pnpm --filter web test
```
Expected: all PASS, zero type/lint errors.

- [ ] **Step 2: Live-DB manual verification** (validate by alignment + spot-checks, never by row count — memory rule). With the real DB (`apps/web/quran.db` → `/home/claude/quran-data/quran.db`):

Run `pnpm --filter web dev`, then in a browser check:
- `/surah/1/words` → 7 ayah blocks, 29 cells; cell 1:1:1 = arabic بِسْمِ / translit `bis'mi` / gloss "In (the) name" / POS chip. Arabic↔translit↔gloss aligned.
- Tap cell 1:1:1 → `/word/1/1/1` detail loads.
- `/surah/2/words` → page 1 shows ayahs 1..15 only; "Page 1 / 20"; Next → `?page=2` shows 16..30.
- `/surah/2/words?ayah=255` → server-renders page 17, scrolled to ayah 255; cell 2:255:1 = arabic ٱللَّهُ / translit `al-lahu`.
- Home "Go to verse" → Surah 2 / Ayah 255 / Go → same as above.
- `/surah/999/words` → 404. `/surah/2/words?ayah=99999` → page 1, no crash.
- `curl -s localhost:3000/api/surahs | head` → JSON array, first row `{id,name_translit,ayah_count}`; `... | python3 -c "import sys,json;print(len(json.load(sys.stdin)))"` → 114.

Ctrl-C after.

- [ ] **Step 3: Greptile gate (CLAUDE.md §5 — 5/5 hard block)**

Push the branch, open the PR, let the Greptile check run. Address every finding; re-run until 5/5. Do NOT merge below 5/5.

```bash
git push -u origin feat/phase-08f-wbw-verse-picker
gh pr create --fill
```

- [ ] **Step 4: Merge** once green + Greptile 5/5.

---

## Self-Review (spec coverage)

- Dedicated route `/surah/[id]/words`, reader untouched → Tasks 9, 13. ✅
- Server-side `?page=N` windowing, PAGE_SIZE=15 → Tasks 1, 3, 7, 9. ✅
- Cell = Arabic/translit/gloss/POS → `/word/...` → Tasks 5, 2. ✅
- Deep-link `?ayah=N` server-resolved + scroll → Tasks 3, 8, 9. ✅
- Verse picker Home + SearchSheet → Tasks 10, 11, 12. ✅
- `GET /api/surahs` (114 rows shape) → Task 4 (unit) + Task 14 (live 114 count). ✅
- Error/edge (404, clamp, '—', block fallback, /api 500) → Tasks 3,4,5,6. ✅
- Testing §10: data query, WbwWordCell, VersePicker, Pager, ScrollToAyah, resolver, /api/surahs → Tasks 1–13. Playwright e2e **deferred** (no repo infra) → replaced by Task 14 live-DB check.
- POS decode single code path (packages/data) → Task 2. ✅
- Chip reuse (no drift) → Task 5 extraction. ✅

## Deferred / out of scope

- Playwright e2e smoke: repo has no Playwright harness; standing it up is its own phase (CLAUDE.md §10 project goal). Live-DB manual check (Task 14) covers the acceptance flow meanwhile.
- Multi-language gloss on WbW cell (English only), audio on WbW, bottom-nav change → spec non-goals.
