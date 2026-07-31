# Lemma Pages + Clickable Frequency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make lemma-frequency & verb-concordance rows link to a new per-lemma page (top gloss + root definition + paged concordance); row count == destination count.

**Architecture:** Data layer first (portable queries + tests in `packages/data`), then lemma API route, then generalize `ConcordanceList` paging URL, then the lemma page, then wire `FrequencyTable` links. TDD per task; each ends independently testable.

**Tech Stack:** Next.js App Router (server components, `force-dynamic`), TS, libsql, Vitest + Testing Library.

## Global Constraints

- DB reads only. No schema change, no data writes. Live DB `d:\coding\quran-corpus-pwa\quran-data\quran.db`; app reads `apps/web/quran.db` (gitignored copy).
- Verified data: 4832 distinct lemmas, 175 rootless, **0 lemmas map to >1 root**, 1642 roots, 1386 root_definitions.
- `packages/data` web/Next-agnostic (no Next imports). Portable to future `apps/mobile`.
- Client components import from `@quran-corpus/data/client`, NEVER the barrel (`@quran-corpus/data`) — barrel pulls node-only libsql driver, breaks hydration. Server components may use barrel.
- **After ANY `packages/data` src edit run `pnpm --filter @quran-corpus/data build`** — web resolves built `dist/`, stale dist = runtime module-not-found (hit today with `/client`).
- Param key = `lemma_buckwalter`, URL-encoded. Validate via the shared `isLemmaBuckwalter` / `isRootBuckwalter` (packages/data). Charset was re-derived from the live corpus (see `packages/data/src/text/buckwalter.ts`) and is broader than an early draft assumed — it includes digits and `# , . @ [ ] ^ _`. Length caps `LEMMA_BUCKWALTER_MAX = 32` / `ROOT_BUCKWALTER_MAX = 24` (generous headroom; longest observed lemma is 15). Do not hand-roll a per-route regex.
- 6-step loop (§4). `/code-review` user-triggered (step 3) — stop + ask. CodeRabbit gate (§5) before merge. Conventional Commits. Commit **named paths only** — never `git add -A`. Never commit STATUS.md or quran.db.
- Subagents: Sonnet floor; do not spawn unless user explicitly asks.
- Branch: `feat/lemma-pages` (spec already committed here as `b339b1c`).

---

### Task 1: Data queries — lemma entry, concordance, count

**Files:**
- Create: `packages/data/src/queries/lemma.ts`
- Modify: `packages/data/src/types.ts` (add `LemmaEntry`; add `lemma_buckwalter` to `VerbConcordanceEntry`)
- Modify: `packages/data/src/queries/dictionary.ts` (add `lemma_buckwalter` to `getVerbConcordance` SELECT + return)
- Modify: `packages/data/src/index.ts` (export new fns + `LemmaEntry` type)
- Test: `packages/data/tests/lemma.test.ts`

**Interfaces:**
- Consumes: `ConcordanceEntry`, `ConcordancePageOpts` (existing, `types.ts`); `Client` from `@libsql/client`.
- Produces:
  - `interface LemmaEntry { lemma: string; lemma_buckwalter: string; transliteration: string | null; pos_tag: string | null; root_buckwalter: string | null; count: number; top_gloss: string | null; root_definition: string | null; }`
  - `getLemmaEntry(db: Client, lemmaBw: string, lang?: string): Promise<LemmaEntry | null>` (lang default `'en'`)
  - `type LemmaConcordanceOpts = Omit<ConcordancePageOpts, 'formIds'>` — the root-only form-chip filter has no lemma analogue, and a lemma query that silently ignored `formIds` would render an unfiltered page as if it were filtered. Excluding it makes that a compile error.
  - `getLemmaConcordancePage(db: Client, lemmaBw: string, opts?: LemmaConcordanceOpts): Promise<ConcordanceEntry[]>`
  - `countLemmaConcordance(db: Client, lemmaBw: string): Promise<number>`
  - `VerbConcordanceEntry` gains `lemma_buckwalter: string | null`

**Notes for implementer:**
- `words` columns: `text_arabic, transliteration, root, lemma, root_buckwalter, lemma_buckwalter, pos_tag`. Occurrence = one `words` row.
- `getLemmaConcordancePage` mirrors `getRootConcordancePage` (`queries/roots.ts`) BUT filters `WHERE w.lemma_buckwalter = ?` instead of joining root_forms; `form_id` always `null` (no chips). Must still build `verse_words` (whole ayah) so `ConcordanceVerse` trim works — **call the shared `buildVerseWordsByAyah` in `queries/concordance.ts`, do not copy the subquery.** The first cut of this plan said "copy that verse-rebuild subquery from `getRootConcordancePage`" and that is how ~30 duplicated lines got written; they were extracted in review. Copying it again would reintroduce two verse-rebuilds that can drift (batching, annotation stripping, `starts_clause`).
- `top_gloss`: `SELECT g.gloss_text FROM words w JOIN word_glosses g ON g.word_id=w.id WHERE w.lemma_buckwalter=? AND g.language_code=? GROUP BY g.gloss_text ORDER BY COUNT(*) DESC, g.gloss_text LIMIT 1`. Verbatim (raw). Null if none.
- `root_definition`: `SELECT rd.definition FROM roots r JOIN root_definitions rd ON rd.root_id=r.id WHERE r.root_buckwalter=? ORDER BY rd.source LIMIT 1` using the lemma's `root_buckwalter`; null when rootless or no def. **`ORDER BY rd.source` is required, not decorative** — a root with definitions from more than one source has no stable row order without it, so `LIMIT 1` would return whichever row SQLite happened to visit and the lemma page could disagree with the root page on the same root. Matches `getRootDefinitions` in `queries/roots.ts`. Seed a competing-source fixture so the ordering is actually exercised.
- `getLemmaEntry` representative fields — **two different rules, do not merge them**:
  - `lemma` = MIN(lemma), `root_buckwalter` from any occurrence. These ARE constant per `lemma_buckwalter` (verified live: 0 multi-root lemmas, 0 multi-surface lemmas), so a bare column off `GROUP BY lemma_buckwalter LIMIT 1` is safe. **`MIN(lemma)` is still nullable** — `words.lemma` has no NOT NULL constraint, so a lemma whose every occurrence lacks a surface form yields null and `LemmaEntry.lemma: string` would be violated (empty RTL header). Fall back to `buckwalterToArabic(lemmaBw)`, not the raw Buckwalter key: the header renders in the Arabic display face, where a Latin string looks broken.
  - `transliteration` / `pos_tag` are **NOT constant** — they describe the *occurrence*, since every inflected and prefixed form shares the lemma. Live: **2349 of 4832 lemmas carry >1 transliteration**, 304 >1 POS tag. Read as bare columns they resolve to an arbitrary row: the first cut of this plan said "from any occurrence", and the shipped page rendered مَا as `bimā` — proclitic still attached — with the pick free to flip on any re-import. Select the most frequent `(transliteration, pos_tag)` **pair** (`GROUP BY transliteration, pos_tag ORDER BY COUNT(*) DESC, transliteration, pos_tag LIMIT 1`), as a pair so the two can never come from different occurrences. Seed the fixture with an unbalanced pair, minority row first in table order, or the test passes on the broken query too.
  - Known ceiling, do not mistake this for correctness: mode is a heuristic, not a lemma dictionary. `{ll~ah` → `l-lahi`, `{l~a*iY` → `alladhīna`. It buys a *predictable* wrong form instead of an arbitrary one.

- [ ] **Step 1: Write failing tests**

```ts
// packages/data/tests/lemma.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, runMigrations } from '../src/index.js';
import { getLemmaEntry, getLemmaConcordancePage, countLemmaConcordance } from '../src/queries/lemma.js';
import type { Client } from '@libsql/client';

async function seed(db: Client) {
  // 2 surahs/ayahs, a rooted verb lemma (qaAla) x2 + a rootless particle (min) x1
  // Columns verified against live schema: surahs(name_arabic,name_translit,
  // name_translation,revelation_type,ayah_count,order_number all NOT NULL);
  // ayahs(surah_id,ayah_number,text_uthmani NOT NULL).
  await db.execute("INSERT INTO surahs (id,name_arabic,name_translit,name_translation,revelation_type,ayah_count,order_number) VALUES (1,'x','x','x','meccan',3,1)");
  await db.execute("INSERT INTO ayahs (id,surah_id,ayah_number,text_uthmani,text_simple) VALUES (10,1,1,'a','a'),(11,1,2,'b','b')");
  await db.execute("INSERT INTO roots (id,root_arabic,root_buckwalter,occurrence_count) VALUES (5,'قول','qwl',2)");
  await db.execute("INSERT INTO root_definitions (root_id,source,definition) VALUES (5,'lane','to say')");
  await db.execute(`INSERT INTO words (id,ayah_id,position,text_arabic,transliteration,root,lemma,root_buckwalter,lemma_buckwalter,pos_tag) VALUES
    (100,10,1,'قال','qala','قول','قَالَ','qwl','qaAla','V'),
    (101,11,1,'قال','qala','قول','قَالَ','qwl','qaAla','V'),
    (102,10,2,'من','min',NULL,'مِن',NULL,'min','P')`);
  await db.execute("INSERT INTO word_glosses (word_id,language_code,gloss_text,source) VALUES (100,'en','said','corpus'),(101,'en','He said,','corpus'),(102,'en','from','corpus')");
}

describe('lemma queries', () => {
  let db: Client;
  beforeEach(async () => { db = createDatabase('file::memory:'); await runMigrations(db); await seed(db); });

  it('getLemmaEntry: rooted lemma has count, top_gloss, root_definition', async () => {
    const e = await getLemmaEntry(db, 'qaAla');
    expect(e).not.toBeNull();
    expect(e!.count).toBe(2);
    expect(e!.root_buckwalter).toBe('qwl');
    expect(e!.root_definition).toBe('to say');
    // Seed an outright winner (>=2 'said' vs 1 'He said,') rather than a tie:
    // `ORDER BY COUNT(*) DESC, g.gloss_text` IS deterministic, so asserting
    // "either value is fine" would pass even if that ordering were dropped.
    expect(e!.top_gloss).toBe('said');
    expect(e!.pos_tag).toBe('V');
  });

  it('getLemmaEntry: rootless lemma -> null root + null definition', async () => {
    const e = await getLemmaEntry(db, 'min');
    expect(e!.root_buckwalter).toBeNull();
    expect(e!.root_definition).toBeNull();
    expect(e!.count).toBe(1);
  });

  it('getLemmaEntry: unknown -> null', async () => {
    expect(await getLemmaEntry(db, 'zzz')).toBeNull();
  });

  it('countLemmaConcordance matches occurrences', async () => {
    expect(await countLemmaConcordance(db, 'qaAla')).toBe(2);
    expect(await countLemmaConcordance(db, 'zzz')).toBe(0);
  });

  it('getLemmaConcordancePage returns matching rows, paged', async () => {
    const all = await getLemmaConcordancePage(db, 'qaAla', {});
    expect(all).toHaveLength(2);
    expect(all.every((r) => r.form_id === null)).toBe(true);
    const one = await getLemmaConcordancePage(db, 'qaAla', { limit: 1, offset: 0 });
    expect(one).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm --filter @quran-corpus/data test -- lemma`
Expected: FAIL (module `queries/lemma.js` not found).

- [ ] **Step 3: Implement `queries/lemma.ts`**

Write the three functions per the Notes above. `getLemmaConcordancePage` keeps `getRootConcordancePage`'s ordering (surah → ayah → position) but **calls the shared `buildVerseWordsByAyah` for the verse rebuild — do not copy the subquery** (see the Notes; copying it is what produced ~30 duplicated lines the first time). WHERE becomes `w.lemma_buckwalter = ?`, `form_id` is hardcoded `null`. Guard `limit`/`offset` with the shared `assertPagingBounds` before they reach SQL — SQLite reads a negative LIMIT as "no limit". Add `LemmaEntry` to `types.ts`. Export from `index.ts`.

- [ ] **Step 4: Amend `getVerbConcordance`** to add `lemma_buckwalter` to SELECT + returned object; add field to `VerbConcordanceEntry` in `types.ts`.

- [ ] **Step 5: Build the data package**

Run: `pnpm --filter @quran-corpus/data build`
Expected: `dist/queries/lemma.js` exists.

- [ ] **Step 6: Run tests — verify pass**

Run: `pnpm --filter @quran-corpus/data test -- lemma`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/data/src/queries/lemma.ts packages/data/src/queries/dictionary.ts packages/data/src/types.ts packages/data/src/index.ts packages/data/tests/lemma.test.ts
git commit -m "feat(data): lemma entry/concordance/count queries + verb lemma_buckwalter"
```

---

### Task 2: Lemma concordance API route

**Files:**
- Create: `apps/web/src/app/api/lemma/[lemma]/concordance/route.ts`
- Test: `apps/web/src/test/lemmaConcordanceRoute.test.ts`

**Interfaces:**
- Consumes: `getLemmaConcordancePage`, `countLemmaConcordance` (Task 1); `getDatabase` (`apps/web/src/lib/db`).
- Produces: `GET` returning `{ entries: ConcordanceEntry[]; total: number }`. Query params `offset`, `limit`. Same JSON shape as `/api/roots/[root]/concordance` so a shared client can consume both.

**Notes:** Model on `apps/web/src/app/api/roots/[root]/concordance/route.ts`. No `forms` param (lemma has no chips). Validate the param with the shared `isLemmaBuckwalter` (cap `LEMMA_BUCKWALTER_MAX = 32`) rather than an inline regex.

- [ ] **Step 1: Write failing test**

```ts
// apps/web/src/test/lemmaConcordanceRoute.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/db', () => ({ getDatabase: vi.fn(async () => ({} as never)) }));
vi.mock('@quran-corpus/data', () => ({
  getLemmaConcordancePage: vi.fn(async () => [{ word_id: 1 }]),
  countLemmaConcordance: vi.fn(async () => 42),
}));
import { GET } from '../app/api/lemma/[lemma]/concordance/route';

function req(url: string) { return new Request(url); }
const ctx = (lemma: string) => ({ params: Promise.resolve({ lemma }) });

describe('GET /api/lemma/[lemma]/concordance', () => {
  it('returns entries + total', async () => {
    const res = await GET(req('http://x/api/lemma/qaAla/concordance?offset=0&limit=20'), ctx('qaAla'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(42);
    expect(body.entries).toHaveLength(1);
  });

  it('rejects junk lemma with 400', async () => {
    const res = await GET(req('http://x/api/lemma/%20%20/concordance'), ctx('  '));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm --filter web test -- lemmaConcordanceRoute`
Expected: FAIL (route module missing).

- [ ] **Step 3: Implement route** (model on the roots route, drop `forms`, call lemma queries).
  - **Do NOT hand-write a Buckwalter regex here.** The literal this plan originally carried (`/^[A-Za-z'`+><{}|&*$~]{1,16}$/`) omitted digits and `^ # , . @ [ ] _`, which 400s ~280 real lemmas. Use the shared `isLemmaBuckwalter` from `packages/data/src/text/buckwalter.ts`, whose charset was re-derived from the live DB, and let the page route use the same one so SSR and Load-more cannot disagree.
  - **Do not decode the route param at all** — the App Router has already percent-decoded `params` by the time a page or handler sees them. A second `decodeURIComponent` buys nothing and *aliases*: `/api/lemma/qa%2541la/...` decodes to `qa%41la` and then to `qaAla`, serving the real entry under a non-canonical URL that caches separately under the route's `max-age`. Verified against a dev server: it returned 200 with `qaAla`'s data before the second decode was removed, 400 after. Validate the raw segment instead — `%` is outside the Buckwalter charset, so `isLemmaBuckwalter` / `isRootBuckwalter` reject any stray escape, and with no decode there is no `URIError` to catch. Same rule for every dynamic segment, root routes included.

- [ ] **Step 4: Run — verify pass**

Run: `pnpm --filter web test -- lemmaConcordanceRoute`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/api/lemma/[lemma]/concordance/route.ts" apps/web/src/test/lemmaConcordanceRoute.test.ts
git commit -m "feat(web): /api/lemma/[lemma]/concordance paging route"
```

---

### Task 3: Generalize ConcordanceList paging URL

**Files:**
- Modify: `apps/web/src/components/dictionary/ConcordanceList.tsx`
- Modify: `apps/web/src/components/dictionary/ConcordanceSection.tsx` (pass new prop through)
- Test: `apps/web/src/test/ConcordanceList.test.tsx` (extend)

**Interfaces:**
- Consumes: nothing new.
- Produces: `ConcordanceList` accepts a new **optional** prop `endpoint?: string` — the base concordance URL (e.g. `/api/lemma/qaAla/concordance` or `/api/roots/qwl/concordance`). When omitted, defaults to the existing root URL built from `rootBw` (backward-compatible). `rootBw`/`forms`/`selectedFormIds` stay for root use.

**Notes:** Current `buildUrl` hardcodes `/api/roots/${rootBw}/concordance`. Change to use `endpoint ?? \`/api/roots/${encodeURIComponent(rootBw)}/concordance\``, then append `?offset=&limit=` (+ forms only when present). Lemma callers pass `endpoint` + no forms. Keep `rootBw` required for the root path; lemma page will pass a dummy? No — make `rootBw` optional too and require exactly one of {rootBw, endpoint}. Simpler: make `rootBw?` optional, `endpoint?` optional, throw/console.warn if both missing; root callers unchanged (pass rootBw), lemma passes endpoint.

- [ ] **Step 1: Write failing test** — assert Load-more fetches `endpoint` when given.

```ts
// add to ConcordanceList.test.tsx
it('fetches the provided endpoint on load-more', async () => {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ entries: [], total: 0 }) }) as never);
  vi.stubGlobal('fetch', fetchMock);
  render(<ConcordanceList initialEntries={[]} total={40} endpoint="/api/lemma/qaAla/concordance" />);
  fireEvent.click(screen.getByRole('button', { name: /load more/i }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(String(fetchMock.mock.calls[0][0])).toContain('/api/lemma/qaAla/concordance');
});
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm --filter web test -- ConcordanceList`
Expected: FAIL (endpoint ignored / prop unknown).

- [ ] **Step 3: Implement** — add `endpoint?` + `rootBw?` optional, update `buildUrl`.

- [ ] **Step 4: Run — verify pass (incl. existing root tests still green)**

Run: `pnpm --filter web test -- ConcordanceList`
Expected: PASS (new + existing).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/dictionary/ConcordanceList.tsx apps/web/src/components/dictionary/ConcordanceSection.tsx apps/web/src/test/ConcordanceList.test.tsx
git commit -m "refactor(web): ConcordanceList accepts explicit endpoint for reuse"
```

---

### Task 4: LemmaEntry component

**Files:**
- Create: `apps/web/src/components/dictionary/LemmaEntry.tsx`
- Test: `apps/web/src/test/LemmaEntry.test.tsx`

**Interfaces:**
- Consumes: `LemmaEntry`, `ConcordanceEntry` types (from `@quran-corpus/data`); `ConcordanceList` (Task 3); `Link` from next.
- Produces: `export function LemmaEntry({ entry, initialConcordance, total }: { entry: LemmaEntry; initialConcordance: ConcordanceEntry[]; total: number })`.

**Notes:** Server-safe presentational wrapper (may be server component; `ConcordanceList` inside is `'use client'` — fine as child). Render order: header (Arabic `dir=rtl` large, translit, POS, count) → quick meaning (`entry.top_gloss`, skip if null) → root definition block WITH up-link `/dictionary/${encodeURIComponent(entry.root_buckwalter)}` labelled "Definition of root …" (skip whole block if `root_buckwalter` null) → `<ConcordanceList initialEntries={initialConcordance} total={total} endpoint={\`/api/lemma/${encodeURIComponent(entry.lemma_buckwalter)}/concordance\`} />`. Match `RootEntry.tsx` styling classes.

- [ ] **Step 1: Write failing test**

```tsx
// apps/web/src/test/LemmaEntry.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LemmaEntry } from '../components/dictionary/LemmaEntry';

const base = { lemma: 'قَالَ', lemma_buckwalter: 'qaAla', transliteration: 'qala', pos_tag: 'V', count: 2 };

describe('LemmaEntry', () => {
  it('rooted lemma shows gloss + root definition + up-link', () => {
    render(<LemmaEntry entry={{ ...base, root_buckwalter: 'qwl', top_gloss: 'said', root_definition: 'to say' }} initialConcordance={[]} total={2} />);
    expect(screen.getByText('said')).toBeInTheDocument();
    expect(screen.getByText(/to say/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /root/i })).toHaveAttribute('href', '/dictionary/qwl');
  });

  it('rootless lemma: no definition block, no root link', () => {
    render(<LemmaEntry entry={{ ...base, lemma: 'مِن', lemma_buckwalter: 'min', pos_tag: 'P', count: 1, root_buckwalter: null, top_gloss: 'from', root_definition: null }} initialConcordance={[]} total={1} />);
    expect(screen.queryByRole('link', { name: /root/i })).toBeNull();
    expect(screen.getByText('from')).toBeInTheDocument();
  });

  it('null gloss: no meaning block, still renders', () => {
    render(<LemmaEntry entry={{ ...base, root_buckwalter: 'qwl', top_gloss: null, root_definition: 'to say' }} initialConcordance={[]} total={2} />);
    expect(screen.getByText('قَالَ')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm --filter web test -- LemmaEntry`
Expected: FAIL (component missing).

- [ ] **Step 3: Implement `LemmaEntry.tsx`.**

- [ ] **Step 4: Run — verify pass**

Run: `pnpm --filter web test -- LemmaEntry`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/dictionary/LemmaEntry.tsx apps/web/src/test/LemmaEntry.test.tsx
git commit -m "feat(web): LemmaEntry component (header, gloss, root def, concordance)"
```

---

### Task 5: Lemma page route

**Files:**
- Create: `apps/web/src/app/dictionary/lemma/[lemma]/page.tsx`

**Interfaces:**
- Consumes: `getLemmaEntry`, `getLemmaConcordancePage` (Task 1); `isLemmaBuckwalter`, `CONCORDANCE_PAGE_SIZE` (`@quran-corpus/data`); `LemmaEntry` component (Task 4); `getDatabase`; `notFound`. **Not** `countLemmaConcordance` — see the Notes; `entry.count` already is that count. (The API route in Task 3 does consume it: it has no entry to read the total off.)
- Produces: default async page component. `export const dynamic = 'force-dynamic'`.

**Notes:** Mirror `app/dictionary/[root]/page.tsx`. `const { lemma: bw } = await params` — **no decode**, see the Task 3 note. Then `if (!isLemmaBuckwalter(bw)) notFound()` — validate before touching the DB, using the same rule the concordance API enforces, or SSR accepts an identifier the client-side Load-more then 400s on. `getLemmaEntry` → null → `notFound()`. **Reuse `entry.count` as the paging total** — it is `COUNT(*)` over the same predicate as `countLemmaConcordance`, so a second call is an identical round-trip. Fetch the first concordance page (`CONCORDANCE_PAGE_SIZE`) and render `<LemmaEntry key={bw} entry initialConcordance total />` in the same `<main className="mx-auto max-w-2xl px-4 py-8">` wrapper (`key` so in-app nav between two lemmas remounts rather than reusing stale child state).

- [ ] **Step 1: Implement page** (no unit test — thin composition; covered by LemmaEntry + query tests. E2E-style not in repo. Verify by dev server in Step 2).

- [ ] **Step 2: Manual verify against real DB**

Run (LAN, per project convention): `pnpm --filter web dev -p 3939 -H 0.0.0.0`
Visit `/dictionary/lemma/qaAla` (rooted verb) → header, "said"-ish gloss, root def + link to `/dictionary/qwl`, concordance with Load-more. Visit `/dictionary/lemma/min` (rootless) → no root block. Visit `/dictionary/lemma/zzz` → 404.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/dictionary/lemma/[lemma]/page.tsx"
git commit -m "feat(web): per-lemma page at /dictionary/lemma/[lemma]"
```

---

### Task 6: Clickable FrequencyTable rows

**Files:**
- Modify: `apps/web/src/components/dictionary/FrequencyTable.tsx`
- Modify: `apps/web/src/app/dictionary/lemma-frequency/page.tsx`
- Modify: `apps/web/src/app/dictionary/verb-concordance/page.tsx`
- Test: `apps/web/src/test/FrequencyTable.test.tsx` (extend)

**Interfaces:**
- Consumes: nothing new.
- Produces: `FrequencyRow` gains optional `href?: string`. When present, label wrapped in Next `<Link href>`; else plain `<span>` as today (backward-compatible — About/other callers unaffected).

**Notes:** Keep Arabic `dir="rtl"` + classes identical. Freq page maps `href: /dictionary/lemma/${encodeURIComponent(r.lemma_buckwalter)}` — skip href (plain) when `lemma_buckwalter` null (defensive; shouldn't happen). Verb page same, using its now-present `lemma_buckwalter`.

- [ ] **Step 1: Write failing test**

```tsx
// add to FrequencyTable.test.tsx
it('renders a link when row has href, plain text otherwise', () => {
  render(<FrequencyTable caption="c" rows={[
    { label: 'قَالَ', count: 2, href: '/dictionary/lemma/qaAla' },
    { label: 'مِن', count: 1 },
  ]} />);
  expect(screen.getByRole('link', { name: 'قَالَ' })).toHaveAttribute('href', '/dictionary/lemma/qaAla');
  expect(screen.queryByRole('link', { name: 'مِن' })).toBeNull();
});
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm --filter web test -- FrequencyTable`
Expected: FAIL (href unsupported).

- [ ] **Step 3: Implement** — add `href?` to `FrequencyRow`, conditional `<Link>`. Wire both freq pages to build hrefs.

- [ ] **Step 4: Run — verify pass**

Run: `pnpm --filter web test -- FrequencyTable`
Expected: PASS (new + existing).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/dictionary/FrequencyTable.tsx apps/web/src/app/dictionary/lemma-frequency/page.tsx apps/web/src/app/dictionary/verb-concordance/page.tsx apps/web/src/test/FrequencyTable.test.tsx
git commit -m "feat(web): link frequency & verb-concordance rows to lemma pages"
```

---

### Task 7: Full gate — lint, type-check, whole suites

**Files:** none (verification).

- [ ] **Step 1: Rebuild data package** — `pnpm --filter @quran-corpus/data build`
- [ ] **Step 2: Type-check** — `pnpm --filter @quran-corpus/data type-check && pnpm --filter web type-check` → clean.
- [ ] **Step 3: Lint** — `pnpm --filter web lint` → clean (no new disables).
- [ ] **Step 4: Full tests** — `pnpm --filter @quran-corpus/data test && pnpm --filter web test` → all green.
- [ ] **Step 5:** STOP — ask user to run `/code-review` (§4 step 3), act on findings, then CodeRabbit gate (§5) before merge.

---

## Acceptance Criteria (from spec)

1. `/dictionary/lemma/<bw>` known lemma: header, count == `countLemmaConcordance`, top gloss, (if rooted) root def + up-link. Unknown → 404. (Tasks 1,4,5)
2. Rootless lemma page: no root-definition block, no root up-link. (Tasks 1,4,5)
3. Every freq + verb row links to matching lemma page; tapped count == destination total. (Tasks 1,6)
4. `FrequencyTable` with no href renders as before. (Task 6)
5. Data + web tests pass, tsc clean, eslint clean, data rebuilt. (Task 7)

## Risks / Rollback

- ConcordanceList generalization breaks root paging → Task 3 keeps `rootBw` default path; existing root tests must stay green (Step 4 gate).
- Stale `packages/data/dist` → module-not-found. Mitigation: build steps in Tasks 1 & 7.
- Rollback: all additive. Revert `FrequencyTable` href + delete new route/page/query to restore prior state. No schema/data change.
