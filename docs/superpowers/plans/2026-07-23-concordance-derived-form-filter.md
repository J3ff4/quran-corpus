# Concordance Derived-Form Tagging + Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tag each root/dictionary concordance row with its derived form (via
exact lemma-text join, no schema change) and turn the existing "Derived forms"
list into optional multi-select filter chips, while keeping the concordance
chronological (verse-order) by default.

**Architecture:** `getRootConcordancePage`/`countRootConcordance`
(`packages/data/src/queries/roots.ts`) gain a LEFT JOIN from
`word_segments.lemma` to `root_forms.form_arabic` (scoped by root id via an
inline subquery, no new required param) plus an optional `formIds` filter.
`ConcordanceEntry` gains `form_id: number | null`. A new client component
`ConcordanceSection` owns filter-chip selection state and coordinates
`FormFilterChips` (replaces the static `FormGroup` list) with `ConcordanceList`
(which gains a per-row tag and a filter-aware refetch).

**Tech Stack:** Next.js App Router, `@quran-corpus/data` (libSQL), Vitest +
Testing Library — no new dependencies.

## Global Constraints

- No schema migration, no scraper backfill -- the join is a query-time text
  match on existing columns (`word_segments.lemma` = `root_forms.form_arabic`).
- Zero required changes to unfiltered call sites: `getRootConcordancePage`
  and `countRootConcordance` keep taking `(db, bw, opts?)` -- `bw` alone
  resolves the join scope via an inline subquery; `formIds` is a new optional
  field on `opts`.
- Mobile-first: filter chips MUST wrap (`flex-wrap`), never rely on horizontal
  scroll -- max observed derived-forms-per-root is 22 (root `qwm`/قوم, id 438),
  average 4.2.
- WCAG AA: chips are real `<button aria-pressed>` elements, not `<div
  onClick>`. Color is never the only signal -- every tag/chip also carries
  text (the form's transliteration or label).
- `prefers-reduced-motion` respected on chip select/deselect (reuse existing
  Tailwind `transition-colors` pattern already used elsewhere in this
  codebase -- no new animation library, no motion that needs a reduced-motion
  override because none of it moves position/scale, only color).
- 47 distinct `pos_label` values exist DB-wide -- colors key off a coarse
  7-bucket category (verb / verbal-noun / active-participle /
  passive-participle / noun / adjective / other), never the raw label.
- Unmatched lemma (`form_id: null`) never drops a row -- it shows untagged
  under "All" and never satisfies a specific filter chip.

---

### Task 1: DB-wide validation spike

**Files:**
- Create: `packages/scraper/tools/spike_form_lemma_alignment.py` (throwaway
  diagnostic script -- not imported by app code, lives alongside the project's
  existing one-off `tools/` scripts).

**Interfaces:**
- Consumes: the live DB at `/home/claude/quran-data/quran.db` (read-only).
- Produces: a printed report (root count, mismatch count, mismatch detail)
  that Task 2+ do NOT depend on programmatically -- this task's only
  deliverable is the recorded finding (STATUS.md), not code other tasks
  import. Blocks nothing downstream; run it before Task 3 ships so the
  finding is known first, not discovered later.

- [ ] **Step 1: Write the spike script**

```python
"""One-off spike: does word_segments.lemma = root_forms.form_arabic hold
across every root, the way it did for the two roots (gfr, rHm) checked by
hand during design? Diagnostic only -- not imported by app code.

Run: python3 packages/scraper/tools/spike_form_lemma_alignment.py
"""
import sqlite3

DB_PATH = "/home/claude/quran-data/quran.db"


def main() -> None:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    cur.execute("SELECT id, root_buckwalter FROM roots")
    roots = cur.fetchall()

    total_roots = 0
    mismatched_roots = 0
    total_occurrences = 0
    unmatched_occurrences = 0
    mismatch_examples: list[tuple[str, int, int]] = []

    for root_id, bw in roots:
        cur.execute(
            "SELECT COUNT(*) FROM (SELECT DISTINCT word_id FROM word_segments WHERE root = ?)",
            (bw,),
        )
        occ = cur.fetchone()[0]
        if occ == 0:
            continue
        total_roots += 1
        total_occurrences += occ

        # One row per word (MIN(segment_index) tie-break for the rare
        # double-stem-same-root case), joined to root_forms by exact lemma text.
        cur.execute(
            """
            SELECT COUNT(*) FROM (
              SELECT m.word_id
              FROM (SELECT word_id, MIN(segment_index) AS seg_idx
                    FROM word_segments WHERE root = ? GROUP BY word_id) m
              JOIN word_segments ws
                ON ws.word_id = m.word_id AND ws.segment_index = m.seg_idx
              LEFT JOIN root_forms rf
                ON rf.root_id = ? AND rf.form_arabic = ws.lemma
              WHERE rf.id IS NULL
            )
            """,
            (bw, root_id),
        )
        unmatched = cur.fetchone()[0]
        if unmatched > 0:
            mismatched_roots += 1
            unmatched_occurrences += unmatched
            if len(mismatch_examples) < 20:
                mismatch_examples.append((bw, occ, unmatched))

    print(f"Roots with occurrences: {total_roots}")
    print(f"Roots with >=1 unmatched occurrence: {mismatched_roots}")
    print(f"Total occurrences checked: {total_occurrences}")
    print(f"Total unmatched occurrences: {unmatched_occurrences}")
    print(f"Unmatched rate: {unmatched_occurrences / total_occurrences:.4%}")
    print("\nFirst 20 roots with a mismatch (root_buckwalter, occ, unmatched):")
    for bw, occ, unmatched in mismatch_examples:
        print(f"  {bw}: {occ} occurrences, {unmatched} unmatched")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it and record the result**

Run: `python3 packages/scraper/tools/spike_form_lemma_alignment.py`

There's no fixed "expected" number here -- the two hand-checked roots (`gfr`,
`rHm`) were 100% aligned, so a low single-digit-percent unmatched rate (or
zero) is the anticipated outcome. Whatever the actual output is, paste the
five summary lines into `STATUS.md` under a new "Concordance derived-form
join" note before starting Task 3 -- this is the record-before-shipping step
Global Constraints requires. The fallback behavior (Task 3's `form_id: null`
path) already handles any nonzero rate gracefully, so this step does not
block progress either way -- it exists so the number is known, not guessed.

- [ ] **Step 3: Commit**

```bash
git add packages/scraper/tools/spike_form_lemma_alignment.py
git commit -m "chore(scraper): spike script validating lemma-to-root_forms join alignment"
```

(The STATUS.md update happens as part of Task 9's final documentation pass,
once the real numbers from this run are in hand.)

---

### Task 2: Form-category color mapping

**Files:**
- Create: `apps/web/src/lib/formCategoryColor.ts`
- Create: `apps/web/src/test/formCategoryColor.test.ts`
- Modify: `apps/web/src/app/globals.css`

**Interfaces:**
- Produces: `export type FormCategory = 'verb' | 'verbal-noun' |
  'active-participle' | 'passive-participle' | 'noun' | 'adjective' |
  'other'`, `export function categorizeFormLabel(posLabel: string):
  FormCategory`, `export function formCategoryColor(category: FormCategory):
  string`. Task 5 and Task 7 both call these two functions directly.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/src/test/formCategoryColor.test.ts
import { describe, it, expect } from 'vitest';
import { categorizeFormLabel, formCategoryColor } from '../lib/formCategoryColor';

// Every distinct root_forms.pos_label value observed DB-wide (queried
// 2026-07-23, 47 values). A future label not in this list must be added here
// deliberately -- this test fails closed so a new label never silently falls
// into 'other' unnoticed.
const KNOWN_LABELS: Record<string, ReturnType<typeof categorizeFormLabel>> = {
  'Noun': 'noun',
  'Form I verb': 'verb',
  'Active participle': 'active-participle',
  'Form IV verb': 'verb',
  'Nominal': 'adjective',
  'Form II verb': 'verb',
  'Passive participle': 'passive-participle',
  'Adjective': 'adjective',
  'Form IV active participle': 'active-participle',
  'Form VIII verb': 'verb',
  'Form V verb': 'verb',
  'Form X verb': 'verb',
  'Form III verb': 'verb',
  'Form II verbal noun': 'verbal-noun',
  'Verbal noun': 'verbal-noun',
  'Form II passive participle': 'passive-participle',
  'Form IV passive participle': 'passive-participle',
  'Form VIII active participle': 'active-participle',
  'Form VI verb': 'verb',
  'Form II active participle': 'active-participle',
  'Form IV verbal noun': 'verbal-noun',
  'Form V active participle': 'active-participle',
  'Form X active participle': 'active-participle',
  'Proper noun': 'noun',
  'Form III active participle': 'active-participle',
  'Form III verbal noun': 'verbal-noun',
  'Form VIII passive participle': 'passive-participle',
  'Form VII verb': 'verb',
  'Form VI verbal noun': 'verbal-noun',
  'Form V verbal noun': 'verbal-noun',
  'Form VIII verbal noun': 'verbal-noun',
  'Form VI active participle': 'active-participle',
  'Form X verbal noun': 'verbal-noun',
  'Form X passive participle': 'passive-participle',
  'Time adverb': 'noun',
  'Form VII active participle': 'active-participle',
  'Form IX active participle': 'active-participle',
  'Form XII active participle': 'active-participle',
  'Form IX verb': 'verb',
  'Imperative verbal noun': 'verbal-noun',
  'Form of address': 'other',
  'Form XII verb': 'verb',
  'Form VII verbal noun': 'verbal-noun',
  'Form VII passive participle': 'passive-participle',
  'Form V passive participle': 'passive-participle',
  'Form III passive participle': 'passive-participle',
  'Conditional particle': 'other',
};

describe('categorizeFormLabel', () => {
  it('categorizes every known live pos_label value', () => {
    for (const [label, expected] of Object.entries(KNOWN_LABELS)) {
      expect(categorizeFormLabel(label)).toBe(expected);
    }
  });
  it('falls back to other for an unrecognized label', () => {
    expect(categorizeFormLabel('Something Brand New')).toBe('other');
  });
});

describe('formCategoryColor', () => {
  it('returns a distinct CSS var per category', () => {
    const categories = [
      'verb', 'verbal-noun', 'active-participle', 'passive-participle',
      'noun', 'adjective', 'other',
    ] as const;
    const colors = categories.map(formCategoryColor);
    expect(new Set(colors).size).toBe(categories.length);
    for (const c of colors) expect(c).toMatch(/^var\(--form-/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run src/test/formCategoryColor.test.ts`
Expected: FAIL -- `Cannot find module '../lib/formCategoryColor'`

- [ ] **Step 3: Write the implementation**

```typescript
// apps/web/src/lib/formCategoryColor.ts

export type FormCategory =
  | 'verb'
  | 'verbal-noun'
  | 'active-participle'
  | 'passive-participle'
  | 'noun'
  | 'adjective'
  | 'other';

/**
 * Buckets root_forms.pos_label (47 distinct values DB-wide, e.g. "Form IV
 * verb", "Form II passive participle") into 7 coarse categories for color
 * coding -- one color per label would be as unreadable as the earlier
 * all-tags-colored wbw problem this project already walked back from.
 */
export function categorizeFormLabel(posLabel: string): FormCategory {
  const s = posLabel.toLowerCase();
  if (s.includes('verbal noun')) return 'verbal-noun';
  if (s.includes('active participle')) return 'active-participle';
  if (s.includes('passive participle')) return 'passive-participle';
  if (s.includes('verb')) return 'verb';
  if (s.includes('adjective') || s === 'nominal') return 'adjective';
  if (s.includes('noun') || s.includes('adverb')) return 'noun';
  return 'other';
}

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

- [ ] **Step 4: Add the CSS custom properties**

Modify `apps/web/src/app/globals.css` -- add to the existing `:root` block
(right after the `--pos-*` lines) and its `:root.dark` mirror:

```css
:root {
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-arabic: var(--font-kfgqpc), 'Amiri', 'Noto Naskh Arabic', serif;

  /* POS morphology color-coding (WCAG-AA on paper light background). */
  --pos-noun: #2469c0;
  --pos-verb: #b23b2e;
  --pos-prep: #0f8a6a;
  --pos-pron: #8a5a0f;
  --pos-other: #555;

  /* Dictionary derived-form category color-coding (WCAG-AA on paper light
     background). Separate taxonomy from --pos-* (dictionary derived forms,
     not sentence-position POS tags) -- verb/noun/other reuse the same hex as
     their --pos-* counterpart for semantic consistency, the rest are new. */
  --form-verb: #b23b2e;
  --form-verbal-noun: #6b4fa0;
  --form-active-participle: #1f8a6a;
  --form-passive-participle: #a0527a;
  --form-noun: #2469c0;
  --form-adjective: #b2790f;
  --form-other: #555;
}
```

```css
:root.dark {
  --pos-noun: #7fb0ff;
  --pos-verb: #ff9a8f;
  --pos-prep: #6fd9b8;
  --pos-pron: #e0b877;
  --pos-other: #aaa;

  --form-verb: #ff9a8f;
  --form-verbal-noun: #c3b0e8;
  --form-active-participle: #6fd9b8;
  --form-passive-participle: #e0a8c8;
  --form-noun: #7fb0ff;
  --form-adjective: #e8c477;
  --form-other: #aaa;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && pnpm vitest run src/test/formCategoryColor.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/formCategoryColor.ts apps/web/src/test/formCategoryColor.test.ts apps/web/src/app/globals.css
git commit -m "feat(web/dictionary): add form-category color mapping for concordance tags"
```

---

### Task 3: Data layer -- lemma-to-form join + filter

**Files:**
- Modify: `packages/data/src/types.ts` (add `form_id` to `ConcordanceEntry`)
- Modify: `packages/data/src/queries/roots.ts`
  (`getRootConcordancePage`, `countRootConcordance`)
- Test: `packages/data/tests/roots.test.ts`

**Interfaces:**
- Consumes: existing `ConcordancePageOpts` shape, existing
  `getRootConcordancePage(db, bw, opts?)` / `countRootConcordance(db, bw,
  formIds?)` signatures.
- Produces: `ConcordanceEntry.form_id: number | null`.
  `ConcordancePageOpts.formIds?: number[]`. `countRootConcordance(db: Client,
  bw: string, formIds?: number[]): Promise<number>`. Task 4 (API route) and
  Task 6 (ConcordanceList refetch) both consume these directly.

- [ ] **Step 1: Write the failing tests**

Append to `packages/data/tests/roots.test.ts` (inside the `describe('roots
queries', ...)` block, after the existing `'two matches in one ayah...'`
test):

```typescript
  it('concordance entries carry form_id via exact lemma-to-root_forms text match', async () => {
    const r = await db.execute(
      `INSERT INTO roots (root_buckwalter,root_arabic,occurrence_count) VALUES ('gfr2','غفر2',3) RETURNING id`,
    );
    const rid = r.rows[0]!['id'] as number;
    await db.execute({
      sql: `INSERT INTO root_forms (root_id,sort_order,pos_label,form_arabic,form_translit,occurrence_count)
            VALUES (?,0,'Form I verb','غَفَرَ','ghafara',2),(?,1,'Nominal','غَفُور','ghafūr',1)`,
      args: [rid, rid],
    });
    const a = await db.execute(
      `INSERT INTO ayahs (surah_id,ayah_number,text_uthmani) VALUES (1,10,'x') RETURNING id`,
    );
    const aid = a.rows[0]!['id'] as number;
    // Two occurrences of the SAME lemma text but different pos_tag (ADJ vs
    // N) both map to the ONE 'Nominal' root_forms row -- this is exactly the
    // غَفُور/91-count pattern the design spike found in the live DB.
    await db.execute({
      sql: `INSERT INTO words (ayah_id,position,text_arabic,root_buckwalter,pos_tag)
            VALUES (?,1,'a','gfr2','V'),(?,2,'b','gfr2','ADJ'),(?,3,'c','gfr2','N')`,
      args: [aid, aid, aid],
    });
    const rows = await db.execute(`SELECT id FROM words WHERE root_buckwalter='gfr2' ORDER BY position`);
    const [w1, w2, w3] = rows.rows.map((row) => row['id'] as number);
    await db.execute({
      sql: `INSERT INTO word_segments (word_id,segment_index,segment_type,root,lemma) VALUES (?,0,'stem','gfr2','غَفَرَ')`,
      args: [w1],
    });
    await db.execute({
      sql: `INSERT INTO word_segments (word_id,segment_index,segment_type,root,lemma) VALUES (?,0,'stem','gfr2','غَفُور')`,
      args: [w2],
    });
    await db.execute({
      sql: `INSERT INTO word_segments (word_id,segment_index,segment_type,root,lemma) VALUES (?,0,'stem','gfr2','غَفُور')`,
      args: [w3],
    });

    const c = await getRootConcordancePage(db, 'gfr2');
    const byWord = new Map(c.map((e) => [e.word_id, e.form_id]));
    const verbFormId = (await getRootForms(db, rid)).find((f) => f.pos_label === 'Form I verb')!.id;
    const nominalFormId = (await getRootForms(db, rid)).find((f) => f.pos_label === 'Nominal')!.id;
    expect(byWord.get(w1)).toBe(verbFormId);
    expect(byWord.get(w2)).toBe(nominalFormId);
    expect(byWord.get(w3)).toBe(nominalFormId);
  });

  it('concordance entry has null form_id when the lemma matches no root_forms row', async () => {
    await db.execute(
      `INSERT INTO roots (root_buckwalter,root_arabic,occurrence_count) VALUES ('unk1','x',1)`,
    );
    const a = await db.execute(
      `INSERT INTO ayahs (surah_id,ayah_number,text_uthmani) VALUES (1,11,'x') RETURNING id`,
    );
    const aid = a.rows[0]!['id'] as number;
    const w = await db.execute({
      sql: `INSERT INTO words (ayah_id,position,text_arabic,root_buckwalter,pos_tag) VALUES (?,1,'x','unk1','N') RETURNING id`,
      args: [aid],
    });
    const wid = w.rows[0]!['id'] as number;
    // A lemma that doesn't match any root_forms.form_arabic for this root (no
    // root_forms row inserted at all for 'unk1').
    await db.execute({
      sql: `INSERT INTO word_segments (word_id,segment_index,segment_type,root,lemma) VALUES (?,0,'stem','unk1','نَادِر')`,
      args: [wid],
    });
    const c = await getRootConcordancePage(db, 'unk1');
    expect(c).toHaveLength(1);
    expect(c[0]!.form_id).toBeNull();
  });

  it('countRootConcordance and getRootConcordancePage both accept formIds to filter', async () => {
    const r = await db.execute(
      `INSERT INTO roots (root_buckwalter,root_arabic,occurrence_count) VALUES ('flt1','y',2) RETURNING id`,
    );
    const rid = r.rows[0]!['id'] as number;
    const forms = await db.execute({
      sql: `INSERT INTO root_forms (root_id,sort_order,pos_label,form_arabic,occurrence_count)
            VALUES (?,0,'Form I verb','فَعَلَ',1),(?,1,'Noun','فِعْل',1) RETURNING id`,
      args: [rid, rid],
    });
    const [verbFormId, nounFormId] = forms.rows.map((row) => row['id'] as number);
    const a = await db.execute(
      `INSERT INTO ayahs (surah_id,ayah_number,text_uthmani) VALUES (1,12,'x') RETURNING id`,
    );
    const aid = a.rows[0]!['id'] as number;
    await db.execute({
      sql: `INSERT INTO words (ayah_id,position,text_arabic,root_buckwalter,pos_tag)
            VALUES (?,1,'a','flt1','V'),(?,2,'b','flt1','N')`,
      args: [aid, aid],
    });
    const rows = await db.execute(`SELECT id FROM words WHERE root_buckwalter='flt1' ORDER BY position`);
    const [w1, w2] = rows.rows.map((row) => row['id'] as number);
    await db.execute({
      sql: `INSERT INTO word_segments (word_id,segment_index,segment_type,root,lemma) VALUES (?,0,'stem','flt1','فَعَلَ')`,
      args: [w1],
    });
    await db.execute({
      sql: `INSERT INTO word_segments (word_id,segment_index,segment_type,root,lemma) VALUES (?,0,'stem','flt1','فِعْل')`,
      args: [w2],
    });

    expect(await countRootConcordance(db, 'flt1')).toBe(2);
    expect(await countRootConcordance(db, 'flt1', [verbFormId])).toBe(1);
    const filtered = await getRootConcordancePage(db, 'flt1', { formIds: [verbFormId] });
    expect(filtered.map((e) => e.word_id)).toEqual([w1]);
    const both = await getRootConcordancePage(db, 'flt1', { formIds: [verbFormId, nounFormId] });
    expect(both.map((e) => e.word_id).sort()).toEqual([w1, w2].sort());
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/data && pnpm vitest run tests/roots.test.ts`
Expected: FAIL -- `form_id` is `undefined`, `formIds` option not recognized
(TypeScript error on `{ formIds: [...] }` / `countRootConcordance(db, 'flt1',
[verbFormId])` extra arg).

- [ ] **Step 3: Add `form_id` to `ConcordanceEntry`**

Modify `packages/data/src/types.ts` -- find the `ConcordanceEntry` interface
(currently at line 122) and add one field:

```typescript
export interface ConcordanceEntry {
  surah_id: number;
  ayah_number: number;
  position: number;
  word_id: number;
  text_arabic: string;
  transliteration: string | null;
  gloss: string | null;
  verse_words: VerseWord[];
  /** The derived form (root_forms.id) this occurrence's lemma matches, via
   *  exact lemma-text join -- null when no root_forms row has a matching
   *  form_arabic (data gap; occurrence still shows, just untagged/unfiltered). */
  form_id: number | null;
}
```

- [ ] **Step 4: Rewrite the concordance queries**

Modify `packages/data/src/queries/roots.ts` -- replace the
`ConcordancePageOpts` interface, `countRootConcordance`, and
`getRootConcordancePage` (currently lines 224-292 including the doc comments
above them) with:

```typescript
export interface ConcordancePageOpts {
  /** Omit for the full, unbounded list; set for server-side paging. */
  limit?: number;
  offset?: number;
  lang?: string;
  batchSize?: number;
  /** root_forms.id values to narrow to (OR semantics). Omit/empty = no filter. */
  formIds?: number[];
}

/** Total matched occurrences for a root — the paging total, cheap COUNT with no
 *  verse rebuild. One row per matching word (EXISTS, no join fan-out), so this
 *  equals the entry count of the concordance.
 *  ponytail: word-based count. If a single word ever carried the same root in
 *  two segments, this would read one under roots.occurrence_count (segment-based);
 *  no such word exists in the corpus. Revisit only if that changes.
 *  `formIds` narrows to occurrences whose lemma matches one of those
 *  root_forms rows; omitted/empty keeps the original fast unfiltered query
 *  (no join) so the common "All" case doesn't pay for a feature it doesn't use. */
export async function countRootConcordance(
  db: Client,
  bw: string,
  formIds?: number[],
): Promise<number> {
  if (!formIds || formIds.length === 0) {
    // Driven from word_segments (indexed on root, ~hundreds of rows even for a
    // hot root) rather than a correlated EXISTS over all `words` -- the EXISTS
    // form makes SQLite scan every word in the corpus and re-run the root
    // lookup per row, which is O(words x matches) and took 10s+ on common roots.
    const res = await db.execute({
      sql: `SELECT COUNT(*) AS n FROM (SELECT DISTINCT word_id FROM word_segments WHERE root = ?)`,
      args: [bw],
    });
    return res.rows[0]!['n'] as number;
  }
  const placeholders = formIds.map(() => '?').join(',');
  const res = await db.execute({
    sql: `SELECT COUNT(*) AS n FROM (
            SELECT m.word_id
            FROM (SELECT word_id, MIN(segment_index) AS seg_idx
                  FROM word_segments WHERE root = ? GROUP BY word_id) m
            JOIN word_segments ws ON ws.word_id = m.word_id AND ws.segment_index = m.seg_idx
            JOIN root_forms rf
              ON rf.root_id = (SELECT id FROM roots WHERE root_buckwalter = ?)
             AND rf.form_arabic = ws.lemma
            WHERE rf.id IN (${placeholders})
          )`,
    args: [bw, bw, ...formIds],
  });
  return res.rows[0]!['n'] as number;
}

/** One page of a root's concordance (or all of it when `limit` is omitted).
 *  Deterministic surah→ayah→position order so LIMIT/OFFSET paging never repeats
 *  or skips an occurrence. Always LEFT JOINs each occurrence's lemma to its
 *  matching root_forms row (via exact text match, scoped to this root by an
 *  inline subquery -- no extra required param) so `form_id` can tag it;
 *  `opts.formIds` additionally narrows to specific forms when provided. */
export async function getRootConcordancePage(
  db: Client,
  bw: string,
  opts: ConcordancePageOpts = {},
): Promise<ConcordanceEntry[]> {
  const { limit, offset = 0, lang = 'en', batchSize = 500, formIds } = opts;
  const args: (string | number)[] = [bw, lang, bw];
  let filterClause = '';
  if (formIds && formIds.length > 0) {
    const placeholders = formIds.map(() => '?').join(',');
    filterClause = ` WHERE rf.id IN (${placeholders})`;
    args.push(...formIds);
  }
  let paging = '';
  if (limit !== undefined) {
    paging = ' LIMIT ? OFFSET ?';
    args.push(limit, offset);
  }
  const matched = await db.execute({
    // Same fix as countRootConcordance: drive from the root-indexed
    // word_segments rows, not a correlated EXISTS scanning every word.
    // MIN(segment_index) picks a deterministic segment for the rare
    // double-stem-same-root case (same tie-break as the words.pos_tag fix).
    sql: `SELECT a.surah_id, a.ayah_number, w.position, w.id AS word_id,
                 w.ayah_id AS ayah_id, w.text_arabic, w.transliteration,
                 g.gloss_text AS gloss, rf.id AS form_id
          FROM (SELECT word_id, MIN(segment_index) AS seg_idx
                FROM word_segments WHERE root = ? GROUP BY word_id) m
          JOIN word_segments ws ON ws.word_id = m.word_id AND ws.segment_index = m.seg_idx
          JOIN words w ON w.id = m.word_id
          JOIN ayahs a ON a.id = w.ayah_id
          LEFT JOIN word_glosses g ON g.word_id = w.id AND g.language_code = ?
          LEFT JOIN root_forms rf
            ON rf.root_id = (SELECT id FROM roots WHERE root_buckwalter = ?)
           AND rf.form_arabic = ws.lemma${filterClause}
          ORDER BY a.surah_id, a.ayah_number, w.position${paging}`,
    args,
  });
  if (matched.rows.length === 0) return [];

  const ayahIds = [...new Set(matched.rows.map((r) => r['ayah_id'] as number))];
  // Batch the IN clause: a hot root (الله ~1879 ayahs) would otherwise emit
  // more binds than SQLite's SQLITE_LIMIT_VARIABLE_NUMBER (999 pre-3.32).
  const wordsByAyah = new Map<number, VerseWord[]>();
  for (let i = 0; i < ayahIds.length; i += batchSize) {
    const chunk = ayahIds.slice(i, i + batchSize);
    const placeholders = chunk.map(() => '?').join(',');
    const sib = await db.execute({
      sql: `SELECT w.ayah_id, w.id, w.position, w.text_arabic,
                   EXISTS (SELECT 1 FROM word_segments s
                           WHERE s.word_id = w.id
                             AND s.segment_index = (SELECT MIN(segment_index) FROM word_segments WHERE word_id = w.id)
                             AND s.pos_tag IN ('SUB','REM')) AS starts_clause
            FROM words w
            WHERE w.ayah_id IN (${placeholders})
            ORDER BY w.ayah_id, w.position`,
      args: chunk,
    });
    for (const r of sib.rows) {
      const aid = r['ayah_id'] as number;
      const list = wordsByAyah.get(aid) ?? [];
      list.push({
        id: r['id'] as number,
        position: r['position'] as number,
        text_arabic: stripQuranicAnnotations(r['text_arabic'] as string),
        starts_clause: (r['starts_clause'] as number) === 1,
      });
      wordsByAyah.set(aid, list);
    }
  }

  return matched.rows.map((r) => ({
    surah_id: r['surah_id'] as number,
    ayah_number: r['ayah_number'] as number,
    position: r['position'] as number,
    word_id: r['word_id'] as number,
    text_arabic: stripQuranicAnnotations(r['text_arabic'] as string),
    transliteration: (r['transliteration'] as string | null) ?? null,
    gloss: (r['gloss'] as string | null) ?? null,
    form_id: (r['form_id'] as number | null) ?? null,
    verse_words: wordsByAyah.get(r['ayah_id'] as number) ?? [],
  }));
}
```

Leave `getRootConcordance` (the thin unbounded wrapper right after) unchanged
-- it already forwards to `getRootConcordancePage` and needs no edit.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/data && pnpm vitest run tests/roots.test.ts`
Expected: PASS (all existing tests + 3 new ones)

- [ ] **Step 6: Run the full data package suite (regression check)**

Run: `cd packages/data && pnpm vitest run`
Expected: PASS, 0 failures

- [ ] **Step 7: Commit**

```bash
git add packages/data/src/types.ts packages/data/src/queries/roots.ts packages/data/tests/roots.test.ts
git commit -m "feat(data): join concordance entries to their derived form by lemma text"
```

---

### Task 4: API route -- `forms` filter param

**Files:**
- Modify: `apps/web/src/app/api/roots/[root]/concordance/route.ts`
- Test: `apps/web/src/test/concordanceRoute.test.ts` (new)

**Interfaces:**
- Consumes: `getRootConcordancePage(db, bw, { limit, offset, formIds? })`,
  `countRootConcordance(db, bw, formIds?)` from Task 3.
- Produces: `GET /api/roots/:root/concordance?...&forms=1,2,3` -- comma-
  separated `root_forms.id` values, invalid/non-numeric entries silently
  dropped (never a 500). Task 6 (`ConcordanceList`) builds this query string.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/src/test/concordanceRoute.test.ts
import { describe, it, expect, vi } from 'vitest';

const getRootConcordancePage = vi.fn(async () => []);
const countRootConcordance = vi.fn(async () => 0);
vi.mock('@quran-corpus/data', () => ({ getRootConcordancePage, countRootConcordance }));
vi.mock('../lib/db', () => ({ getDatabase: vi.fn(async () => ({})) }));

const { GET } = await import('../app/api/roots/[root]/concordance/route');

function req(url: string): Request {
  return new Request(url);
}

describe('GET /api/roots/[root]/concordance', () => {
  it('parses a valid forms= param into formIds passed to both queries', async () => {
    await GET(req('http://x/api/roots/ktb/concordance?forms=3,7,12'), {
      params: Promise.resolve({ root: 'ktb' }),
    });
    expect(getRootConcordancePage).toHaveBeenCalledWith(
      expect.anything(),
      'ktb',
      expect.objectContaining({ formIds: [3, 7, 12] }),
    );
    expect(countRootConcordance).toHaveBeenCalledWith(expect.anything(), 'ktb', [3, 7, 12]);
  });

  it('omits formIds entirely when forms= is absent', async () => {
    await GET(req('http://x/api/roots/ktb/concordance'), {
      params: Promise.resolve({ root: 'ktb' }),
    });
    const lastPageCall = getRootConcordancePage.mock.calls.at(-1)!;
    expect(lastPageCall[2]).not.toHaveProperty('formIds');
    const lastCountCall = countRootConcordance.mock.calls.at(-1)!;
    expect(lastCountCall[2]).toBeUndefined();
  });

  it('drops non-numeric junk from forms= instead of erroring', async () => {
    const res = await GET(req('http://x/api/roots/ktb/concordance?forms=3,abc,7'), {
      params: Promise.resolve({ root: 'ktb' }),
    });
    expect(res.status).toBe(200);
    const lastPageCall = getRootConcordancePage.mock.calls.at(-1)!;
    expect(lastPageCall[2]).toMatchObject({ formIds: [3, 7] });
  });

  it('empty forms= (no valid ids) behaves like no filter', async () => {
    await GET(req('http://x/api/roots/ktb/concordance?forms=abc,def'), {
      params: Promise.resolve({ root: 'ktb' }),
    });
    const lastPageCall = getRootConcordancePage.mock.calls.at(-1)!;
    expect(lastPageCall[2]).not.toHaveProperty('formIds');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run src/test/concordanceRoute.test.ts`
Expected: FAIL -- `formIds` never passed (route doesn't read `forms` yet)

- [ ] **Step 3: Implement the `forms` param**

Modify `apps/web/src/app/api/roots/[root]/concordance/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { getRootConcordancePage, countRootConcordance } from '@quran-corpus/data';
import { getDatabase } from '../../../../../lib/db';

export const dynamic = 'force-dynamic';

// Buckwalter root alphabet: ASCII letters plus the hamza/madda/wasla symbols.
// Parametrized queries make injection a non-issue; this rejects junk paths early.
const BUCKWALTER = /^[A-Za-z'`><{}|&*$~]{1,12}$/;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/** Clamp a query-string integer to [min,max], falling back to `fallback` on junk. */
function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (raw === null || !Number.isInteger(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/** Parse "3,7,12" into [3,7,12], silently dropping non-numeric entries.
 *  Returns undefined (not []) when nothing valid remains, so callers can
 *  omit the option entirely rather than pass an empty-but-present filter. */
function parseFormIds(raw: string | null): number[] | undefined {
  if (!raw) return undefined;
  const ids = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  return ids.length > 0 ? ids : undefined;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ root: string }> },
): Promise<Response> {
  const bw = decodeURIComponent((await params).root);
  if (!BUCKWALTER.test(bw)) {
    return NextResponse.json({ error: 'Invalid root' }, { status: 400 });
  }
  const sp = new URL(request.url).searchParams;
  const limit = clampInt(sp.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = clampInt(sp.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
  const formIds = parseFormIds(sp.get('forms'));

  const db = await getDatabase();
  const [entries, total] = await Promise.all([
    getRootConcordancePage(db, bw, { limit, offset, ...(formIds ? { formIds } : {}) }),
    countRootConcordance(db, bw, formIds),
  ]);
  return NextResponse.json(
    { entries, total },
    { headers: { 'Cache-Control': 'public, max-age=86400' } },
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm vitest run src/test/concordanceRoute.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/roots/[root]/concordance/route.ts apps/web/src/test/concordanceRoute.test.ts
git commit -m "feat(web/api): accept forms= filter param on the concordance paging route"
```

---

### Task 5: ConcordanceList -- per-row derived-form tag

**Files:**
- Modify: `apps/web/src/components/dictionary/ConcordanceList.tsx`
- Test: `apps/web/src/test/ConcordanceList.test.tsx`

**Interfaces:**
- Consumes: `formCategoryColor`, `categorizeFormLabel` (Task 2). `RootForm`,
  `ConcordanceEntry.form_id` (Task 3).
- Produces: `ConcordanceList` gains an optional `forms?: RootForm[]` prop.
  Task 8 (`ConcordanceSection`) passes it down.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/src/test/ConcordanceList.test.tsx` (after the existing
`import` block, add `RootForm` to the type import; then add these tests
inside the `describe('ConcordanceList', ...)` block, after the `'washes only
the matched word'` test):

```typescript
  it('renders a colored tag when the entry.form_id matches a passed forms entry', () => {
    const forms: RootForm[] = [
      {
        id: 9, root_id: 1, sort_order: 0, pos_label: 'Form I verb',
        form_arabic: 'غَفَرَ', form_translit: 'ghafara', gloss: null, occurrence_count: 65,
      },
    ];
    const withForm = { ...entry(200, 5), form_id: 9 };
    render(
      <ConcordanceList initialEntries={[withForm]} total={1} rootBw="gfr" forms={forms} />,
    );
    expect(screen.getByText('ghafara')).toBeInTheDocument();
  });

  it('omits the tag when form_id is null or forms is not passed', () => {
    const noForm = { ...entry(200, 5), form_id: null };
    render(<ConcordanceList initialEntries={[noForm]} total={1} rootBw="gfr" />);
    expect(screen.queryByText('ghafara')).toBeNull();
  });
```

Also update the local `entry()` fixture helper at the top of the file to
include `form_id: null` (the field is now required on `ConcordanceEntry`):

```typescript
const entry = (word_id: number, ayah_number: number): ConcordanceEntry => ({
  surah_id: 2,
  ayah_number,
  position: 2,
  word_id,
  text_arabic: 'HEAD',
  transliteration: null,
  gloss: null,
  form_id: null,
  verse_words: [
    { id: 100, position: 1, text_arabic: 'alpha' },
    { id: word_id, position: 2, text_arabic: 'beta' },
    { id: 300, position: 3, text_arabic: 'gamma' },
  ],
});
```

And the fixture in the `'trims a long verse...'` test (which builds its own
inline entry object) needs `form_id: null` added too, alongside its existing
`gloss: null` line.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && pnpm vitest run src/test/ConcordanceList.test.tsx`
Expected: FAIL -- TS error (`form_id` missing on fixtures) and the two new
`ghafara` assertions fail (tag not rendered yet).

- [ ] **Step 3: Implement the tag**

Modify `apps/web/src/components/dictionary/ConcordanceList.tsx`:

```typescript
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { ConcordanceEntry, RootForm } from '@quran-corpus/data';
import { trimConcordanceVerse } from '@quran-corpus/data/client';
import { verseRef, concordanceHref } from '../../lib/concordance';
import { categorizeFormLabel, formCategoryColor } from '../../lib/formCategoryColor';

const PAGE = 20;

const wash =
  'rounded-md bg-accent-100 px-1 font-semibold text-accent-700 dark:bg-accent-900/40 dark:text-accent-300';

/** One occurrence's verse, trimmed to a window around the matched word by
 * default with a per-row toggle to reveal the whole ayah. */
function ConcordanceVerse({ entry }: { entry: ConcordanceEntry }) {
  const [expanded, setExpanded] = useState(false);
  const trimmed = trimConcordanceVerse(entry.verse_words, entry.word_id);
  const shown = expanded ? entry.verse_words : trimmed.words;
  const canExpand = trimmed.words.length < entry.verse_words.length;
  return (
    <>
      <p dir="rtl" className="font-arabic text-lg leading-loose text-paper-800 dark:text-paper-200">
        {!expanded && trimmed.truncatedBefore && <span className="text-paper-400">… </span>}
        {shown.map((w, i) => (
          <span key={w.id}>
            {i > 0 && ' '}
            <span className={w.id === entry.word_id ? wash : undefined}>{w.text_arabic}</span>
          </span>
        ))}
        {!expanded && trimmed.truncatedAfter && <span className="text-paper-400"> …</span>}
      </p>
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-1 text-xs text-paper-500 underline-offset-2 hover:underline"
        >
          {expanded ? 'Show less' : 'Show full verse'}
        </button>
      )}
    </>
  );
}

/** Small colored tag naming an occurrence's derived form (e.g. "ghafara"),
 *  omitted when the entry has no matching form (form_id null or forms not
 *  supplied by the caller). */
function FormTag({ formId, forms }: { formId: number | null; forms?: RootForm[] }) {
  if (formId === null || !forms) return null;
  const form = forms.find((f) => f.id === formId);
  if (!form) return null;
  const color = formCategoryColor(categorizeFormLabel(form.pos_label));
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none"
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }}
    >
      {form.form_translit ?? form.pos_label}
    </span>
  );
}

interface ConcordanceListProps {
  /** First page, server-rendered. */
  initialEntries: ConcordanceEntry[];
  /** Total occurrences across the whole concordance (from countRootConcordance). */
  total: number;
  /** Buckwalter root — keys the paging API. */
  rootBw: string;
  /** The root's derived forms, for looking up each entry's form_id -> tag.
   *  Omit to render with no tags (e.g. a root with no forms). */
  forms?: RootForm[];
}

/** Occurrence list: verse-ref link, matched form/translit/gloss, and the verse
 * rebuilt word-by-word with the matched word washed. Big roots page in from
 * `/api/roots/<bw>/concordance` on Load-more instead of dumping every verse. */
export function ConcordanceList({ initialEntries, total, rootBw, forms }: ConcordanceListProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const hasMore = entries.length < total;

  // Abort an in-flight page request if the user navigates away mid-fetch, so
  // its resolution can't fire setState on an unmounted component.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  async function loadMore() {
    if (loading) return;
    setLoading(true);
    setFailed(false);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch(
        `/api/roots/${encodeURIComponent(rootBw)}/concordance?offset=${entries.length}&limit=${PAGE}`,
        { signal: ctrl.signal },
      );
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const data = (await res.json()) as { entries: ConcordanceEntry[]; total: number };
      setEntries((prev) => [...prev, ...data.entries]);
    } catch {
      // Abort on unmount is expected — don't surface it (and don't setState).
      if (!ctrl.signal.aborted) setFailed(true);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }

  if (entries.length === 0) {
    return <p className="px-4 py-6 text-center text-paper-500">No occurrences.</p>;
  }

  return (
    <>
      <ul className="divide-y divide-paper-200 dark:divide-night-100">
        {entries.map((e) => (
          <li key={e.word_id} className="py-3">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <Link
                href={concordanceHref(e)}
                className="text-sm font-medium text-paper-600 underline-offset-2 hover:underline dark:text-paper-400"
              >
                {verseRef(e)}
              </Link>
              <span className="flex items-baseline gap-2">
                <FormTag formId={e.form_id} forms={forms} />
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
            <ConcordanceVerse entry={e} />
          </li>
        ))}
      </ul>
      {failed && (
        <p role="alert" className="mt-4 text-center text-sm text-red-600 dark:text-red-400">
          Couldn’t load more. Tap “Load more” to try again.
        </p>
      )}
      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          className="mx-auto mt-4 block rounded-full bg-paper-200 px-6 py-2 text-sm text-paper-700 transition-colors hover:bg-paper-300 disabled:opacity-60 dark:bg-night-100 dark:text-paper-300 dark:hover:bg-night-200"
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </>
  );
}
```

(Task 6 adds the `selectedFormIds` prop and refetch logic on top of this same
file -- this step intentionally does not touch `loadMore`'s fetch URL yet.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && pnpm vitest run src/test/ConcordanceList.test.tsx`
Expected: PASS (all existing tests + 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/dictionary/ConcordanceList.tsx apps/web/src/test/ConcordanceList.test.tsx
git commit -m "feat(web/dictionary): tag each concordance row with its derived form"
```

---

### Task 6: ConcordanceList -- filter-aware refetch

**Files:**
- Modify: `apps/web/src/components/dictionary/ConcordanceList.tsx`
- Test: `apps/web/src/test/ConcordanceList.test.tsx`

**Interfaces:**
- Consumes: the `forms=` query param from Task 4.
- Produces: `ConcordanceList` gains an optional `selectedFormIds?: number[]`
  prop. Task 8 (`ConcordanceSection`) passes it down and changes it when
  chips are toggled.

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/src/test/ConcordanceList.test.tsx`, inside the `describe`
block:

```typescript
  it('omits the forms= param from the initial Load-more fetch when no filter is selected', async () => {
    const initial = Array.from({ length: 20 }, (_, i) => entry(1000 + i, i + 1));
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ entries: [], total: 20 }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<ConcordanceList initialEntries={initial} total={25} rootBw="Aty" />);
    fireEvent.click(screen.getByRole('button', { name: /load more/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/roots/Aty/concordance?offset=20&limit=20',
      { signal: expect.any(AbortSignal) },
    );
  });

  it('refetches from offset 0 with forms= when selectedFormIds changes', async () => {
    const initial = Array.from({ length: 5 }, (_, i) => entry(1000 + i, i + 1));
    const filtered = [{ ...entry(9000, 1), form_id: 3 }];
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ entries: filtered, total: 1 }) });
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(
      <ConcordanceList initialEntries={initial} total={5} rootBw="Aty" selectedFormIds={[]} />,
    );
    expect(fetchMock).not.toHaveBeenCalled();

    rerender(
      <ConcordanceList initialEntries={initial} total={5} rootBw="Aty" selectedFormIds={[3]} />,
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/roots/Aty/concordance?offset=0&limit=20&forms=3',
        { signal: expect.any(AbortSignal) },
      ),
    );
  });

  it('going back to no selection (All) restores the original unfiltered entries without refetching', async () => {
    const initial = Array.from({ length: 5 }, (_, i) => entry(1000 + i, i + 1));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { rerender, container } = render(
      <ConcordanceList initialEntries={initial} total={5} rootBw="Aty" selectedFormIds={[3]} />,
    );
    rerender(
      <ConcordanceList initialEntries={initial} total={5} rootBw="Aty" selectedFormIds={[]} />,
    );
    await waitFor(() => expect(container.querySelectorAll('li').length).toBe(5));
    expect(fetchMock).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && pnpm vitest run src/test/ConcordanceList.test.tsx`
Expected: FAIL -- `selectedFormIds` prop doesn't exist, no refetch happens

- [ ] **Step 3: Implement the filter-aware refetch**

Modify `apps/web/src/components/dictionary/ConcordanceList.tsx` -- update the
props interface and component body:

```typescript
interface ConcordanceListProps {
  /** First page, server-rendered. */
  initialEntries: ConcordanceEntry[];
  /** Total occurrences across the whole concordance (from countRootConcordance). */
  total: number;
  /** Buckwalter root — keys the paging API. */
  rootBw: string;
  /** The root's derived forms, for looking up each entry's form_id -> tag.
   *  Omit to render with no tags (e.g. a root with no forms). */
  forms?: RootForm[];
  /** root_forms.id values to narrow to. Empty/omitted = no filter (unchanged
   *  default behavior, uses initialEntries/total as-is). Changing this value
   *  (a new array reference with different contents) triggers a fresh
   *  offset-0 fetch -- the parent (ConcordanceSection) owns this state. */
  selectedFormIds?: number[];
}

/** Occurrence list: verse-ref link, matched form/translit/gloss, and the verse
 * rebuilt word-by-word with the matched word washed. Big roots page in from
 * `/api/roots/<bw>/concordance` on Load-more instead of dumping every verse.
 * When `selectedFormIds` changes to/from a non-empty set, resets to a fresh
 * offset-0 fetch with the new filter; an empty/omitted selection always shows
 * the original unfiltered `initialEntries`/`total` with no extra fetch. */
export function ConcordanceList({
  initialEntries,
  total,
  rootBw,
  forms,
  selectedFormIds = [],
}: ConcordanceListProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [entriesTotal, setEntriesTotal] = useState(total);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const hasMore = entries.length < entriesTotal;

  // Abort an in-flight page request if the user navigates away mid-fetch, so
  // its resolution can't fire setState on an unmounted component.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  function buildUrl(offset: number, formIds: number[]): string {
    const base = `/api/roots/${encodeURIComponent(rootBw)}/concordance?offset=${offset}&limit=${PAGE}`;
    return formIds.length > 0 ? `${base}&forms=${formIds.join(',')}` : base;
  }

  async function fetchPage(offset: number, formIds: number[], replace: boolean) {
    setLoading(true);
    setFailed(false);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch(buildUrl(offset, formIds), { signal: ctrl.signal });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const data = (await res.json()) as { entries: ConcordanceEntry[]; total: number };
      setEntries((prev) => (replace ? data.entries : [...prev, ...data.entries]));
      setEntriesTotal(data.total);
    } catch {
      // Abort (unmount, or a newer filter change superseding this one) is
      // expected -- don't surface it, and don't touch state for a stale request.
      if (!ctrl.signal.aborted) setFailed(true);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }

  function loadMore() {
    if (loading) return;
    void fetchPage(entries.length, selectedFormIds, false);
  }

  // Skip the very first run (the default/unfiltered case is already seeded
  // via initialEntries/total, at zero extra network cost) -- only refetch on
  // a SUBSEQUENT change to the selection.
  const isFirstRun = useRef(true);
  const prevKey = useRef(selectedFormIds.slice().sort().join(','));
  useEffect(() => {
    const key = selectedFormIds.slice().sort().join(',');
    if (isFirstRun.current) {
      isFirstRun.current = false;
      prevKey.current = key;
      return;
    }
    if (key === prevKey.current) return;
    prevKey.current = key;
    abortRef.current?.abort();
    if (selectedFormIds.length === 0) {
      // Back to "All" -- restore the original unfiltered page, no fetch needed.
      setEntries(initialEntries);
      setEntriesTotal(total);
      setFailed(false);
      return;
    }
    void fetchPage(0, selectedFormIds, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedFormIds
    // is compared by content (sorted+joined key) above, not by reference.
  }, [selectedFormIds.slice().sort().join(',')]);

  if (entries.length === 0) {
    return <p className="px-4 py-6 text-center text-paper-500">No occurrences.</p>;
  }

  return (
    <>
      <ul className="divide-y divide-paper-200 dark:divide-night-100">
        {entries.map((e) => (
          <li key={e.word_id} className="py-3">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <Link
                href={concordanceHref(e)}
                className="text-sm font-medium text-paper-600 underline-offset-2 hover:underline dark:text-paper-400"
              >
                {verseRef(e)}
              </Link>
              <span className="flex items-baseline gap-2">
                <FormTag formId={e.form_id} forms={forms} />
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
            <ConcordanceVerse entry={e} />
          </li>
        ))}
      </ul>
      {failed && (
        <p role="alert" className="mt-4 text-center text-sm text-red-600 dark:text-red-400">
          Couldn’t load more. Tap “Load more” to try again.
        </p>
      )}
      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          className="mx-auto mt-4 block rounded-full bg-paper-200 px-6 py-2 text-sm text-paper-700 transition-colors hover:bg-paper-300 disabled:opacity-60 dark:bg-night-100 dark:text-paper-300 dark:hover:bg-night-200"
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </>
  );
}
```

Note the existing `'no occurrences'`, `'washes only the matched word'`, and
`'aborts an in-flight request on unmount'` tests all still pass unmodified --
none of them pass `selectedFormIds`, so it defaults to `[]` and behavior is
identical to before this task.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/web && pnpm vitest run src/test/ConcordanceList.test.tsx`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/dictionary/ConcordanceList.tsx apps/web/src/test/ConcordanceList.test.tsx
git commit -m "feat(web/dictionary): ConcordanceList refetches from offset 0 when the form filter changes"
```

---

### Task 7: FormFilterChips (replaces FormGroup)

**Files:**
- Create: `apps/web/src/components/dictionary/FormFilterChips.tsx`
- Create: `apps/web/src/test/FormFilterChips.test.tsx`
- Delete: `apps/web/src/components/dictionary/FormGroup.tsx`
- Delete: `apps/web/src/test/FormGroup.test.tsx`

**Interfaces:**
- Consumes: `formCategoryColor`, `categorizeFormLabel` (Task 2). `RootForm`.
- Produces: `<FormFilterChips forms={RootForm[]} selected={number[]}
  onToggle={(id: number) => void} />`. Task 8 (`ConcordanceSection`) owns
  `selected` state and passes the toggle handler.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/src/test/FormFilterChips.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormFilterChips } from '../components/dictionary/FormFilterChips';
import type { RootForm } from '@quran-corpus/data';

const forms: RootForm[] = [
  {
    id: 1, root_id: 1, sort_order: 0, pos_label: 'Form I verb',
    form_arabic: 'غَفَرَ', form_translit: 'ghafara', gloss: null, occurrence_count: 65,
  },
  {
    id: 2, root_id: 1, sort_order: 1, pos_label: 'Nominal',
    form_arabic: 'غَفُور', form_translit: 'ghafūr', gloss: 'Oft-Forgiving', occurrence_count: 91,
  },
];

describe('FormFilterChips', () => {
  it('renders one button per form with its label, arabic, translit, gloss, count', () => {
    render(<FormFilterChips forms={forms} selected={[]} onToggle={vi.fn()} />);
    expect(screen.getByText('Form I verb')).toBeInTheDocument();
    expect(screen.getByText('غَفَرَ')).toBeInTheDocument();
    expect(screen.getByText('ghafara')).toBeInTheDocument();
    expect(screen.getByText('Oft-Forgiving')).toBeInTheDocument();
    expect(screen.getByText('91')).toBeInTheDocument();
  });

  it('aria-pressed reflects the selected set', () => {
    render(<FormFilterChips forms={forms} selected={[2]} onToggle={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    const ghafara = buttons.find((b) => b.textContent?.includes('ghafara'))!;
    const ghafur = buttons.find((b) => b.textContent?.includes('ghafūr'))!;
    expect(ghafara).toHaveAttribute('aria-pressed', 'false');
    expect(ghafur).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onToggle with the form id when clicked', async () => {
    const onToggle = vi.fn();
    render(<FormFilterChips forms={forms} selected={[]} onToggle={onToggle} />);
    await userEvent.click(screen.getByText('ghafara'));
    expect(onToggle).toHaveBeenCalledWith(1);
  });

  it('renders nothing when forms is empty', () => {
    const { container } = render(<FormFilterChips forms={[]} selected={[]} onToggle={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run src/test/FormFilterChips.test.tsx`
Expected: FAIL -- module doesn't exist

- [ ] **Step 3: Implement `FormFilterChips`**

```typescript
// apps/web/src/components/dictionary/FormFilterChips.tsx
import type { RootForm } from '@quran-corpus/data';
import { categorizeFormLabel, formCategoryColor } from '../../lib/formCategoryColor';

interface FormFilterChipsProps {
  forms: RootForm[];
  /** root_forms.id values currently selected. Empty = "All" (no filter). */
  selected: number[];
  onToggle: (formId: number) => void;
}

/** Turns the root's derived forms into tappable, multi-select filter chips --
 *  same content as the old static FormGroup row (pos_label, Arabic form,
 *  transliteration, gloss, count), now a real <button aria-pressed> in a
 *  flex-wrap row so it scales to a 22-form root without horizontal scroll. */
export function FormFilterChips({ forms, selected, onToggle }: FormFilterChipsProps) {
  if (forms.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {forms.map((f) => {
        const isSelected = selected.includes(f.id);
        const color = formCategoryColor(categorizeFormLabel(f.pos_label));
        return (
          <button
            key={f.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onToggle(f.id)}
            className="flex flex-wrap items-baseline gap-2 rounded-xl border px-3 py-2 text-left transition-colors"
            style={{
              borderColor: isSelected ? color : 'transparent',
              backgroundColor: isSelected
                ? `color-mix(in srgb, ${color} 12%, transparent)`
                : undefined,
            }}
          >
            <span className="text-sm font-medium" style={{ color }}>
              {f.pos_label}
            </span>
            {f.form_arabic && (
              <span dir="rtl" className="font-arabic text-xl text-paper-900 dark:text-paper-100">
                {f.form_arabic}
              </span>
            )}
            {f.form_translit && (
              <span className="text-sm text-paper-500">{f.form_translit}</span>
            )}
            {f.gloss && (
              <span className="text-sm text-paper-700 dark:text-paper-300">{f.gloss}</span>
            )}
            <span className="shrink-0 text-sm text-paper-500">{f.occurrence_count}</span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm vitest run src/test/FormFilterChips.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Delete FormGroup**

```bash
git rm apps/web/src/components/dictionary/FormGroup.tsx apps/web/src/test/FormGroup.test.tsx
```

(`RootEntry.tsx` still imports it at this point -- Task 8 removes that
import when it wires in `ConcordanceSection`. Leaving the deletion here,
scoped to its own commit, keeps this task's diff focused on
`FormFilterChips` alone; Task 8's diff will fail to compile for one task in
isolation if reviewed standalone, which is expected and resolved by that
task's own commit -- call this out to the Task 8 reviewer.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(web/dictionary): add FormFilterChips, remove now-superseded FormGroup"
```

---

### Task 8: ConcordanceSection + RootEntry wiring

**Files:**
- Create: `apps/web/src/components/dictionary/ConcordanceSection.tsx`
- Modify: `apps/web/src/components/dictionary/RootEntry.tsx`
- Test: `apps/web/src/test/ConcordanceSection.test.tsx` (new)
- Modify: `apps/web/src/test/RootEntry.test.tsx`

**Interfaces:**
- Consumes: `FormFilterChips` (Task 7), `ConcordanceList` with `forms`/
  `selectedFormIds` props (Tasks 5-6).
- Produces: `<ConcordanceSection forms={RootForm[]} initialConcordance=
  {ConcordanceEntry[]} total={number} rootBw={string} />` -- the single
  stateful parent `RootEntry` renders instead of the old two sibling
  sections.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/src/test/ConcordanceSection.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConcordanceSection } from '../components/dictionary/ConcordanceSection';
import type { RootForm, ConcordanceEntry } from '@quran-corpus/data';

const forms: RootForm[] = [
  {
    id: 1, root_id: 1, sort_order: 0, pos_label: 'Form I verb',
    form_arabic: 'غَفَرَ', form_translit: 'ghafara', gloss: null, occurrence_count: 1,
  },
];

const entries: ConcordanceEntry[] = [
  {
    surah_id: 2, ayah_number: 58, position: 16, word_id: 500,
    text_arabic: 'نَغْفِرْ', transliteration: 'naghfir', gloss: 'We will forgive',
    form_id: 1, verse_words: [{ id: 500, position: 16, text_arabic: 'نَغْفِرْ' }],
  },
];

describe('ConcordanceSection', () => {
  it('renders the chips and the concordance list together', () => {
    render(
      <ConcordanceSection forms={forms} initialConcordance={entries} total={1} rootBw="gfr" />,
    );
    expect(screen.getByText('Form I verb')).toBeInTheDocument();
    expect(screen.getByText('نَغْفِرْ')).toBeInTheDocument();
  });

  it('clicking a chip selects it (aria-pressed) without crashing, no forms= fetch needed here', async () => {
    render(
      <ConcordanceSection forms={forms} initialConcordance={entries} total={1} rootBw="gfr" />,
    );
    const chip = screen.getByRole('button', { name: /ghafara/i });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking a selected chip again deselects it (back to All)', async () => {
    render(
      <ConcordanceSection forms={forms} initialConcordance={entries} total={1} rootBw="gfr" />,
    );
    const chip = screen.getByRole('button', { name: /ghafara/i });
    await userEvent.click(chip);
    await userEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders nothing for the chip row when there are no forms, list still shows', () => {
    render(<ConcordanceSection forms={[]} initialConcordance={entries} total={1} rootBw="gfr" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('نَغْفِرْ')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm vitest run src/test/ConcordanceSection.test.tsx`
Expected: FAIL -- module doesn't exist

- [ ] **Step 3: Implement `ConcordanceSection`**

```typescript
// apps/web/src/components/dictionary/ConcordanceSection.tsx
'use client';

import { useState } from 'react';
import type { RootForm, ConcordanceEntry } from '@quran-corpus/data';
import { FormFilterChips } from './FormFilterChips';
import { ConcordanceList } from './ConcordanceList';

interface ConcordanceSectionProps {
  forms: RootForm[];
  initialConcordance: ConcordanceEntry[];
  total: number;
  rootBw: string;
}

/** Owns the derived-form filter selection and coordinates FormFilterChips
 *  (the interactive replacement for the old static "Derived forms" list)
 *  with ConcordanceList (which tags each row and refetches when the
 *  selection changes). Toggling a chip adds/removes its id from the
 *  selection -- multi-select, "nothing selected" means "All". */
export function ConcordanceSection({
  forms,
  initialConcordance,
  total,
  rootBw,
}: ConcordanceSectionProps) {
  const [selected, setSelected] = useState<number[]>([]);

  function toggle(formId: number) {
    setSelected((prev) =>
      prev.includes(formId) ? prev.filter((id) => id !== formId) : [...prev, formId],
    );
  }

  return (
    <div className="space-y-4">
      <FormFilterChips forms={forms} selected={selected} onToggle={toggle} />
      <ConcordanceList
        initialEntries={initialConcordance}
        total={total}
        rootBw={rootBw}
        forms={forms}
        selectedFormIds={selected}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && pnpm vitest run src/test/ConcordanceSection.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire into RootEntry**

Modify `apps/web/src/components/dictionary/RootEntry.tsx` -- replace the
`FormGroup` import and the two sibling `forms`/`ConcordanceList` sections
with one `ConcordanceSection`:

```typescript
import Link from 'next/link';
import type { RootEntry as RootEntryT, ConcordanceEntry } from '@quran-corpus/data';
import { ConcordanceSection } from './ConcordanceSection';

interface RootEntryProps {
  entry: RootEntryT;
  /** First page of the concordance; the rest is paged in client-side. */
  initialConcordance: ConcordanceEntry[];
  /** Total occurrences across the whole concordance. */
  total: number;
  /** Hijāʾī-adjacent roots for prev/next nav; null at the list ends. */
  prevBw: string | null;
  nextBw: string | null;
}

const sourceLabel = (source: string): string =>
  source === 'lane' || source === 'qurandev-lane' ? "Lane's Lexicon" : source;

/**
 * Full root entry: header, Lane's definition (additive — omitted when empty),
 * derived-form filter chips, and the concordance section.
 */
export function RootEntry({ entry, initialConcordance, total, prevBw, nextBw }: RootEntryProps) {
  const { root, forms, definitions } = entry;
  return (
    <article>
      <header className="mb-6">
        <h1
          dir="rtl"
          className="font-arabic text-4xl text-paper-900 dark:text-paper-100"
        >
          {root.root_arabic}
        </h1>
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
        <nav aria-label="Adjacent roots" className="mt-4 flex items-center justify-between">
          {prevBw ? (
            <Link
              href={`/dictionary/${encodeURIComponent(prevBw)}`}
              aria-label="Previous root"
              className="rounded-lg border border-paper-300 px-3 py-1.5 text-sm text-paper-700 transition-colors hover:bg-paper-200 dark:border-night-100 dark:text-paper-300 dark:hover:bg-night-100"
            >
              ← Previous
            </Link>
          ) : (
            <span
              aria-label="Previous root"
              aria-disabled="true"
              className="rounded-lg border border-paper-200 px-3 py-1.5 text-sm text-paper-300 dark:border-night-50 dark:text-paper-600"
            >
              ← Previous
            </span>
          )}
          {nextBw ? (
            <Link
              href={`/dictionary/${encodeURIComponent(nextBw)}`}
              aria-label="Next root"
              className="rounded-lg border border-paper-300 px-3 py-1.5 text-sm text-paper-700 transition-colors hover:bg-paper-200 dark:border-night-100 dark:text-paper-300 dark:hover:bg-night-100"
            >
              Next →
            </Link>
          ) : (
            <span
              aria-label="Next root"
              aria-disabled="true"
              className="rounded-lg border border-paper-200 px-3 py-1.5 text-sm text-paper-300 dark:border-night-50 dark:text-paper-600"
            >
              Next →
            </span>
          )}
        </nav>
      </header>

      {definitions.length > 0 && (
        <section className="mb-8 space-y-3">
          {definitions.map((d) => (
            <div
              key={d.id}
              className="rounded-lg border border-paper-200 bg-paper-100 px-4 py-3 dark:border-night-100 dark:bg-night-50"
            >
              <p className="break-words text-sm leading-relaxed text-paper-800 dark:text-paper-200">
                {d.definition}
              </p>
              <p className="mt-2 text-xs text-paper-500">{sourceLabel(d.source)}</p>
            </div>
          ))}
        </section>
      )}

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium text-paper-600 dark:text-paper-400">
          Concordance ({total})
        </h2>
        <ConcordanceSection
          forms={forms}
          initialConcordance={initialConcordance}
          total={total}
          rootBw={root.root_buckwalter}
        />
      </section>
    </article>
  );
}
```

- [ ] **Step 6: Update RootEntry's test**

Modify `apps/web/src/test/RootEntry.test.tsx` -- the existing `'renders form
groups'` test (`expect(screen.getByText('Noun')).toBeInTheDocument()`)
already passes unmodified: `FormFilterChips` still renders the `pos_label`
text ("Noun") via `ConcordanceSection`, just as a chip instead of a static
row. No other existing assertion in this file references `FormGroup`
directly, so no further edits are needed here -- run the suite to confirm.

- [ ] **Step 7: Run tests to verify everything passes**

Run: `cd apps/web && pnpm vitest run src/test/RootEntry.test.tsx src/test/ConcordanceSection.test.tsx`
Expected: PASS (all tests)

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/dictionary/ConcordanceSection.tsx apps/web/src/components/dictionary/RootEntry.tsx apps/web/src/test/ConcordanceSection.test.tsx apps/web/src/test/RootEntry.test.tsx
git commit -m "feat(web/dictionary): wire ConcordanceSection into RootEntry, replacing the static forms list"
```

---

### Task 9: Full verification + manual check + docs

**Files:** none created/modified beyond `STATUS.md`.

**Interfaces:** none -- this task only verifies and records.

- [ ] **Step 1: Full test suite**

Run:
```bash
cd packages/data && pnpm vitest run
cd ../../apps/web && pnpm vitest run
```
Expected: PASS, 0 failures, in both packages.

- [ ] **Step 2: Type-check and lint**

Run:
```bash
cd apps/web && pnpm tsc --noEmit && pnpm lint
cd ../../packages/data && pnpm tsc --noEmit
```
Expected: clean (no errors, no warnings) in both.

- [ ] **Step 3: Manual verification against the dev server**

Start the dev server if not already running (`pnpm --filter web dev`), then
check three roots directly:

- `/dictionary/gfr` (غفر) -- chips for all 9 forms, tapping "ghafara" narrows
  the concordance to 65 entries, tapping it again returns to "All" (234).
- `/dictionary/rHm` (رحم) -- same check, 9 forms, 339 total.
- `/dictionary/qwm` (قوم) -- 22 forms: confirm the chip row **wraps** across
  multiple lines on a narrow (375px) mobile viewport rather than overflowing
  or requiring horizontal scroll.

- [ ] **Step 4: Record the Task 1 spike numbers in STATUS.md**

Using the real output from Task 1's script run, add a note under `## Data DB`
in `STATUS.md`, e.g.:

```markdown
- Concordance derived-form join (lemma text match): spiked across all 1,642
  roots -- <N> roots checked, <M> with >=1 unmatched occurrence, <X>%
  unmatched rate overall. Fallback (form_id: null, untagged, excluded from
  filters, never dropped) covers the gap; no backfill needed.
```

- [ ] **Step 5: Greptile**

Push the branch, open a PR, wait for the Greptile check. Per CLAUDE.md §5,
address every finding (fix or document as false-positive) until it scores
5/5 before merging.

- [ ] **Step 6: Commit the STATUS.md update**

```bash
git add STATUS.md
git commit -m "docs: record concordance derived-form join spike results"
```

## Self-Review Notes

- **Spec coverage:** every spec section (data spike, color categorization,
  data-layer join+filter, API param, per-row tag, filter-aware refetch, chip
  component, stateful parent, error handling for unmatched lemma / double-
  stem / zero-forms / stale-filter, testing) maps to a task above.
- **Placeholder scan:** no TBD/TODO; every step has runnable code or an exact
  command.
- **Type consistency:** `ConcordanceEntry.form_id: number | null` (Task 3) is
  the same shape `FormTag` (Task 5), the new `roots.test.ts` assertions
  (Task 3), and `ConcordanceSection`'s fixture (Task 8) all use.
  `ConcordancePageOpts.formIds?: number[]` (Task 3) matches the API route's
  `parseFormIds` return type (Task 4) and `ConcordanceList`'s
  `selectedFormIds?: number[]` prop (Task 6). `RootForm` is unchanged
  throughout (no new fields needed -- `pos_label`/`form_arabic`/
  `form_translit`/`gloss`/`occurrence_count` already cover both the tag and
  the chip).
