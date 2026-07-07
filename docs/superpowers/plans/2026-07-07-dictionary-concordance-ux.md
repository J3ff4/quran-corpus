# Phase 11 — Dictionary/Concordance UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Concordance verses trimmed & readable, root pages navigable (prev/next), root/concordance counts consistent (compound roots included), letter-pills centered.

**Architecture:** Data-layer changes are pure functions/queries in `packages/data/src/queries/roots.ts` (web/Next-agnostic, vitest). UI wiring in `apps/web`. Concordance matching moves from `words.root_buckwalter` (primary root only) to `word_segments.root` (all segments) via an `EXISTS` subquery, catching compound words whose secondary segment carries the root. Verse trimming is a pure, portable function.

**Tech Stack:** TypeScript, libSQL/SQLite (`@libsql/client`), Next.js 15 App Router, React, Tailwind, vitest, Python (spike script only).

Source spec: `docs/superpowers/specs/2026-07-07-dictionary-concordance-ux-design.md`.

## Global Constraints

- Canonical DB `/home/claude/quran-data/quran.db`; `apps/web/quran.db` is a symlink to it. Back up (`.bak`) before any data write; no concurrent scraper writers. (This phase does **no** DB writes; the Unit B spike reads only.)
- `packages/data` stays web/Next-agnostic (no Next imports, portable to future `apps/mobile`).
- Client components (`'use client'`) import data values from `@quran-corpus/data/client`, never the barrel `@quran-corpus/data` (libsql poison → kills hydration). Types may come from either.
- TDD: RED → GREEN → COMMIT per task. Watch every test fail before implementing.
- Conventional Commits. Commit **named paths only** — never `git add -A`.
- Never commit `STATUS.md` or `docs/handoff-*.md` (keep untracked).
- Greptile §5 = 5/5 (check pass) is a hard block before merge.
- Subagents: Sonnet floor (`claude-sonnet-4-6`+); do not spawn unless the user explicitly asks.
- Branch: `phase-11-dictionary-concordance-ux` (already created off main; spec committed `ebed688`).
- Data gates before each data commit: `pnpm --filter @quran-corpus/data lint && ... typecheck && ... test`. Web gates: `pnpm --filter web lint && ... typecheck && ... test`.

**Task order:** 1 (E) → 2 (A) → 3 (C) → 4 (D) → 5–7 (B). Rationale: E is verification that may enlarge scope (know early); A/C/D are self-contained wins; B is spike-gated and may reshape, so last.

---

## Task 1: Load-more re-test (Unit E) — verification, no code by default

**Files:**
- Modify (only if a bug reproduces): a new regression test + the offending component.
- Record outcome in: `docs/AGENDA.md` (mark item resolved-or-bug).

**Interfaces:**
- Consumes: nothing.
- Produces: a recorded verdict. If reproduces → a tracked bug task with a failing test.

Both load-more surfaces were reimplemented since the original AGENDA report:
- Dictionary "Show more" — `apps/web/src/components/dictionary/DictionaryBrowser.tsx:162-172` (client-side `setLimit`, no fetch).
- Concordance "Load more" — `apps/web/src/components/dictionary/ConcordanceList.tsx:108-117` (fetches `/api/roots/<bw>/concordance`).

- [ ] **Step 1: Production build**

Run:
```bash
pnpm --filter web build && pnpm --filter web start
```
Expected: build succeeds, server on `http://localhost:3000`. (Dev mode masks perf/hydration issues — the original report was unverified; only the prod build counts.)

- [ ] **Step 2: Exercise dictionary Show-more**

Open `http://localhost:3000/dictionary`. With no filter (~1,600 roots), click "Show more (N left)" repeatedly to the end. Watch for: rows failing to append, the counter going wrong, a crash, or jank.

- [ ] **Step 3: Exercise concordance Load-more**

Open a high-frequency root page, e.g. `http://localhost:3000/dictionary/rb%20b` (root رب, ~970 occurrences) or `http://localhost:3000/dictionary/qwl` (قول). Click "Load more" to the end. Watch for: duplicate/missing entries, the button not disappearing at the end, fetch errors, or the "Couldn't load more" alert.

- [ ] **Step 4: Record verdict**

- **Does NOT reproduce** → edit `docs/AGENDA.md`, mark the load-more item closed ("re-tested on prod build YYYY-MM-DD, no repro"). Commit only the AGENDA edit:
  ```bash
  git add docs/AGENDA.md
  git commit -m "docs(agenda): close load-more re-test — no repro on prod build"
  ```
- **Reproduces** → STOP. Open a real bug: write a failing test reproducing it first (TDD), root-cause it (grep every caller of the touched function per ponytail — fix once at the shared point), fix, then commit test+fix together. Do not paper over the symptom.

---

## Task 2: Concordance compound-root fix (Unit A)

**Files:**
- Modify: `packages/data/src/queries/roots.ts:148-154` (`countRootConcordance`), `:159-181` (`getRootConcordancePage` — the `matched` query's WHERE only).
- Test: `packages/data/tests/roots.test.ts`.

**Interfaces:**
- Consumes: nothing new.
- Produces: `countRootConcordance(db, bw)` and `getRootConcordancePage(db, bw, opts)` now match on `word_segments.root`. Signatures unchanged.

**Why the change.** Both functions currently match `words.root_buckwalter` — the word's **primary** root only. A compound word whose **secondary** segment carries the root is dropped. Real case: root `Amm` (أ م م) header shows 119 (from `roots.occurrence_count`, segment-derived) but the concordance list shows 118 — missing يَبْنَؤُمَّ at 20:94:2, whose primary root is `bny` and whose second segment root is `Amm`. `word_segments.root` is the same Buckwalter encoding as `words.root_buckwalter` and `roots.root_buckwalter` (the scraper's `recompute_occurrence_counts` groups `word_segments.root` to match `roots.root_buckwalter`), so swapping the match column is a drop-in.

**Implementation choice.** Match with `WHERE EXISTS (SELECT 1 FROM word_segments s WHERE s.word_id = w.id AND s.root = ?)` rather than a `JOIN ... DISTINCT`. EXISTS is boolean-per-word: one row per matching word, no join fan-out, no `DISTINCT` over the wide SELECT. `COUNT` and list length stay equal by construction.

**Fixture consequence (important).** Existing concordance tests seed `words` with `root_buckwalter` set but **no `word_segments`**. After this change those words no longer match. The affected fixtures must also insert a stem `word_segment` carrying the root. This is required, not optional — do it in Step 1.

- [ ] **Step 1: Update existing concordance fixtures to seed word_segments, and add the compound test (RED)**

In `packages/data/tests/roots.test.ts`, every place that inserts a word expected to match a concordance query must also insert a `word_segments` row with that root. Add a small helper near the top of the `describe` block and use it. Then add the new compound-root test.

Add helper after the imports/`beforeAll` (module scope inside the test file):
```typescript
/** Insert a stem segment carrying `root` for an existing word, so the
 *  concordance queries (which now match word_segments.root) see it. */
async function seedSegment(wordId: number, root: string): Promise<void> {
  await db.execute({
    sql: `INSERT INTO word_segments (word_id,segment_index,segment_type,root)
          VALUES (?,0,'stem',?)`,
    args: [wordId, root],
  });
}
```

In `beforeAll`, after the two `words` rows are inserted (the `بِسْمِ`/`ٱللَّهِ` pair), seed a segment for the `smw` word:
```typescript
await seedSegment(wid, 'smw');
```
(`wid` is already fetched in `beforeAll` for the gloss insert.)

In the `'getRootConcordance batches ayah IDs'` test, after inserting the two `bat` words, fetch their ids and seed segments:
```typescript
const bws = await db.execute(`SELECT id FROM words WHERE root_buckwalter='bat'`);
for (const row of bws.rows) await seedSegment(row['id'] as number, 'bat');
```

In the `'getRootConcordancePage windows with limit/offset'` test, after each `pag` word insert (inside the loop), seed its segment. Change the insert block to capture the word id:
```typescript
const wr = await db.execute({
  sql: `INSERT INTO words (ayah_id,position,text_arabic,root_buckwalter,pos_tag) VALUES (?,1,'ص','pag','N') RETURNING id`,
  args: [aid],
});
await seedSegment(wr.rows[0]!['id'] as number, 'pag');
```

In the `'two matches in one ayah -> two entries'` test, after inserting the two `ktb` words, seed a segment for each:
```typescript
const kws = await db.execute(`SELECT id FROM words WHERE root_buckwalter='ktb'`);
for (const row of kws.rows) await seedSegment(row['id'] as number, 'ktb');
```

Now add the new compound test at the end of the `describe` block:
```typescript
it('concordance matches a compound word via its secondary segment root', async () => {
  // A word whose PRIMARY root is 'bny' but whose second segment carries 'Amm'
  // (the يَبْنَؤُمَّ / 20:94:2 shape). The old words.root_buckwalter match missed it.
  const a = await db.execute(
    `INSERT INTO ayahs (surah_id,ayah_number,text_uthmani) VALUES (1,3,'يَبْنَؤُمَّ') RETURNING id`,
  );
  const aid = a.rows[0]!['id'] as number;
  const w = await db.execute({
    sql: `INSERT INTO words (ayah_id,position,text_arabic,root_buckwalter,pos_tag)
          VALUES (?,1,'يَبْنَؤُمَّ','bny','N') RETURNING id`,
    args: [aid],
  });
  const cid = w.rows[0]!['id'] as number;
  await db.execute({
    sql: `INSERT INTO word_segments (word_id,segment_index,segment_type,root) VALUES (?,0,'stem','bny'),(?,1,'stem','Amm')`,
    args: [cid, cid],
  });
  // Also a plain word carrying Amm as its primary/only segment.
  const w2 = await db.execute({
    sql: `INSERT INTO words (ayah_id,position,text_arabic,root_buckwalter,pos_tag)
          VALUES (?,2,'أُمّ','Amm','N') RETURNING id`,
    args: [aid],
  });
  await seedSegment(w2.rows[0]!['id'] as number, 'Amm');

  expect(await countRootConcordance(db, 'Amm')).toBe(2);
  const list = await getRootConcordancePage(db, 'Amm');
  expect(list.map((e) => e.word_id)).toContain(cid); // compound included
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm --filter @quran-corpus/data test roots`
Expected: the new compound test FAILS (`countRootConcordance` returns 0 or 1, list omits `cid`) because the queries still match `words.root_buckwalter`. The fixture-updated existing tests may also fail until Step 3 — that is expected.

- [ ] **Step 3: Switch both queries to `word_segments.root` (GREEN)**

In `packages/data/src/queries/roots.ts`, `countRootConcordance` (currently lines 148-154):
```typescript
/** Total matched occurrences for a root — the paging total, cheap COUNT with no
 *  verse rebuild. One row per matching word (EXISTS, no join fan-out), so this
 *  equals the entry count of the concordance.
 *  ponytail: word-based count. If a single word ever carried the same root in
 *  two segments, this would read one under roots.occurrence_count (segment-based);
 *  no such word exists in the corpus. Revisit only if that changes. */
export async function countRootConcordance(db: Client, bw: string): Promise<number> {
  const res = await db.execute({
    sql: `SELECT COUNT(*) AS n FROM words w
          WHERE EXISTS (SELECT 1 FROM word_segments s WHERE s.word_id = w.id AND s.root = ?)`,
    args: [bw],
  });
  return res.rows[0]!['n'] as number;
}
```

In `getRootConcordancePage`, the `matched` query (currently line 178 `WHERE w.root_buckwalter = ?`) — replace only the WHERE clause, keep SELECT/JOINs/ORDER/paging exactly:
```typescript
          WHERE EXISTS (SELECT 1 FROM word_segments s WHERE s.word_id = w.id AND s.root = ?)
          ORDER BY a.surah_id, a.ayah_number, w.position${paging}`,
```
The `args` already bind `[lang, bw]` (then optional limit/offset) — order unchanged, the `?` still receives `bw`.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `pnpm --filter @quran-corpus/data test roots`
Expected: all pass, including the compound test and the fixture-updated existing tests.

- [ ] **Step 5: Full data gates**

Run:
```bash
pnpm --filter @quran-corpus/data lint && pnpm --filter @quran-corpus/data typecheck && pnpm --filter @quran-corpus/data test
```
Expected: all green.

- [ ] **Step 6: Spot-check against the canonical DB (no write)**

Run:
```bash
sqlite3 /home/claude/quran-data/quran.db "SELECT (SELECT occurrence_count FROM roots WHERE root_buckwalter='Amm') AS header, (SELECT COUNT(*) FROM words w WHERE EXISTS (SELECT 1 FROM word_segments s WHERE s.word_id=w.id AND s.root='Amm')) AS list;"
```
Expected: `119|119` (header == list; the pre-fix list was 118). If they differ, stop and investigate before committing.

- [ ] **Step 7: Commit**

```bash
git add packages/data/src/queries/roots.ts packages/data/tests/roots.test.ts
git commit -m "fix(data): concordance matches roots on word_segments, incl. compound secondary roots"
```

---

## Task 3: Prev/next root arrows (Unit C)

**Files:**
- Modify: `packages/data/src/queries/roots.ts` (add `getRootNeighbors`).
- Test: `packages/data/tests/roots.test.ts`.
- Modify: `apps/web/src/app/dictionary/[root]/page.tsx` (fetch neighbors, pass down).
- Modify: `apps/web/src/components/dictionary/RootEntry.tsx` (render arrows).
- Test: `apps/web/src/test/RootEntry.test.tsx`.

**Interfaces:**
- Produces: `getRootNeighbors(db: Client, bw: string): Promise<{ prev: string | null; next: string | null }>` — adjacent roots' `root_buckwalter` in hijāʾī order; `null` at the ends and for unknown roots.
- Consumes (UI): `RootEntry` gains props `prevBw: string | null` and `nextBw: string | null`.

**Ordering must match the list.** `getAllRoots` already returns roots sorted by `compareRootsArabic` (hijāʾī). `getRootNeighbors` reuses `getAllRoots` and indexes into it — do **not** re-derive a second sort, or arrows could disagree with the browse order.

- [ ] **Step 1: Write the failing test for `getRootNeighbors` (RED)**

The `beforeAll` seeds roots `smw`/`ktb`/`$Am`, hijāʾī order `['smw','$Am','ktb']` (asserted by the existing `getAllRoots` test). Add to `roots.test.ts`, and import `getRootNeighbors` in the import block:
```typescript
it('getRootNeighbors returns hijāʾī-adjacent roots; null at ends', async () => {
  // order: smw < $Am < ktb
  expect(await getRootNeighbors(db, '$Am')).toEqual({ prev: 'smw', next: 'ktb' });
  expect(await getRootNeighbors(db, 'smw')).toEqual({ prev: null, next: '$Am' });
  expect(await getRootNeighbors(db, 'ktb')).toEqual({ prev: '$Am', next: null });
  expect(await getRootNeighbors(db, 'zzz')).toEqual({ prev: null, next: null });
});
```
Add `getRootNeighbors` to the existing import from `'../src/queries/roots.js'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @quran-corpus/data test roots`
Expected: FAIL — `getRootNeighbors is not a function`.

- [ ] **Step 3: Implement `getRootNeighbors` (GREEN)**

Append to `packages/data/src/queries/roots.ts`:
```typescript
/** Hijāʾī-adjacent roots (by root_buckwalter) for prev/next navigation.
 *  Reuses getAllRoots' ordering so arrows always agree with the browse list.
 *  ponytail: loads all roots (~1,600) per call and does an O(n) find. The root
 *  page is force-dynamic and already reads full tables; a dedicated indexed
 *  neighbor query isn't worth a second ordering to keep in sync. */
export async function getRootNeighbors(
  db: Client,
  bw: string,
): Promise<{ prev: string | null; next: string | null }> {
  const all = await getAllRoots(db);
  const i = all.findIndex((r) => r.root_buckwalter === bw);
  if (i === -1) return { prev: null, next: null };
  return {
    prev: i > 0 ? all[i - 1]!.root_buckwalter : null,
    next: i < all.length - 1 ? all[i + 1]!.root_buckwalter : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @quran-corpus/data test roots`
Expected: PASS. Then full data gates:
```bash
pnpm --filter @quran-corpus/data lint && pnpm --filter @quran-corpus/data typecheck && pnpm --filter @quran-corpus/data test
```

- [ ] **Step 5: Commit the data layer**

```bash
git add packages/data/src/queries/roots.ts packages/data/tests/roots.test.ts
git commit -m "feat(data): getRootNeighbors for hijāʾī prev/next root navigation"
```

- [ ] **Step 6: Write the failing UI test (RED)**

`RootEntry` is a server component (no `'use client'`) rendering plain markup, so it renders in the existing jsdom test. Read the current `apps/web/src/test/RootEntry.test.tsx` for its render helper/fixture shape, then add:
```tsx
it('renders prev/next root links, disabled at an end', () => {
  // reuse the file's existing entry fixture builder; passing prevBw/nextBw
  render(
    <RootEntry
      entry={fixtureEntry}
      initialConcordance={[]}
      total={0}
      prevBw="smw"
      nextBw={null}
    />,
  );
  const prev = screen.getByRole('link', { name: /previous root/i });
  expect(prev).toHaveAttribute('href', '/dictionary/smw');
  // next is at the end → not a link
  expect(screen.queryByRole('link', { name: /next root/i })).toBeNull();
  expect(screen.getByLabelText(/next root/i)).toHaveAttribute('aria-disabled', 'true');
});
```
(`fixtureEntry` = whatever the file already constructs for the base render test — reuse it; do not invent a new shape.)

- [ ] **Step 7: Run UI test to verify it fails**

Run: `pnpm --filter web test RootEntry`
Expected: FAIL — `RootEntry` has no `prevBw`/`nextBw` props and renders no such links.

- [ ] **Step 8: Add arrows to `RootEntry` (GREEN)**

In `apps/web/src/components/dictionary/RootEntry.tsx`: add `Link` import and two props, and render a nav in the header. Update the props interface and signature:
```tsx
import Link from 'next/link';
```
```tsx
interface RootEntryProps {
  entry: RootEntryT;
  initialConcordance: ConcordanceEntry[];
  total: number;
  /** Hijāʾī-adjacent roots for prev/next nav; null at the list ends. */
  prevBw: string | null;
  nextBw: string | null;
}

export function RootEntry({ entry, initialConcordance, total, prevBw, nextBw }: RootEntryProps) {
```
Inside `<header>`, after the closing `</div>` of the letter/occurrence row (before `</header>`), add:
```tsx
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
```

- [ ] **Step 9: Wire the route to supply neighbors**

In `apps/web/src/app/dictionary/[root]/page.tsx`: import `getRootNeighbors`, add it to the `Promise.all`, pass props. Change the import and the body:
```tsx
import { getRootEntry, getRootConcordancePage, countRootConcordance, getRootNeighbors } from '@quran-corpus/data';
```
```tsx
  const [initialConcordance, total, neighbors] = await Promise.all([
    getRootConcordancePage(db, bw, { limit: PAGE, offset: 0 }),
    countRootConcordance(db, bw),
    getRootNeighbors(db, bw),
  ]);
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <RootEntry
        entry={entry}
        initialConcordance={initialConcordance}
        total={total}
        prevBw={neighbors.prev}
        nextBw={neighbors.next}
      />
    </main>
  );
```

- [ ] **Step 10: Run UI test + web gates to verify GREEN**

Run: `pnpm --filter web test RootEntry`
Expected: PASS. Then:
```bash
pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web test
```
Note: any other `RootEntry` render in the test file now needs `prevBw`/`nextBw` props — add `prevBw={null} nextBw={null}` to those calls if typecheck flags them.

- [ ] **Step 11: Commit the UI**

```bash
git add apps/web/src/components/dictionary/RootEntry.tsx apps/web/src/app/dictionary/[root]/page.tsx apps/web/src/test/RootEntry.test.tsx
git commit -m "feat(web/dictionary): prev/next root arrows on root page"
```

---

## Task 4: Pill-letter centering (Unit D) — CSS only

**Files:**
- Modify: `apps/web/src/components/dictionary/AlphabetGrid.tsx:23` (the `<nav>` class list).

**Interfaces:** none. Visual-only.

The letter-pill row (`<nav>` in `AlphabetGrid`) is `flex flex-wrap gap-1.5` — left-aligned, so a partly-filled last row looks ragged/off-center (screenshot 2922). Add `justify-center`.

- [ ] **Step 1: Center the pill row**

In `apps/web/src/components/dictionary/AlphabetGrid.tsx`, change the `<nav>` className:
```tsx
    <nav dir="rtl" aria-label="Filter roots by letter" className="mb-6 flex flex-wrap justify-center gap-1.5">
```
No unit test — `justify-center` is a trivial declarative style with nothing to assert in jsdom (no layout engine). Verify visually in Step 2.

- [ ] **Step 2: Verify in the build**

Run:
```bash
pnpm --filter web build && pnpm --filter web start
```
Open `http://localhost:3000/dictionary` on a mobile viewport (DevTools ~390px). Expected: the letter grid is horizontally centered; the last wrapped row centers under the rows above.

- [ ] **Step 3: Web gates + commit**

```bash
pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web test
git add apps/web/src/components/dictionary/AlphabetGrid.tsx
git commit -m "style(web/dictionary): center letter-pill row"
```

---

## Task 5: Concordance clause-trim SPIKE (Unit B) — throwaway, gates Tasks 6–7

**Files:**
- Create (throwaway, do **not** commit): `packages/scraper/scripts/spike_clause_trim.py` (or a scratchpad script).
- Record decision in: `docs/handoff-2026-07-07-clause-trim-spike.md` (untracked) and inline in Task 6 selection.

**Interfaces:** none — read-only investigation.

**Question the spike answers:** does trimming a concordance verse to the **clause** around the matched word (using corpus grammar) read sensibly, or should we ship the simpler ±4 word-window? `word_segments.pos_tag` carries `CONJ` (coordinating و/ف/ثم) and `SUB` (subordinating). A word *starts a new clause* if its first segment's `pos_tag` is in a boundary set (candidate `{CONJ, SUB}`).

- [ ] **Step 1: Write the read-only spike script**

Create a script that, for a set of anchors, prints the full verse and the clause-trimmed window with the match marked. Read-only; hits the canonical DB.
```python
"""THROWAWAY spike — clause-trim readability check. Read-only. Do not commit."""
import sqlite3

DB = "/home/claude/quran-data/quran.db"
BOUNDARY = {"CONJ", "SUB"}  # candidate; note in the writeup if it needs widening
ANCHORS = [  # (surah, ayah, position) — 2:282 is the longest verse in the Quran
    (2, 282, 8), (2, 282, 86), (4, 11, 5), (2, 255, 3), (12, 4, 2),
]

def first_seg_pos(cur, word_id):
    row = cur.execute(
        "SELECT pos_tag FROM word_segments WHERE word_id=? ORDER BY segment_index LIMIT 1",
        (word_id,),
    ).fetchone()
    return row[0] if row else None

def run():
    con = sqlite3.connect(DB)
    cur = con.cursor()
    for surah, ayah, pos in ANCHORS:
        words = cur.execute(
            """SELECT w.id, w.position, w.text_arabic
               FROM words w JOIN ayahs a ON a.id=w.ayah_id
               WHERE a.surah_id=? AND a.ayah_number=? ORDER BY w.position""",
            (surah, ayah),
        ).fetchall()
        starts = [pid in BOUNDARY for (_, _, _) in words for pid in [first_seg_pos(cur, _[0])]]  # noqa
        # index of the matched word
        mi = next(i for i, w in enumerate(words) if w[1] == pos)
        # clause window: from boundary at/left of match to boundary right of match
        lo = mi
        while lo > 0 and not starts[lo]:
            lo -= 1
        hi = mi + 1
        while hi < len(words) and not starts[hi]:
            hi += 1
        window = words[lo:hi]
        full = " ".join(w[2] for w in words)
        trimmed = " ".join(("»%s«" % w[2]) if w[1] == pos else w[2] for w in window)
        print(f"\n=== {surah}:{ayah}:{pos}  ({len(words)} words, window {lo}:{hi}) ===")
        print("FULL   :", full)
        print("TRIMMED:", ("… " if lo > 0 else "") + trimmed + (" …" if hi < len(words) else ""))
    con.close()

if __name__ == "__main__":
    run()
```

- [ ] **Step 2: Run it and eyeball the output**

Run: `python packages/scraper/scripts/spike_clause_trim.py`
Read each TRIMMED line. Judge: is the matched word (marked `»…«`) in a **coherent clause** — not cut mid-genitive, mid-iḍāfa, or mid-thought? Does the phrase stand on its own as something a reader recognizes?

- [ ] **Step 3: Record the gate decision**

Write the verdict to `docs/handoff-2026-07-07-clause-trim-spike.md` (untracked): the boundary set used, 2–3 example TRIMMED lines, and the call:
- ✅ **Clause reads sensibly** → do Task 6 **and** Task 6b (clause upgrade).
- ❌ **Not sensible / too fiddly** → do Task 6 only (±4 window). Skip Task 6b.

- [ ] **Step 4: Delete the spike script**

```bash
rm packages/scraper/scripts/spike_clause_trim.py
```
(Throwaway per TDD — do not keep it "for reference".) Nothing to commit in this task.

---

## Task 6: Concordance verse trim function + baseline ±4 window (Unit B)

**Files:**
- Create: `packages/data/src/text/concordanceTrim.ts`.
- Test: `packages/data/tests/concordanceTrim.test.ts`.
- Modify: `packages/data/src/client.ts` (re-export the pure fn for the client component).
- Modify: `packages/data/src/index.ts` (barrel — export the new module) **only if** the barrel enumerates modules; if it `export *`s `text/*`, no change. Check first.

**Interfaces:**
- Produces: `trimConcordanceVerse(words: VerseWord[], matchWordId: number): { words: VerseWord[]; truncatedBefore: boolean; truncatedAfter: boolean }`. Always includes the matched word; centers it in a ±4 window (≤ 9 words). If `matchWordId` isn't in `words`, returns the input untrimmed with both flags `false` (defensive; shouldn't happen).

This is the **baseline that ships regardless of the spike** (spec's fallback, "no grammar dependency"). It satisfies acceptance criterion 2. Task 6b optionally upgrades the window logic if the spike said clause-trim reads better.

- [ ] **Step 1: Write the failing tests (RED)**

Create `packages/data/tests/concordanceTrim.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { trimConcordanceVerse } from '../src/text/concordanceTrim.js';
import type { VerseWord } from '../src/types.js';

const mk = (n: number): VerseWord[] =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, position: i + 1, text_arabic: `w${i + 1}` }));

describe('trimConcordanceVerse', () => {
  it('short verse (≤9 words) is returned whole, no truncation', () => {
    const r = trimConcordanceVerse(mk(5), 3);
    expect(r.words.map((w) => w.id)).toEqual([1, 2, 3, 4, 5]);
    expect(r.truncatedBefore).toBe(false);
    expect(r.truncatedAfter).toBe(false);
  });
  it('match in the middle of a long verse → ±4 window, both sides truncated', () => {
    const r = trimConcordanceVerse(mk(30), 15); // ids 11..19
    expect(r.words.map((w) => w.id)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(r.truncatedBefore).toBe(true);
    expect(r.truncatedAfter).toBe(true);
    expect(r.words.some((w) => w.id === 15)).toBe(true);
  });
  it('match near the start → no before-truncation, window still holds the match', () => {
    const r = trimConcordanceVerse(mk(30), 2); // ids 1..? centered on 2, clamped left
    expect(r.words[0]!.id).toBe(1);
    expect(r.truncatedBefore).toBe(false);
    expect(r.truncatedAfter).toBe(true);
    expect(r.words.some((w) => w.id === 2)).toBe(true);
  });
  it('match near the end → no after-truncation', () => {
    const r = trimConcordanceVerse(mk(30), 29);
    expect(r.words[r.words.length - 1]!.id).toBe(30);
    expect(r.truncatedBefore).toBe(true);
    expect(r.truncatedAfter).toBe(false);
  });
  it('unknown match id → input returned untrimmed', () => {
    const r = trimConcordanceVerse(mk(5), 999);
    expect(r.words).toHaveLength(5);
    expect(r.truncatedBefore).toBe(false);
    expect(r.truncatedAfter).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm --filter @quran-corpus/data test concordanceTrim`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the ±4 window (GREEN)**

Create `packages/data/src/text/concordanceTrim.ts`:
```typescript
import type { VerseWord } from '../types.js';

/** Words to keep on each side of the matched word in a trimmed concordance verse. */
const RADIUS = 4;

export interface TrimmedVerse {
  words: VerseWord[];
  truncatedBefore: boolean;
  truncatedAfter: boolean;
}

/** Trim a concordance verse to a readable window centered on the matched word.
 *  Baseline: ±RADIUS words (≤ 2*RADIUS+1). The matched word is always present;
 *  `truncated*` flags tell the UI where to show a `…`. Unknown match id → the
 *  verse is returned whole (defensive; the matched word is always in verse_words). */
export function trimConcordanceVerse(words: VerseWord[], matchWordId: number): TrimmedVerse {
  const mi = words.findIndex((w) => w.id === matchWordId);
  if (mi === -1) return { words, truncatedBefore: false, truncatedAfter: false };
  const lo = Math.max(0, mi - RADIUS);
  const hi = Math.min(words.length, mi + RADIUS + 1);
  return {
    words: words.slice(lo, hi),
    truncatedBefore: lo > 0,
    truncatedAfter: hi < words.length,
  };
}
```

- [ ] **Step 4: Run tests to verify GREEN**

Run: `pnpm --filter @quran-corpus/data test concordanceTrim`
Expected: PASS.

- [ ] **Step 5: Re-export for client use**

The UI is a client component and must import from `@quran-corpus/data/client`. Add to `packages/data/src/client.ts`, in the existing value-export block:
```typescript
export { trimConcordanceVerse } from './text/concordanceTrim.js';
export type { TrimmedVerse } from './text/concordanceTrim.js';
```
Check `packages/data/src/index.ts`: if it explicitly enumerates `text/*` re-exports, add `export { trimConcordanceVerse } from './text/concordanceTrim.js';` there too; if it already `export *`s the text modules, nothing to add. (Read the file to confirm before editing.)

- [ ] **Step 6: Full data gates**

Run:
```bash
pnpm --filter @quran-corpus/data lint && pnpm --filter @quran-corpus/data typecheck && pnpm --filter @quran-corpus/data test
```
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add packages/data/src/text/concordanceTrim.ts packages/data/tests/concordanceTrim.test.ts packages/data/src/client.ts packages/data/src/index.ts
git commit -m "feat(data): trimConcordanceVerse — ±4 word window around matched word"
```
(Drop `index.ts` from the `git add` if Step 5 didn't modify it.)

---

## Task 6b: CONDITIONAL — clause-boundary upgrade (only if Task 5 spike = ✅)

**Skip this task entirely if the spike verdict was ❌.** The ±4 baseline already ships and satisfies acceptance criterion 2.

**Files:**
- Modify: `packages/data/src/types.ts` (`VerseWord` gains `starts_clause?: boolean`).
- Modify: `packages/data/src/queries/roots.ts` (`getRootConcordancePage` sibling-word query populates `starts_clause`).
- Modify: `packages/data/src/text/concordanceTrim.ts` (window walks to clause boundaries, ±4 cap within an over-long clause).
- Test: `packages/data/tests/concordanceTrim.test.ts`, `packages/data/tests/roots.test.ts`.

**Interfaces:**
- `VerseWord` gains optional `starts_clause?: boolean` (a word whose first segment's `pos_tag` is in the boundary set). Additive/optional → Task 6's tests and the ±4 path stay valid when it's absent.
- `trimConcordanceVerse` signature unchanged; when words carry `starts_clause`, it trims to the clause instead of a fixed ±4, capping at ±4 inside a clause longer than `2*RADIUS+1`.

- [ ] **Step 1: Failing test — clause window (RED)**

Add to `packages/data/tests/concordanceTrim.test.ts`:
```typescript
const mkClause = (n: number, boundaries: number[]): VerseWord[] =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1, position: i + 1, text_arabic: `w${i + 1}`,
    starts_clause: boundaries.includes(i + 1),
  }));

it('trims to the clause when starts_clause is present', () => {
  // boundaries at words 1,6,11 → clauses [1..5],[6..10],[11..15]; match at 8
  const r = trimConcordanceVerse(mkClause(15, [1, 6, 11]), 8);
  expect(r.words.map((w) => w.id)).toEqual([6, 7, 8, 9, 10]);
  expect(r.truncatedBefore).toBe(true);
  expect(r.truncatedAfter).toBe(true);
});
it('caps an over-long clause at ±4 around the match', () => {
  // one clause spanning all 30 words (boundary only at 1); match at 15
  const r = trimConcordanceVerse(mkClause(30, [1]), 15);
  expect(r.words.map((w) => w.id)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19]);
});
```
Import `VerseWord` is already in the test file (Task 6, Step 1).

- [ ] **Step 2: Run to verify RED**

Run: `pnpm --filter @quran-corpus/data test concordanceTrim`
Expected: FAIL — current fn ignores `starts_clause`, returns `[4..12]` not `[6..10]`.

- [ ] **Step 3: Add `starts_clause` to the type**

In `packages/data/src/types.ts`, `VerseWord`:
```typescript
export interface VerseWord {
  id: number;
  position: number;
  text_arabic: string;
  /** True if this word begins a new clause (first segment's pos_tag ∈ boundary
   *  set: CONJ/SUB[/…]). Present only on concordance verses; absent elsewhere. */
  starts_clause?: boolean;
}
```

- [ ] **Step 4: Clause-aware trim (GREEN)**

Replace the body of `trimConcordanceVerse` in `packages/data/src/text/concordanceTrim.ts` (keep `RADIUS`, `TrimmedVerse`):
```typescript
export function trimConcordanceVerse(words: VerseWord[], matchWordId: number): TrimmedVerse {
  const mi = words.findIndex((w) => w.id === matchWordId);
  if (mi === -1) return { words, truncatedBefore: false, truncatedAfter: false };

  const hasClauseInfo = words.some((w) => w.starts_clause);
  let lo: number;
  let hi: number;
  if (hasClauseInfo) {
    // clause = from the boundary at/left of the match to the next boundary right of it
    lo = mi;
    while (lo > 0 && !words[lo]!.starts_clause) lo -= 1;
    hi = mi + 1;
    while (hi < words.length && !words[hi]!.starts_clause) hi += 1;
    // cap an over-long clause to ±RADIUS around the match
    lo = Math.max(lo, mi - RADIUS);
    hi = Math.min(hi, mi + RADIUS + 1);
  } else {
    lo = Math.max(0, mi - RADIUS);
    hi = Math.min(words.length, mi + RADIUS + 1);
  }
  return {
    words: words.slice(lo, hi),
    truncatedBefore: lo > 0,
    truncatedAfter: hi < words.length,
  };
}
```

- [ ] **Step 5: Run trim tests to verify GREEN**

Run: `pnpm --filter @quran-corpus/data test concordanceTrim`
Expected: PASS (both new clause tests and all Task 6 ±4 tests — the ±4 tests use `mk()` which sets no `starts_clause`, so `hasClauseInfo` is false and they hit the ±4 path unchanged).

- [ ] **Step 6: Populate `starts_clause` in the concordance query (RED then GREEN)**

First a failing test in `roots.test.ts` — a matched verse whose sibling word has a `CONJ` first segment should report `starts_clause: true`. Add (uses the `seedSegment` helper from Task 2; note it seeds `pos_tag` NULL, so add a variant):
```typescript
it('concordance verse_words carry starts_clause from segment pos_tag', async () => {
  const a = await db.execute(
    `INSERT INTO ayahs (surah_id,ayah_number,text_uthmani) VALUES (1,4,'x y') RETURNING id`,
  );
  const aid = a.rows[0]!['id'] as number;
  const w1 = await db.execute({
    sql: `INSERT INTO words (ayah_id,position,text_arabic,root_buckwalter) VALUES (?,1,'x','clx') RETURNING id`,
    args: [aid],
  });
  const w2 = await db.execute({
    sql: `INSERT INTO words (ayah_id,position,text_arabic,root_buckwalter) VALUES (?,2,'y','cly') RETURNING id`,
    args: [aid],
  });
  await db.execute({
    sql: `INSERT INTO word_segments (word_id,segment_index,segment_type,pos_tag,root) VALUES (?,0,'stem','N','clx')`,
    args: [w1.rows[0]!['id']],
  });
  await db.execute({
    sql: `INSERT INTO word_segments (word_id,segment_index,segment_type,pos_tag,root) VALUES (?,0,'prefix','CONJ',NULL),(?,1,'stem','N','cly')`,
    args: [w2.rows[0]!['id'], w2.rows[0]!['id']],
  });
  const c = await getRootConcordancePage(db, 'clx');
  const vw = c[0]!.verse_words;
  expect(vw.find((w) => w.text_arabic === 'x')!.starts_clause).toBe(false);
  expect(vw.find((w) => w.text_arabic === 'y')!.starts_clause).toBe(true);
});
```
Run it (FAIL — `starts_clause` undefined). Then in `getRootConcordancePage`, extend the sibling-word query and mapping. Change the sibling SELECT (currently line 192-196) to compute the boundary flag, and add it to the pushed `VerseWord`:
```typescript
    const sib = await db.execute({
      sql: `SELECT w.ayah_id, w.id, w.position, w.text_arabic,
                   EXISTS (SELECT 1 FROM word_segments s
                           WHERE s.word_id = w.id
                             AND s.segment_index = (SELECT MIN(segment_index) FROM word_segments WHERE word_id = w.id)
                             AND s.pos_tag IN ('CONJ','SUB')) AS starts_clause
            FROM words w
            WHERE w.ayah_id IN (${placeholders})
            ORDER BY w.ayah_id, w.position`,
      args: chunk,
    });
```
```typescript
      list.push({
        id: r['id'] as number,
        position: r['position'] as number,
        text_arabic: r['text_arabic'] as string,
        starts_clause: (r['starts_clause'] as number) === 1,
      });
```
(If the spike widened the boundary set beyond `{CONJ, SUB}`, use that exact set here — keep it identical to the spike's recorded set.)

- [ ] **Step 7: Run to verify GREEN + full data gates**

Run: `pnpm --filter @quran-corpus/data test roots concordanceTrim`
Expected: PASS. Then lint + typecheck + test (all three, as in Task 2 Step 5).

- [ ] **Step 8: Commit**

```bash
git add packages/data/src/types.ts packages/data/src/queries/roots.ts packages/data/src/text/concordanceTrim.ts packages/data/tests/concordanceTrim.test.ts packages/data/tests/roots.test.ts
git commit -m "feat(data): clause-boundary concordance trim via segment pos_tag"
```

---

## Task 7: Concordance trimmed render + expand (Unit B UI)

**Files:**
- Modify: `apps/web/src/components/dictionary/ConcordanceList.tsx` (render trimmed verse + expand toggle).
- Test: `apps/web/src/test/ConcordanceList.test.tsx`.

**Interfaces:**
- Consumes: `trimConcordanceVerse` from `@quran-corpus/data/client` (Task 6). Works with or without `starts_clause` (Task 6b), since the fn degrades to ±4.

Each concordance entry renders its verse trimmed by default (matched word always shown, washed), with a `…` where truncated, and a tap/click to reveal the full verse. Motion via a height/opacity transition; respect `prefers-reduced-motion`.

- [ ] **Step 1: Failing component test (RED)**

Read the current `apps/web/src/test/ConcordanceList.test.tsx` for its render helper and entry fixture. A fixture entry needs a `verse_words` array long enough to truncate (> 9 words) with the matched `word_id` in the middle. Add:
```tsx
it('trims a long verse to a window and expands on click', async () => {
  const verse_words = Array.from({ length: 20 }, (_, i) => ({
    id: i + 1, position: i + 1, text_arabic: `و${i + 1}`,
  }));
  const entry = {
    surah_id: 2, ayah_number: 282, position: 10, word_id: 10,
    text_arabic: 'و10', transliteration: null, gloss: null, verse_words,
  };
  render(<ConcordanceList initialEntries={[entry]} total={1} rootBw="tst" />);
  // trimmed: matched word visible, far word (id 1 / و1) hidden until expanded
  expect(screen.getByText('و10')).toBeInTheDocument();
  expect(screen.queryByText('و1')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: /show full verse/i }));
  expect(screen.getByText('و1')).toBeInTheDocument();
});
```
(Import `userEvent` if the test file doesn't already — match the file's existing testing-library setup.)

- [ ] **Step 2: Run to verify RED**

Run: `pnpm --filter web test ConcordanceList`
Expected: FAIL — the full verse renders (no trimming, no expand button); `و1` is present.

- [ ] **Step 3: Implement trimmed render + expand (GREEN)**

In `apps/web/src/components/dictionary/ConcordanceList.tsx`: import the trim fn, and give each `<li>` its own expand state. Extract the verse into a small child component so each row owns its toggle (a top-level `useState` map would be clumsy). Add the import:
```tsx
import { useState as useRowState } from 'react';
import { trimConcordanceVerse } from '@quran-corpus/data/client';
```
(Or reuse the existing `useState` import — just ensure `useState` is imported.) Add this component in the same file, above `ConcordanceList`:
```tsx
function ConcordanceVerse({ entry }: { entry: ConcordanceEntry }) {
  const [expanded, setExpanded] = useRowState(false);
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
          className="mt-1 text-xs text-paper-500 underline-offset-2 hover:underline"
        >
          {expanded ? 'Show less' : 'Show full verse'}
        </button>
      )}
    </>
  );
}
```
Then in the `<li>` body, replace the existing verse `<p dir="rtl" …>{e.verse_words.map(...)}</p>` (lines ~89-99) with:
```tsx
            <ConcordanceVerse entry={e} />
```

- [ ] **Step 4: Run to verify GREEN**

Run: `pnpm --filter web test ConcordanceList`
Expected: PASS.

- [ ] **Step 5: Web gates**

Run:
```bash
pnpm --filter web lint && pnpm --filter web typecheck && pnpm --filter web test
```
Expected: all green. (`prefers-reduced-motion`: the expand is an instant show/hide with no animation, so nothing to gate; if you add a Framer height transition, wrap it so reduced-motion users get the instant toggle.)

- [ ] **Step 6: Manual check on the prod build**

Run: `pnpm --filter web build && pnpm --filter web start`. Open a root with a long verse (e.g. `/dictionary/ktb`, find a 2:282 occurrence). Expected: verse shows a short window with the washed match centered and `…` on truncated sides; "Show full verse" reveals the whole ayah; "Show less" collapses it.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/dictionary/ConcordanceList.tsx apps/web/src/test/ConcordanceList.test.tsx
git commit -m "feat(web/dictionary): trim concordance verses with expand-to-full"
```

---

## Final: phase wrap

- [ ] **Greptile 5/5** on the branch's diff (§5 hard block). Address every finding; re-run to confirm the score before any merge.
- [ ] **Update `docs/AGENDA.md`**: mark items 2, 3, 4, 6 done; item 5 per Task 1's verdict. Commit the AGENDA edit alone.
- [ ] Confirm every acceptance criterion (below) holds on the prod build.

## Acceptance criteria (from spec)

1. `countRootConcordance('Amm')` = 119 and its full concordance list length = 119; matched word set includes the word at 20:94:2. (Task 2)
2. A long concordance verse renders trimmed to a short window with the matched word visible + centered; tapping expands to the full verse; collapses back. (Tasks 6/7)
3. Root page shows ← → arrows stepping hijāʾī order; disabled at first/last root; links land on the correct neighbor. (Task 3)
4. Dictionary letter-pill row is horizontally centered on a mobile viewport. (Task 4)
5. Load-more re-test outcome recorded (fixed-or-not); if a bug reproduced, a tracked fix shipped with a regression test. (Task 1)
