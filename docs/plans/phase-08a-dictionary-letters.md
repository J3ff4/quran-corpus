# Phase 08a — Dictionary Letter Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show Arabic letters (not raw Buckwalter) in the dictionary + word segments, sort roots in Arabic hijā'ī order, add a 3-letter root pill, fix "occurs N times" pluralization.

**Architecture:** One shared, portable text util in `packages/data` (`buckwalterToArabic` + `compareRootsArabic`). `getAllRoots` sorts in JS via that comparator. Three web components stop rendering Buckwalter. Display-only + one query sort change — no schema/data migration.

**Tech Stack:** TypeScript, libSQL, vitest (data), vitest + @testing-library/react jsdom (web). pnpm workspaces.

## Global Constraints

- `packages/data` stays Next-free / portable — no web imports (CLAUDE.md §2).
- Buckwalter stays ONLY in URL slugs (`/dictionary/$Am`); never user-visible.
- No new dependency, no schema change, no data migration.
- Rebuild `packages/data` (`pnpm --filter @quran-corpus/data build`) before web resolves new exports — web resolves against `dist`.
- Data pkg scripts: `type-check` (hyphen), `build`, `test`. NO `lint` (lint is root/web only).
- Conventional Commits; commit only after tests+lint+type-check green. Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Stage with explicit paths — never `git add -A` (untracked scratch: STATUS.md, dict_checkpoint*, temp/, .impeccable/ must stay untracked).
- Greptile §5 gate runs on the open PR; ≥4/5 hard block (handled at PR time, not per task).

---

### Task 1: Arabic text util (buckwalterToArabic + compareRootsArabic)

**Files:**
- Create: `packages/data/src/text/arabic.ts`
- Modify: `packages/data/src/index.ts` (export new symbols)
- Test: `packages/data/tests/arabic.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `buckwalterToArabic(bw: string): string`
  - `compareRootsArabic(a: string, b: string): number`
  - `ARABIC_ALPHABET_ORDER: readonly string[]`

- [ ] **Step 1: Write the failing test**

Create `packages/data/tests/arabic.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buckwalterToArabic, compareRootsArabic } from '../src/text/arabic.js';

describe('buckwalterToArabic', () => {
  it('maps consonant roots', () => {
    expect(buckwalterToArabic('H$r')).toBe('حشر'); // ح ش ر
    expect(buckwalterToArabic('dxl')).toBe('دخل'); // د خ ل
    expect(buckwalterToArabic('smw')).toBe('سمو');
  });
  it('maps single leaked letters', () => {
    expect(buckwalterToArabic('E')).toBe('ع');
    expect(buckwalterToArabic('*')).toBe('ذ');
    expect(buckwalterToArabic('$')).toBe('ش');
  });
  it('passes unknown chars through unchanged', () => {
    expect(buckwalterToArabic('ب?x')).toBe('ب?خ'); // '?' unmapped, stays
  });
});

describe('compareRootsArabic', () => {
  const sorted = (xs: string[]): string[] => [...xs].sort(compareRootsArabic);
  it('orders by hijāʾī, not ASCII/Buckwalter', () => {
    // sin(س) before kaf(ك) before sheen? no: correct order س ش ص ... ك
    expect(sorted(['ك ت ب', 'س م و'])).toEqual(['س م و', 'ك ت ب']);
  });
  it('sheen is NOT first (regression on Buckwalter $ sort)', () => {
    const out = sorted(['ش أ م', 'ا ب ب', 'ب و ب']);
    expect(out[0]).toBe('ا ب ب');
    expect(out[out.length - 1]).toBe('ش أ م');
  });
  it('hamza/alef variants fold; spaces ignored', () => {
    // 'أ م ر' folds alef-hamza -> alef, collates with 'ا م ر'
    expect(compareRootsArabic('أ م ر', 'امر')).toBe(0);
  });
  it('unknown letters sort last', () => {
    expect(compareRootsArabic('ب', 'Q')).toBeLessThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @quran-corpus/data test -- arabic`
Expected: FAIL — `buckwalterToArabic` / `compareRootsArabic` not exported (module not found).

- [ ] **Step 3: Write the implementation**

Create `packages/data/src/text/arabic.ts`:

```ts
// Tim Buckwalter transliteration -> Arabic. Buckwalter is a machine encoding
// (used only for URL slugs + the scraped `word_segments.root`); it must never
// reach the UI. This maps it back to Arabic for display. See spec
// docs/superpowers/specs/2026-07-04-phase-08a-dictionary-letters-design.md.
const BUCKWALTER_TO_ARABIC: Record<string, string> = {
  "'": 'ء', // ء
  '|': 'آ', // آ
  '>': 'أ', // أ
  '&': 'ؤ', // ؤ
  '<': 'إ', // إ
  '}': 'ئ', // ئ
  A: 'ا', // ا
  b: 'ب', // ب
  p: 'ة', // ة
  t: 'ت', // ت
  v: 'ث', // ث
  j: 'ج', // ج
  H: 'ح', // ح
  x: 'خ', // خ
  d: 'د', // د
  '*': 'ذ', // ذ
  r: 'ر', // ر
  z: 'ز', // ز
  s: 'س', // س
  $: 'ش', // ش
  S: 'ص', // ص
  D: 'ض', // ض
  T: 'ط', // ط
  Z: 'ظ', // ظ
  E: 'ع', // ع
  g: 'غ', // غ
  _: 'ـ', // ـ tatweel
  f: 'ف', // ف
  q: 'ق', // ق
  k: 'ك', // ك
  l: 'ل', // ل
  m: 'م', // م
  n: 'ن', // ن
  h: 'ه', // ه
  w: 'و', // و
  Y: 'ى', // ى
  y: 'ي', // ي
  F: 'ً', // ً
  N: 'ٌ', // ٌ
  K: 'ٍ', // ٍ
  a: 'َ', // َ
  u: 'ُ', // ُ
  i: 'ِ', // ِ
  '~': 'ّ', // ّ
  o: 'ْ', // ْ
  '`': 'ٰ', // ٰ dagger alef
  '{': 'ٱ', // ٱ alef wasla
};

export function buckwalterToArabic(bw: string): string {
  let out = '';
  for (const ch of bw) out += BUCKWALTER_TO_ARABIC[ch] ?? ch;
  return out;
}

// Arabic hijāʾī (dictionary) letter order. Hamza (ء) sorts first, matching
// corpus.quran.com's dictionary index.
export const ARABIC_ALPHABET_ORDER: readonly string[] = [
  'ء', // ء
  'ا', // ا
  'ب', // ب
  'ت', // ت
  'ث', // ث
  'ج', // ج
  'ح', // ح
  'خ', // خ
  'د', // د
  'ذ', // ذ
  'ر', // ر
  'ز', // ز
  'س', // س
  'ش', // ش
  'ص', // ص
  'ض', // ض
  'ط', // ط
  'ظ', // ظ
  'ع', // ع
  'غ', // غ
  'ف', // ف
  'ق', // ق
  'ك', // ك
  'ل', // ل
  'م', // م
  'ن', // ن
  'ه', // ه
  'و', // و
  'ي', // ي
];

// Fold alef/ya variants a root string may carry to their base letter so
// collation is stable regardless of hamza seat. (أ إ آ ٱ -> ا, ى -> ي.)
const FOLD: Record<string, string> = {
  'آ': 'ا',
  'أ': 'ا',
  'إ': 'ا',
  'ٱ': 'ا',
  'ى': 'ي',
};

function orderKey(root: string): number[] {
  const key: number[] = [];
  for (const ch of root) {
    if (ch === ' ') continue;
    const folded = FOLD[ch] ?? ch;
    const idx = ARABIC_ALPHABET_ORDER.indexOf(folded);
    key.push(idx === -1 ? ARABIC_ALPHABET_ORDER.length : idx); // unknown last
  }
  return key;
}

// Compare two `root_arabic` strings (e.g. "ش أ م") in Arabic dictionary order.
export function compareRootsArabic(a: string, b: string): number {
  const ka = orderKey(a);
  const kb = orderKey(b);
  const n = Math.min(ka.length, kb.length);
  for (let i = 0; i < n; i++) {
    if (ka[i]! !== kb[i]!) return ka[i]! - kb[i]!;
  }
  return ka.length - kb.length;
}
```

- [ ] **Step 4: Export from package index**

In `packages/data/src/index.ts`, add near the other `./text/*` exports:

```ts
export { buckwalterToArabic, compareRootsArabic, ARABIC_ALPHABET_ORDER } from './text/arabic.js';
```

- [ ] **Step 5: Run test + type-check to verify pass**

Run: `pnpm --filter @quran-corpus/data test -- arabic && pnpm --filter @quran-corpus/data type-check`
Expected: arabic tests PASS; type-check clean.

- [ ] **Step 6: Build so web can resolve the new exports**

Run: `pnpm --filter @quran-corpus/data build`
Expected: `Generated src/schema.generated.ts …` then tsc exits 0.

- [ ] **Step 7: Commit**

```bash
git add packages/data/src/text/arabic.ts packages/data/src/index.ts packages/data/tests/arabic.test.ts
git commit -m "feat(data): add buckwalterToArabic + Arabic root collation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Sort getAllRoots in Arabic order

**Files:**
- Modify: `packages/data/src/queries/roots.ts` (`getAllRoots`, line ~49-51)
- Test: `packages/data/tests/roots.test.ts` (update existing `getAllRoots alphabetical`)

**Interfaces:**
- Consumes: `compareRootsArabic` from `../text/arabic.js` (Task 1).
- Produces: `getAllRoots` returns roots sorted by `compareRootsArabic(root_arabic)`.

- [ ] **Step 1: Update the existing test to assert Arabic order (failing)**

In `packages/data/tests/roots.test.ts`, the seed inserts roots `smw`/`س م و` and `ktb`/`ك ت ب`. Add a third hamza-initial root to prove hamza-first. Replace the `INSERT INTO roots …` line (~38-40) with:

```ts
  const r = await db.execute(
    `INSERT INTO roots (root_buckwalter,root_arabic,occurrence_count) VALUES ('smw','س م و',5),('ktb','ك ت ب',319),('$Am','ش أ م',3) RETURNING id`,
  );
```

Replace the `getAllRoots alphabetical` test (~60-62) with:

```ts
  it('getAllRoots is in Arabic hijāʾī order, not Buckwalter', async () => {
    // hijāʾī index: س=12 (smw) < ش=13 ($Am) < ك=22 (ktb)
    expect((await getAllRoots(db)).map((r) => r.root_buckwalter)).toEqual([
      'smw', '$Am', 'ktb',
    ]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @quran-corpus/data test -- roots`
Expected: FAIL — current SQL `ORDER BY root_buckwalter` yields `['$Am','ktb','smw']` (ASCII `$`<`k`<`s`), not the expected `['smw','$Am','ktb']`.

- [ ] **Step 3: Implement the Arabic sort**

In `packages/data/src/queries/roots.ts`:

Add to the top imports:

```ts
import { compareRootsArabic } from '../text/arabic.js';
```

Replace `getAllRoots`:

```ts
export async function getAllRoots(db: Client): Promise<Root[]> {
  const res = await db.execute('SELECT * FROM roots');
  return res.rows.map(rowToRoot).sort((a, b) => compareRootsArabic(a.root_arabic, b.root_arabic));
}
```

(Leave `getRootsByFrequency` and `searchRoots` unchanged — their Buckwalter tiebreak only orders equal-frequency rows and is never displayed.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @quran-corpus/data test -- roots && pnpm --filter @quran-corpus/data type-check`
Expected: roots tests PASS; type-check clean.

- [ ] **Step 5: Rebuild data (getAllRoots change is consumed by web)**

Run: `pnpm --filter @quran-corpus/data build`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/data/src/queries/roots.ts packages/data/tests/roots.test.ts
git commit -m "fix(data): sort dictionary roots in Arabic order, not Buckwalter

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Web — stop showing Buckwalter (list, root page, segment card)

**Files:**
- Modify: `apps/web/src/components/dictionary/RootListRow.tsx`
- Modify: `apps/web/src/components/dictionary/RootEntry.tsx`
- Modify: `apps/web/src/components/morphology/SegmentCard.tsx`
- Test: `apps/web/src/test/RootListRow.test.tsx`, `RootEntry.test.tsx`, `SegmentCard.test.tsx`

**Interfaces:**
- Consumes: `buckwalterToArabic` from `@quran-corpus/data` (Task 1, must be built).

- [ ] **Step 1: Write failing web tests**

Append to `apps/web/src/test/RootListRow.test.tsx` a case asserting the Buckwalter subtitle is gone (adapt the existing render/import in that file):

```tsx
it('does not render the raw Buckwalter subtitle', () => {
  render(<RootListRow root={{ id: 1, root_buckwalter: '$Am', root_arabic: 'ش أ م', occurrence_count: 3 }} />);
  expect(screen.queryByText('$Am')).toBeNull();
  expect(screen.getByText('ش أ م')).toBeInTheDocument();
});
```

Append to `apps/web/src/test/RootEntry.test.tsx`:

```tsx
it('shows 3 letter pills and singular "1 time", no Buckwalter', () => {
  const entry = {
    root: { id: 1, root_buckwalter: 'dxl', root_arabic: 'د خ ل', occurrence_count: 1 },
    forms: [],
    definitions: [],
  };
  render(<RootEntry entry={entry} concordance={[]} />);
  expect(screen.queryByText(/dxl/)).toBeNull();
  expect(screen.getByText(/occurs 1 time(?!s)/)).toBeInTheDocument();
  for (const letter of ['د', 'خ', 'ل']) {
    expect(screen.getByText(letter)).toBeInTheDocument();
  }
});
```

Append to `apps/web/src/test/SegmentCard.test.tsx`:

```tsx
it('renders the Arabic root, not Buckwalter', () => {
  const segment = {
    id: 1, word_id: 1, segment_index: 0, segment_type: 'STEM', pos_tag: 'V',
    form_arabic: 'حَشَرَ', form_buckwalter: 'H$r', features_json: null,
    lemma: 'حَشَرَ', root: 'H$r',
  };
  render(<SegmentCard segment={segment} index={0} />);
  expect(screen.queryByText('H$r')).toBeNull();
  expect(screen.getByText('حشر')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter web test -- RootListRow RootEntry SegmentCard`
Expected: FAIL — subtitle `$Am`/`dxl`/`H$r` still present; "occurs 1 times" (plural) rendered; no letter pills.

- [ ] **Step 3: Fix RootListRow — remove Buckwalter subtitle**

In `apps/web/src/components/dictionary/RootListRow.tsx`, delete the subtitle span:

```tsx
        <span className="text-sm text-paper-500">{root.root_buckwalter}</span>
```

Leave the Arabic root span + count as-is.

- [ ] **Step 4: Fix RootEntry — 3-letter pill + pluralization**

In `apps/web/src/components/dictionary/RootEntry.tsx`, replace the `<p>` subtitle (`{root.root_buckwalter} · occurs {root.occurrence_count} times`) with:

```tsx
        <div className="mt-2 flex items-center gap-2">
          <span dir="rtl" className="flex gap-1.5">
            {Array.from(root.root_arabic.replace(/\s+/g, '')).map((letter, i) => (
              <span
                key={i}
                className="font-arabic rounded-md bg-paper-200 px-2.5 py-1 text-lg text-paper-800 dark:bg-night-100 dark:text-paper-200"
              >
                {letter}
              </span>
            ))}
          </span>
          <span className="text-sm text-paper-500">
            occurs {root.occurrence_count} time{root.occurrence_count === 1 ? '' : 's'}
          </span>
        </div>
```

- [ ] **Step 5: Fix SegmentCard — convert Buckwalter root to Arabic**

In `apps/web/src/components/morphology/SegmentCard.tsx`, add the import:

```tsx
import { buckwalterToArabic } from '@quran-corpus/data';
```

Change the `segment.root` render:

```tsx
          {segment.root && (
            <span className="font-arabic text-sm text-paper-700 dark:text-paper-300">
              {buckwalterToArabic(segment.root)}
            </span>
          )}
```

(Leave `segment.lemma` unchanged — already Arabic.)

- [ ] **Step 6: Run tests + lint + type-check to verify pass**

Run: `pnpm --filter web test -- RootListRow RootEntry SegmentCard && pnpm --filter web lint && pnpm --filter web type-check`
Expected: the three suites PASS; lint clean; type-check clean.

- [ ] **Step 7: Full regression + commit**

Run: `pnpm --filter @quran-corpus/data test && pnpm --filter web test`
Expected: all data + web suites green.

```bash
git add apps/web/src/components/dictionary/RootListRow.tsx apps/web/src/components/dictionary/RootEntry.tsx apps/web/src/components/morphology/SegmentCard.tsx apps/web/src/test/RootListRow.test.tsx apps/web/src/test/RootEntry.test.tsx apps/web/src/test/SegmentCard.test.tsx
git commit -m "fix(web/dictionary): show Arabic letters, 3-letter pill, pluralize count

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Acceptance (whole sub-phase)

- Dictionary alpha list first root is hamza/alef-initial, not `$…`.
- No `$` / `*` / `E` / `H` Buckwalter visible on dictionary list, root page, or word segment cards.
- Root page header shows one pill per root letter.
- Count 1 reads "occurs 1 time".
- SegmentCard root shows Arabic (`حشر`).
- data + web suites green; web lint + type-check green.

## Manual smoke (optional, DB is held by scraper — read-only nav is safe)

- `http://100.70.26.76:3939/dictionary` → list starts near ء/ا; no `$`.
- open any root → 3 pills, correct singular/plural.
- `http://100.70.26.76:3939/word/8/24/20` → segment root Arabic, not `H$r`.

## Risks / rollback

- Buckwalter map gap → char passes through raw (visible, safe). Covered by tests on real roots.
- Collation edge (rare hamza/waw seat) → cosmetic mis-order at worst.
- Rollback: revert branch. Display-only + one query sort; no schema/data migration.
