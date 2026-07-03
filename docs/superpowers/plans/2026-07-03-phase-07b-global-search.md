# Phase 07b — Global Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a global corpus search — verse-ref jump, Arabic verse text (harakat-free), translation text (en/ru/uz), and root/meaning — surfaced as an SSR `/search` page and a live header bottom-sheet, ranked deterministically with highlighted matches.

**Architecture:** One unified FTS5 table (`search_fts`) indexes normalized Arabic (`normalizeArabic(text_uthmani)`) plus raw translation text. Arabic is normalized in app code (the FTS tokenizer does NOT strip harakat — verified) on both the indexed body and the query. `packages/data` owns a pure text-normalizer, an FTS query layer, and a one-time backfill; `apps/web` adds an SSR page, a thin JSON API, a shared results component, and a Framer-Motion bottom-sheet sharing that same query layer (DRY).

**Tech Stack:** TypeScript, libSQL/@libsql/client (FTS5), Next.js 15 App Router (React 19 RSC + one client component), Framer Motion, Vitest + @testing-library/react.

## Global Constraints

- `packages/data` stays Next-free / portable — no web imports (CLAUDE.md §2/§3).
- DRY: both surfaces call the ONE `search()` entrypoint; ONE `SearchResults` component renders results.
- OWASP: validate + length-cap `q` at every boundary; escape FTS operators (`escapeFtsQuery`); snippets rendered as React text nodes + `<mark>`, never `dangerouslySetInnerHTML`; no query logging.
- Every query fn signature is `(db: Client, ...)`; row→type mappers use bracket access (`r['col'] as T`); types live in `packages/data/src/types.ts` and re-export from `src/index.ts`.
- `exactOptionalPropertyTypes: true` — build optional props conditionally (`{...(x ? { x } : {})}`), don't pass `undefined`.
- Next route modules export only reserved names — helpers live in sibling `params.ts`.
- Verified facts (probed 2026-07-03): FTS5 present in libSQL ✓; `remove_diacritics` folds Latin/Cyrillic only, NOT Arabic harakat; `ayahs.text_simple` is NULL; `runMigrations` `.split(';')` shreds `BEGIN…END;` triggers; Quran Arabic is fixed (backfill once, no Arabic trigger).
- Tests: `packages/data` uses `createDatabase('file::memory:')` + `runMigrations`; `apps/web` uses jsdom + `@testing-library/react`. Real DB for manual checks: `DATABASE_URL=file:/home/claude/quran-data/quran.db`.
- Commit per task, Conventional Commits, one logical change. Greptile ≥ 4/5 gate per CLAUDE.md §5. Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

- `packages/data/src/migrate.ts` — MODIFY: statement-aware splitter (BEGIN…END). Export `splitStatements`.
- `packages/data/src/text/normalize.ts` — CREATE: `normalizeArabic`, `escapeFtsQuery` (pure, no db).
- `packages/data/schema.sql` — MODIFY: `search_fts` virtual table + translation sync triggers.
- `packages/data/src/queries/search.ts` — CREATE: `parseVerseRef`, `searchVerses`, `search`, `backfillSearchIndex`.
- `packages/data/src/types.ts` — MODIFY: `VerseRef`, `VerseHit`, `JumpVerse`, `SearchResult`.
- `packages/data/src/index.ts` — MODIFY: export new fns + types.
- `apps/web/src/lib/db.ts` — MODIFY: call `backfillSearchIndex` after migrations (guarded).
- `apps/web/src/app/api/search/route.ts` — CREATE: GET JSON handler.
- `apps/web/src/components/search/SearchResults.tsx` — CREATE: shared results renderer + snippet highlighter.
- `apps/web/src/app/search/page.tsx` + `apps/web/src/app/search/params.ts` — CREATE: SSR page + query parser.
- `apps/web/src/components/search/SearchSheet.tsx` — CREATE: client bottom-sheet (live).
- `apps/web/src/components/search/SearchTrigger.tsx` — CREATE: 🔍 button mounting the sheet.
- `apps/web/src/app/layout.tsx` — MODIFY: mount `<SearchTrigger/>`.
- Tests co-located per package convention (`packages/data/tests/*.test.ts`, `apps/web/src/test/*.test.tsx`).

---

### Task 1: Trigger-aware migration splitter

**Files:**
- Modify: `packages/data/src/migrate.ts`
- Test: `packages/data/tests/migrate.test.ts`

**Interfaces:**
- Produces: `splitStatements(sql: string): string[]` — splits SQL into top-level statements, treating a `CREATE TRIGGER … BEGIN … END;` block as ONE statement. `runMigrations` unchanged in signature.

- [ ] **Step 1: Write the failing test** — append to `packages/data/tests/migrate.test.ts`:

```typescript
import { splitStatements } from '../src/migrate.js';

describe('splitStatements', () => {
  it('keeps a BEGIN…END trigger body as one statement', () => {
    const sql = `CREATE TABLE t (id INTEGER);
CREATE TRIGGER trg AFTER INSERT ON t BEGIN
  INSERT INTO t(id) VALUES (NEW.id);
  DELETE FROM t WHERE id = 0;
END;
CREATE INDEX ix ON t(id);`;
    const parts = splitStatements(sql).map((s) => s.trim()).filter(Boolean);
    expect(parts).toHaveLength(3);
    expect(parts[1]).toContain('CREATE TRIGGER');
    expect(parts[1]).toContain('END');
    expect(parts[1]!.match(/INSERT|DELETE/g)).toHaveLength(2);
  });

  it('splits ordinary semicolon statements', () => {
    const parts = splitStatements('SELECT 1; SELECT 2;').map((s) => s.trim()).filter(Boolean);
    expect(parts).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @quran-corpus/data test -- migrate`
Expected: FAIL — `splitStatements is not a function`.

- [ ] **Step 3: Implement** — replace `packages/data/src/migrate.ts` with:

```typescript
import type { Client } from '@libsql/client';
import { SCHEMA_SQL } from './schema.generated.js';

// SQLite trigger bodies contain inner semicolons inside BEGIN…END, so a naive
// `.split(';')` shreds them. Split on top-level semicolons only, tracking
// BEGIN/END depth so a whole trigger stays one statement.
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let depth = 0;
  const tokens = sql.match(/\bBEGIN\b|\bEND\b|;|[^;]+/gi) ?? [];
  for (const tok of tokens) {
    const t = tok.toUpperCase();
    if (t === 'BEGIN') {
      depth++;
      current += tok;
    } else if (t === 'END') {
      if (depth > 0) depth--;
      current += tok;
    } else if (tok === ';' && depth === 0) {
      statements.push(current);
      current = '';
    } else {
      current += tok;
    }
  }
  if (current.trim().length > 0) statements.push(current);
  return statements;
}

export async function runMigrations(db: Client): Promise<void> {
  const statements = splitStatements(SCHEMA_SQL)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--') && !s.startsWith('PRAGMA'));

  for (const statement of statements) {
    await db.execute(statement);
  }
}
```

> Note: the regex splits `END;` into tokens `END` then `;`; the `;` fires the push only because `END` already decremented depth to 0. Multi-line SQL is fine — the `[^;]+` alternative captures newlines.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @quran-corpus/data test`
Expected: PASS — all migrate tests green (existing table/index/idempotent tests unaffected).

- [ ] **Step 5: Commit**

```bash
git add packages/data/src/migrate.ts packages/data/tests/migrate.test.ts
git commit -m "refactor(data): make migration splitter BEGIN…END aware"
```

---

### Task 2: Arabic normalizer + FTS query escaper

**Files:**
- Create: `packages/data/src/text/normalize.ts`
- Test: `packages/data/tests/normalize.test.ts`

**Interfaces:**
- Produces:
  - `normalizeArabic(s: string): string` — strips harakat / Quranic annotation marks / tatweel / BOM, folds alef variants (`ٱإأآ`→`ا`). No-op for non-Arabic text.
  - `escapeFtsQuery(s: string): string` — wraps input as a single FTS5 quoted phrase so operators (`* : - ^ NEAR`) can't inject.

- [ ] **Step 1: Write the failing test** — `packages/data/tests/normalize.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { normalizeArabic, escapeFtsQuery } from '../src/text/normalize.js';

describe('normalizeArabic', () => {
  it('strips harakat and folds alef-wasla to bare alef (Al-Fatiha 1:1)', () => {
    const uthmani = '﻿بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';
    expect(normalizeArabic(uthmani)).toBe('بسم الله الرحمن الرحيم');
  });
  it('makes a bare query match its diacritized source', () => {
    expect(normalizeArabic('كَتَبَ')).toBe(normalizeArabic('كتب'));
  });
  it('folds hamzated alef forms', () => {
    expect(normalizeArabic('أإآا')).toBe('اااا');
  });
  it('leaves Latin/Cyrillic untouched', () => {
    expect(normalizeArabic('Throne')).toBe('Throne');
    expect(normalizeArabic('Милостивый')).toBe('Милостивый');
  });
});

describe('escapeFtsQuery', () => {
  it('quotes the term as a phrase', () => {
    expect(escapeFtsQuery('throne')).toBe('"throne"');
  });
  it('neutralizes FTS operators by quoting', () => {
    expect(escapeFtsQuery('a* OR b')).toBe('"a* OR b"');
  });
  it('escapes embedded double quotes', () => {
    expect(escapeFtsQuery('say "hi"')).toBe('"say ""hi"""');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @quran-corpus/data test -- normalize`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `packages/data/src/text/normalize.ts`:

```typescript
// Arabic harakat, Quranic annotation signs, tatweel, and the BOM. The FTS5
// tokenizer's remove_diacritics folds Latin/Cyrillic but NOT these Arabic
// combining marks (verified), so we strip them in app code — applied to both
// the indexed body and the user query so a bare query hits diacritized verses.
const ARABIC_MARKS =
  /[ؐ-ًؚ-ٰٟۖ-ۭ࣓-ࣿـ﻿]/g;

// Alef variants a user won't type (wasla, hamza above/below, madda) → bare alef.
const ALEF_VARIANTS = /[آأإٱ]/g;

export function normalizeArabic(s: string): string {
  return s.replace(ARABIC_MARKS, '').replace(ALEF_VARIANTS, 'ا');
}

export function escapeFtsQuery(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @quran-corpus/data test -- normalize`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/data/src/text/normalize.ts packages/data/tests/normalize.test.ts
git commit -m "feat(data): add Arabic normalizer + FTS query escaper"
```

---

### Task 3: FTS5 schema + translation sync triggers

**Files:**
- Modify: `packages/data/schema.sql`
- Test: `packages/data/tests/migrate.test.ts`

**Interfaces:**
- Produces: table `search_fts(surah_id UNINDEXED, ayah_number UNINDEXED, source UNINDEXED, ref_id UNINDEXED, body)` tokenized `unicode61 remove_diacritics 2`; triggers `trg_translations_ai/ad/au` keep translation rows synced. Body col index = 4 (for `snippet()`).

- [ ] **Step 1: Write the failing test** — append to `packages/data/tests/migrate.test.ts`:

```typescript
describe('search_fts schema', () => {
  it('creates the FTS table and translation triggers', async () => {
    const d = createDatabase('file::memory:');
    await runMigrations(d);
    const master = await d.execute(
      "SELECT name, type FROM sqlite_master WHERE name = 'search_fts' OR name LIKE 'trg_translations_%'",
    );
    const names = new Set(master.rows.map((r) => r['name'] as string));
    expect(names.has('search_fts')).toBe(true);
    expect(names.has('trg_translations_ai')).toBe(true);
    expect(names.has('trg_translations_ad')).toBe(true);
    d.close();
  });

  it('trigger indexes a translation on insert', async () => {
    const d = createDatabase('file::memory:');
    await runMigrations(d);
    await d.execute("INSERT INTO surahs VALUES (1,'a','A','A','meccan',7,1)");
    await d.execute("INSERT INTO ayahs (id,surah_id,ayah_number,text_uthmani) VALUES (1,1,1,'x')");
    await d.execute("INSERT INTO languages VALUES ('en','English','English','ltr')");
    await d.execute(
      "INSERT INTO translations (ayah_id,language_code,translator,text) VALUES (1,'en','T','the throne verse')",
    );
    const hit = await d.execute("SELECT surah_id, source FROM search_fts WHERE search_fts MATCH 'throne'");
    expect(hit.rows).toHaveLength(1);
    expect(hit.rows[0]!['source']).toBe('en');
    d.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @quran-corpus/data test -- migrate`
Expected: FAIL — `no such table: search_fts` (schema.generated regenerates via pretest, so no manual regen needed).

- [ ] **Step 3: Implement** — append to `packages/data/schema.sql` (after the last index):

```sql
-- Global search (Phase 07b). Unified FTS5 over normalized Arabic + translation
-- text. Arabic body is normalized in app code before insert (backfill); the
-- tokenizer only folds Latin/Cyrillic. ref_id = ayahs.id for source='ar',
-- translations.id for translation rows (stable key for trigger sync).
CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
  surah_id UNINDEXED,
  ayah_number UNINDEXED,
  source UNINDEXED,
  ref_id UNINDEXED,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS trg_translations_ai AFTER INSERT ON translations BEGIN
  INSERT INTO search_fts (surah_id, ayah_number, source, ref_id, body)
  SELECT a.surah_id, a.ayah_number, NEW.language_code, NEW.id, NEW.text
  FROM ayahs a WHERE a.id = NEW.ayah_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_translations_ad AFTER DELETE ON translations BEGIN
  DELETE FROM search_fts WHERE source = OLD.language_code AND ref_id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_translations_au AFTER UPDATE ON translations BEGIN
  DELETE FROM search_fts WHERE source = OLD.language_code AND ref_id = OLD.id;
  INSERT INTO search_fts (surah_id, ayah_number, source, ref_id, body)
  SELECT a.surah_id, a.ayah_number, NEW.language_code, NEW.id, NEW.text
  FROM ayahs a WHERE a.id = NEW.ayah_id;
END;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @quran-corpus/data test -- migrate`
Expected: PASS — table + triggers created, insert trigger indexes the row.

- [ ] **Step 5: Commit**

```bash
git add packages/data/schema.sql packages/data/tests/migrate.test.ts
git commit -m "feat(data): add search_fts table + translation sync triggers"
```

---

### Task 4: Search-index backfill + web wiring

**Files:**
- Modify: `packages/data/src/queries/search.ts` (create file — holds backfill + Task 5–7 fns)
- Modify: `packages/data/src/index.ts`
- Modify: `apps/web/src/lib/db.ts`
- Test: `packages/data/tests/search.test.ts`

**Interfaces:**
- Consumes: `normalizeArabic` (Task 2).
- Produces: `backfillSearchIndex(db: Client): Promise<void>` — populates `search_fts` with normalized Arabic (`source='ar'`, `ref_id=ayahs.id`) + all translation rows. Idempotent (no-op if already populated).

- [ ] **Step 1: Write the failing test** — `packages/data/tests/search.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
import { backfillSearchIndex } from '../src/queries/search.js';
import type { Client } from '@libsql/client';

async function seed(db: Client): Promise<void> {
  await db.execute("INSERT INTO surahs VALUES (1,'الفاتحة','Al-Fatiha','The Opener','meccan',7,1)");
  await db.execute(
    "INSERT INTO ayahs (id,surah_id,ayah_number,text_uthmani) VALUES (1,1,1,'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ')",
  );
  await db.execute("INSERT INTO languages VALUES ('en','English','English','ltr')");
  await db.execute(
    "INSERT INTO translations (ayah_id,language_code,translator,text) VALUES (1,'en','T','In the name of Allah')",
  );
}

let db: Client;
beforeEach(async () => {
  db = createDatabase('file::memory:');
  await runMigrations(db);
  await seed(db);
});

describe('backfillSearchIndex', () => {
  it('indexes normalized Arabic and is queryable harakat-free', async () => {
    await backfillSearchIndex(db);
    const hit = await db.execute("SELECT source FROM search_fts WHERE search_fts MATCH 'الرحمن'");
    expect(hit.rows).toHaveLength(1);
    expect(hit.rows[0]!['source']).toBe('ar');
  });
  it('does not duplicate translation rows already synced by trigger', async () => {
    await backfillSearchIndex(db);
    const c = await db.execute("SELECT count(*) c FROM search_fts WHERE source='en'");
    expect(c.rows[0]!['c']).toBe(1);
  });
  it('is idempotent', async () => {
    await backfillSearchIndex(db);
    await backfillSearchIndex(db);
    const c = await db.execute('SELECT count(*) c FROM search_fts');
    expect(c.rows[0]!['c']).toBe(2); // 1 ar + 1 en
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @quran-corpus/data test -- search`
Expected: FAIL — `search.js` not found.

- [ ] **Step 3: Implement** — create `packages/data/src/queries/search.ts`:

```typescript
import type { Client } from '@libsql/client';
import { normalizeArabic } from '../text/normalize.js';

// One-time populate of search_fts. Arabic rows are normalized here (source='ar')
// because SQL triggers cannot run the JS normalizer; translation rows are kept
// synced by triggers, so we only backfill translations that predate the table.
export async function backfillSearchIndex(db: Client): Promise<void> {
  const existing = await db.execute('SELECT count(*) AS c FROM search_fts');
  if ((existing.rows[0]!['c'] as number) > 0) return;

  const ayahs = await db.execute(
    'SELECT id, surah_id, ayah_number, text_uthmani FROM ayahs',
  );
  for (const r of ayahs.rows) {
    await db.execute({
      sql: 'INSERT INTO search_fts (surah_id, ayah_number, source, ref_id, body) VALUES (?,?,?,?,?)',
      args: [
        r['surah_id'] as number,
        r['ayah_number'] as number,
        'ar',
        r['id'] as number,
        normalizeArabic(r['text_uthmani'] as string),
      ],
    });
  }

  const tr = await db.execute(
    `SELECT t.id, a.surah_id, a.ayah_number, t.language_code, t.text
     FROM translations t JOIN ayahs a ON a.id = t.ayah_id`,
  );
  for (const r of tr.rows) {
    await db.execute({
      sql: 'INSERT INTO search_fts (surah_id, ayah_number, source, ref_id, body) VALUES (?,?,?,?,?)',
      args: [
        r['surah_id'] as number,
        r['ayah_number'] as number,
        r['language_code'] as string,
        r['id'] as number,
        r['text'] as string,
      ],
    });
  }
}
```

> The idempotency guard also means: on a fresh DB where translations are imported AFTER `search_fts` exists, the trigger already indexed them — the backfill's emptiness guard prevents a second pass. In the test, `seed()` inserts translations while `search_fts` exists, so the trigger indexes the `en` row; backfill then skips it via the guard (already non-empty? no — Arabic not yet inserted). See note: guard checks total count. Here after seed, count=1 (en via trigger) so guard would skip Arabic. **To avoid that**, guard on Arabic rows specifically:

Replace the guard line with:

```typescript
  const arDone = await db.execute("SELECT count(*) AS c FROM search_fts WHERE source='ar'");
  if ((arDone.rows[0]!['c'] as number) > 0) return;
```

…and make the translation loop skip rows the trigger already indexed:

```typescript
  for (const r of tr.rows) {
    const seen = await db.execute({
      sql: "SELECT 1 FROM search_fts WHERE source = ? AND ref_id = ? LIMIT 1",
      args: [r['language_code'] as string, r['id'] as number],
    });
    if (seen.rows.length > 0) continue;
    await db.execute({
      sql: 'INSERT INTO search_fts (surah_id, ayah_number, source, ref_id, body) VALUES (?,?,?,?,?)',
      args: [
        r['surah_id'] as number,
        r['ayah_number'] as number,
        r['language_code'] as string,
        r['id'] as number,
        r['text'] as string,
      ],
    });
  }
```

- [ ] **Step 4: Export + wire web** — add to `packages/data/src/index.ts`:

```typescript
export { backfillSearchIndex } from './queries/search.js';
```

Modify `apps/web/src/lib/db.ts` — import and call after migrations:

```typescript
import { createDatabase, runMigrations, backfillSearchIndex } from '@quran-corpus/data';
```

…and inside the memoized promise, after `await runMigrations(db);`:

```typescript
      if (shouldRunMigrations()) {
        await runMigrations(db);
        await backfillSearchIndex(db);
      }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @quran-corpus/data test -- search`
Expected: PASS — Arabic harakat-free hit, no translation dup, idempotent (count 2).

- [ ] **Step 6: Commit**

```bash
git add packages/data/src/queries/search.ts packages/data/src/index.ts packages/data/tests/search.test.ts apps/web/src/lib/db.ts
git commit -m "feat(data): backfill search index + wire into web db bootstrap"
```

---

### Task 5: parseVerseRef

**Files:**
- Modify: `packages/data/src/queries/search.ts`
- Modify: `packages/data/src/types.ts`
- Test: `packages/data/tests/search.test.ts`

**Interfaces:**
- Consumes: `normalizeArabic` (Task 2), `Client`.
- Produces: `interface VerseRef { surah: number; ayah: number | null; position: number | null }`; `parseVerseRef(db: Client, q: string): Promise<VerseRef | null>`. Handles `S`, `S:A`, `S:A:W`, and surah-name (+ optional trailing ayah). Returns null for non-refs (junk flows to text search).

- [ ] **Step 1: Write the failing test** — append to `packages/data/tests/search.test.ts`:

```typescript
import { parseVerseRef } from '../src/queries/search.js';

describe('parseVerseRef', () => {
  it('parses S:A:W', async () => {
    expect(await parseVerseRef(db, '1:1:2')).toEqual({ surah: 1, ayah: 1, position: 2 });
  });
  it('parses S:A', async () => {
    expect(await parseVerseRef(db, '2:255')).toEqual({ surah: 2, ayah: 255, position: null });
  });
  it('parses surah-only', async () => {
    expect(await parseVerseRef(db, '1')).toEqual({ surah: 1, ayah: null, position: null });
  });
  it('rejects out-of-range surah', async () => {
    expect(await parseVerseRef(db, '200:1')).toBeNull();
  });
  it('resolves a translit surah name + ayah', async () => {
    expect(await parseVerseRef(db, 'Al-Fatiha 1')).toEqual({ surah: 1, ayah: 1, position: null });
  });
  it('resolves an English surah name', async () => {
    expect(await parseVerseRef(db, 'the opener')).toEqual({ surah: 1, ayah: null, position: null });
  });
  it('returns null for free-text', async () => {
    expect(await parseVerseRef(db, 'mercy of god')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @quran-corpus/data test -- search`
Expected: FAIL — `parseVerseRef is not a function`.

- [ ] **Step 3: Implement** — add to `packages/data/src/types.ts`:

```typescript
export interface VerseRef {
  surah: number;
  ayah: number | null;
  position: number | null;
}
```

Add to `packages/data/src/queries/search.ts` (imports at top: extend the normalize import):

```typescript
import { normalizeArabic, escapeFtsQuery } from '../text/normalize.js';
import type { VerseRef } from '../types.js';

function latinKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function parseVerseRef(db: Client, q: string): Promise<VerseRef | null> {
  const s = q.trim();
  if (s.length === 0) return null;

  const numeric = s.match(/^(\d{1,3})(?::(\d{1,3})(?::(\d{1,3}))?)?$/);
  if (numeric) {
    const surah = Number(numeric[1]);
    if (surah < 1 || surah > 114) return null;
    return {
      surah,
      ayah: numeric[2] !== undefined ? Number(numeric[2]) : null,
      position: numeric[3] !== undefined ? Number(numeric[3]) : null,
    };
  }

  // Surah name, optional trailing ayah number: "Al-Baqarah 255", "the opener".
  const named = s.match(/^(.+?)(?:\s+(\d{1,3}))?$/);
  if (!named) return null;
  const namePart = named[1]!.trim();
  const ayah = named[2] !== undefined ? Number(named[2]) : null;
  const wantLatin = latinKey(namePart);
  const wantArabic = normalizeArabic(namePart);
  if (wantLatin.length === 0 && wantArabic.length === 0) return null;

  const surahs = await db.execute(
    'SELECT id, name_arabic, name_translit, name_translation FROM surahs',
  );
  for (const r of surahs.rows) {
    const translit = latinKey(r['name_translit'] as string);
    const translation = latinKey(r['name_translation'] as string);
    const arabic = normalizeArabic(r['name_arabic'] as string);
    if (
      (wantLatin.length > 0 && (wantLatin === translit || wantLatin === translation)) ||
      (wantArabic.length > 0 && wantArabic === arabic)
    ) {
      return { surah: r['id'] as number, ayah, position: null };
    }
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @quran-corpus/data test -- search`
Expected: PASS — all parseVerseRef cases (note `'the opener'` → latinKey `theopener` === latinKey of `'The Opener'`).

- [ ] **Step 5: Commit**

```bash
git add packages/data/src/queries/search.ts packages/data/src/types.ts packages/data/tests/search.test.ts
git commit -m "feat(data): add parseVerseRef (numeric + surah-name refs)"
```

---

### Task 6: searchVerses (FTS5 MATCH + bm25 + snippet)

**Files:**
- Modify: `packages/data/src/queries/search.ts`
- Modify: `packages/data/src/types.ts`
- Test: `packages/data/tests/search.test.ts`

**Interfaces:**
- Consumes: `normalizeArabic`, `escapeFtsQuery`, `backfillSearchIndex`.
- Produces: `interface VerseHit { surah_id: number; ayah_number: number; source: string; snippet: string }`; `searchVerses(db: Client, q: string, opts?: { limit?: number }): Promise<VerseHit[]>`. Snippet uses sentinels `\u0002`/`\u0003` around matches (NOT HTML). Ordered by `bm25` (best first). Empty query → `[]`.

- [ ] **Step 1: Write the failing test** — append to `packages/data/tests/search.test.ts`:

```typescript
import { searchVerses } from '../src/queries/search.js';

describe('searchVerses', () => {
  it('matches Arabic harakat-free with a sentinel-marked snippet', async () => {
    await backfillSearchIndex(db);
    const hits = await searchVerses(db, 'الرحمن');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.source).toBe('ar');
    expect(hits[0]!.snippet).toContain('\u0002'); // open sentinel present
  });
  it('matches translation text', async () => {
    await backfillSearchIndex(db);
    const hits = await searchVerses(db, 'name');
    expect(hits.some((h) => h.source === 'en')).toBe(true);
  });
  it('neutralizes FTS operator injection (no throw, no match)', async () => {
    await backfillSearchIndex(db);
    const hits = await searchVerses(db, 'zzz* OR 1');
    expect(hits).toEqual([]);
  });
  it('returns [] for empty query', async () => {
    await backfillSearchIndex(db);
    expect(await searchVerses(db, '   ')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @quran-corpus/data test -- search`
Expected: FAIL — `searchVerses is not a function`.

- [ ] **Step 3: Implement** — add `VerseHit` to `packages/data/src/types.ts`:

```typescript
export interface VerseHit {
  surah_id: number;
  ayah_number: number;
  source: string;
  snippet: string;
}
```

Add to `packages/data/src/queries/search.ts` (extend the types import to include `VerseHit`):

```typescript
export async function searchVerses(
  db: Client,
  q: string,
  opts?: { limit?: number },
): Promise<VerseHit[]> {
  const limit = opts?.limit ?? 50;
  const term = normalizeArabic(q).trim();
  if (term.length === 0) return [];
  const match = escapeFtsQuery(term);
  // body is column index 4; \u0002/\u0003 wrap matched tokens (rendered as <mark>
  // in React text nodes, never raw HTML). bm25 ascending = most relevant first.
  const res = await db.execute({
    sql: `SELECT surah_id, ayah_number, source,
                 snippet(search_fts, 4, char(2), char(3), '…', 12) AS snippet
          FROM search_fts
          WHERE search_fts MATCH ?
          ORDER BY bm25(search_fts)
          LIMIT ?`,
    args: [match, limit],
  });
  return res.rows.map((r) => ({
    surah_id: r['surah_id'] as number,
    ayah_number: r['ayah_number'] as number,
    source: r['source'] as string,
    snippet: r['snippet'] as string,
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @quran-corpus/data test -- search`
Expected: PASS — Arabic + translation hits; injection query returns `[]` (quoted phrase `"zzz* OR 1"` matches nothing, no error).

- [ ] **Step 5: Commit**

```bash
git add packages/data/src/queries/search.ts packages/data/src/types.ts packages/data/tests/search.test.ts
git commit -m "feat(data): add searchVerses FTS5 query with bm25 + snippet"
```

---

### Task 7: search orchestrator + exports

**Files:**
- Modify: `packages/data/src/queries/search.ts`
- Modify: `packages/data/src/types.ts`
- Modify: `packages/data/src/index.ts`
- Test: `packages/data/tests/search.test.ts`

**Interfaces:**
- Consumes: `parseVerseRef`, `searchVerses`, `searchRoots` (existing), `getWordsByAyah` (existing, from `./words.js`), `Root`.
- Produces:
  - `interface JumpVerse { surah_id: number; ayah_number: number | null; text_uthmani: string; words: { position: number; text_arabic: string }[]; highlightPosition: number | null }`
  - `interface SearchResult { jump: JumpVerse | null; verses: VerseHit[]; roots: Root[] }`
  - `search(db: Client, q: string): Promise<SearchResult>`
- All of `parseVerseRef`, `searchVerses`, `search`, `VerseRef`, `VerseHit`, `JumpVerse`, `SearchResult` exported from `src/index.ts`.

- [ ] **Step 1: Write the failing test** — append to `packages/data/tests/search.test.ts`:

```typescript
import { search } from '../src/queries/search.js';

describe('search orchestrator', () => {
  it('returns a jump verse with words for a verse ref', async () => {
    await backfillSearchIndex(db);
    const res = await search(db, '1:1');
    expect(res.jump).not.toBeNull();
    expect(res.jump!.surah_id).toBe(1);
    expect(res.jump!.ayah_number).toBe(1);
    expect(res.jump!.highlightPosition).toBeNull();
    expect(res.jump!.text_uthmani).toContain('بِسْمِ');
  });
  it('sets highlightPosition for a word ref', async () => {
    await backfillSearchIndex(db);
    const res = await search(db, '1:1:1');
    expect(res.jump!.highlightPosition).toBe(1);
  });
  it('gives a surah-level jump (null ayah) for a bare surah', async () => {
    const res = await search(db, '1');
    expect(res.jump).not.toBeNull();
    expect(res.jump!.ayah_number).toBeNull();
    expect(res.jump!.words).toEqual([]);
  });
  it('returns verses + roots and no jump for free-text', async () => {
    await backfillSearchIndex(db);
    const res = await search(db, 'name');
    expect(res.jump).toBeNull();
    expect(res.verses.length).toBeGreaterThan(0);
    expect(Array.isArray(res.roots)).toBe(true);
  });
  it('returns an empty shape for a blank query', async () => {
    expect(await search(db, '  ')).toEqual({ jump: null, verses: [], roots: [] });
  });
});
```

> Task 5–6 tests seed only ayah 1:1, so `search(db,'1:1')` finds it. `getWordsByAyah` returns `[]` here (no `words` rows seeded) — `text_uthmani` still populated. The word-ref test asserts `highlightPosition` (from the ref), independent of seeded words.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @quran-corpus/data test -- search`
Expected: FAIL — `search is not a function`.

- [ ] **Step 3: Implement** — add types to `packages/data/src/types.ts`:

```typescript
export interface JumpVerse {
  surah_id: number;
  ayah_number: number | null;
  text_uthmani: string;
  words: { position: number; text_arabic: string }[];
  highlightPosition: number | null;
}

export interface SearchResult {
  jump: JumpVerse | null;
  verses: VerseHit[];
  roots: Root[];
}
```

Add to `packages/data/src/queries/search.ts` (extend imports: `import { searchRoots } from './roots.js';`, `import { getWordsByAyah } from './words.js';`, and add `JumpVerse, SearchResult` to the types import):

```typescript
export async function search(db: Client, q: string): Promise<SearchResult> {
  const query = q.trim();
  if (query.length === 0) return { jump: null, verses: [], roots: [] };

  const ref = await parseVerseRef(db, query);
  let jump: JumpVerse | null = null;
  if (ref) {
    if (ref.ayah !== null) {
      const a = await db.execute({
        sql: 'SELECT id, surah_id, ayah_number, text_uthmani FROM ayahs WHERE surah_id = ? AND ayah_number = ?',
        args: [ref.surah, ref.ayah],
      });
      const row = a.rows[0];
      if (row) {
        const words = await getWordsByAyah(db, row['id'] as number);
        jump = {
          surah_id: row['surah_id'] as number,
          ayah_number: row['ayah_number'] as number,
          text_uthmani: row['text_uthmani'] as string,
          words: words.map((w) => ({ position: w.position, text_arabic: w.text_arabic })),
          highlightPosition: ref.position,
        };
      }
    } else {
      jump = {
        surah_id: ref.surah,
        ayah_number: null,
        text_uthmani: '',
        words: [],
        highlightPosition: null,
      };
    }
  }

  const [verses, roots] = await Promise.all([searchVerses(db, query), searchRoots(db, query)]);
  return { jump, verses, roots };
}
```

- [ ] **Step 4: Export** — add to `packages/data/src/index.ts`:

```typescript
export { backfillSearchIndex, parseVerseRef, searchVerses, search } from './queries/search.js';
```

…and add to the type export block: `VerseRef, VerseHit, JumpVerse, SearchResult`. (Replace the earlier `backfillSearchIndex`-only export line from Task 4 with this combined line to avoid a duplicate export.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @quran-corpus/data test && pnpm --filter @quran-corpus/data type-check`
Expected: PASS — orchestrator shapes correct; type-check clean.

- [ ] **Step 6: Commit**

```bash
git add packages/data/src/queries/search.ts packages/data/src/types.ts packages/data/src/index.ts packages/data/tests/search.test.ts
git commit -m "feat(data): add search orchestrator (jump + verses + roots)"
```

---

### Task 8: /api/search JSON handler

**Files:**
- Create: `apps/web/src/app/api/search/route.ts`
- Test: `apps/web/src/test/searchApi.test.ts`

**Interfaces:**
- Consumes: `search` (Task 7), `getDatabase` (existing).
- Produces: `GET(request: Request): Promise<Response>` at `/api/search?q=`. Validates: trims `q`; empty or `> 100` chars → returns empty `SearchResult` JSON (200). Otherwise returns `search()` JSON.

- [ ] **Step 1: Write the failing test** — `apps/web/src/test/searchApi.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('@quran-corpus/data', () => ({
  search: vi.fn(async (_db: unknown, q: string) => ({
    jump: null,
    verses: [{ surah_id: 1, ayah_number: 1, source: 'en', snippet: `hit:${q}` }],
    roots: [],
  })),
}));
vi.mock('../lib/db', () => ({ getDatabase: vi.fn(async () => ({})) }));

import { GET } from '../app/api/search/route';

function req(q: string): Request {
  return new Request(`http://localhost/api/search?q=${encodeURIComponent(q)}`);
}

describe('GET /api/search', () => {
  it('returns search results for a valid query', async () => {
    const res = await GET(req('throne'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verses[0].snippet).toBe('hit:throne');
  });
  it('returns empty result for a blank query', async () => {
    const body = await (await GET(req('   '))).json();
    expect(body).toEqual({ jump: null, verses: [], roots: [] });
  });
  it('returns empty result for an over-long query', async () => {
    const body = await (await GET(req('x'.repeat(101)))).json();
    expect(body.verses).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- searchApi`
Expected: FAIL — route module not found.

- [ ] **Step 3: Implement** — `apps/web/src/app/api/search/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { search } from '@quran-corpus/data';
import { getDatabase } from '../../../lib/db';

export const dynamic = 'force-dynamic';

const EMPTY = { jump: null, verses: [], roots: [] };

export async function GET(request: Request): Promise<Response> {
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim();
  if (q.length === 0 || q.length > 100) {
    return NextResponse.json(EMPTY);
  }
  const db = await getDatabase();
  return NextResponse.json(await search(db, q));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web test -- searchApi`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/search/route.ts apps/web/src/test/searchApi.test.ts
git commit -m "feat(web): add /api/search JSON handler with input validation"
```

---

### Task 9: SearchResults shared component

**Files:**
- Create: `apps/web/src/components/search/SearchResults.tsx`
- Test: `apps/web/src/test/SearchResults.test.tsx`

**Interfaces:**
- Consumes: `SearchResult`, `JumpVerse`, `VerseHit` types from `@quran-corpus/data`.
- Produces: `SearchResults({ result }: { result: SearchResult }): JSX.Element` — renders three sections (Jump → Verses → Roots), each with an empty-state fallback; sentinel-marked snippets become `<mark>` via a local `Highlighted` helper; jump word highlighted at `highlightPosition`. Server-component-safe (no client hooks).

- [ ] **Step 1: Write the failing test** — `apps/web/src/test/SearchResults.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SearchResults } from '../components/search/SearchResults';
import type { SearchResult } from '@quran-corpus/data';

const base: SearchResult = { jump: null, verses: [], roots: [] };

describe('SearchResults', () => {
  it('renders a verse snippet with <mark> around sentinels', () => {
    const result: SearchResult = {
      ...base,
      verses: [{ surah_id: 2, ayah_number: 255, source: 'en', snippet: 'the \u0002throne\u0003 verse' }],
    };
    const { container } = render(<SearchResults result={result} />);
    const mark = container.querySelector('mark');
    expect(mark).not.toBeNull();
    expect(mark!.textContent).toBe('throne');
  });
  it('links a jump verse and highlights the target word', () => {
    const jump = {
      surah_id: 1, ayah_number: 1, text_uthmani: 'بِسْمِ ٱللَّهِ',
      words: [{ position: 1, text_arabic: 'بِسْمِ' }, { position: 2, text_arabic: 'ٱللَّهِ' }],
      highlightPosition: 2,
    };
    const { container } = render(<SearchResults result={{ ...base, jump }} />);
    expect(screen.getByRole('link', { name: /1:1/ })).toHaveAttribute('href', '/surah/1');
    expect(container.querySelector('mark')!.textContent).toBe('ٱللَّهِ');
  });
  it('renders a surah-level jump link when ayah is null', () => {
    const jump = { surah_id: 2, ayah_number: null, text_uthmani: '', words: [], highlightPosition: null };
    render(<SearchResults result={{ ...base, jump }} />);
    expect(screen.getByRole('link', { name: /surah 2/i })).toHaveAttribute('href', '/surah/2');
  });
  it('shows an empty state when nothing matches', () => {
    render(<SearchResults result={base} />);
    expect(screen.getByText(/no results/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- SearchResults`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement** — `apps/web/src/components/search/SearchResults.tsx`:

```typescript
import Link from 'next/link';
import type { SearchResult, JumpVerse, VerseHit } from '@quran-corpus/data';

// Snippet matches are wrapped by FTS5 in \u0002…\u0003. Split on those sentinels
// and wrap odd segments in <mark> — text nodes only, never raw HTML (OWASP).
function Highlighted({ text }: { text: string }) {
  const parts = text.split(/[\u0002\u0003]/);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>,
      )}
    </>
  );
}

function JumpSection({ jump }: { jump: JumpVerse }) {
  if (jump.ayah_number === null) {
    return (
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-paper-500">Jump to</h2>
        <Link href={`/surah/${jump.surah_id}`} className="text-paper-900 dark:text-paper-100 underline">
          Surah {jump.surah_id}
        </Link>
      </section>
    );
  }
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold text-paper-500">Jump to</h2>
      <Link href={`/surah/${jump.surah_id}`} className="block">
        <span className="text-xs text-paper-500">{`${jump.surah_id}:${jump.ayah_number}`}</span>
        <p dir="rtl" className="font-arabic text-2xl leading-loose text-paper-900 dark:text-paper-100">
          {jump.words.length > 0
            ? jump.words.map((w) => (
                <span key={w.position}>
                  {w.position === jump.highlightPosition ? (
                    <mark>{w.text_arabic}</mark>
                  ) : (
                    w.text_arabic
                  )}{' '}
                </span>
              ))
            : jump.text_uthmani}
        </p>
      </Link>
    </section>
  );
}

export function SearchResults({ result }: { result: SearchResult }) {
  const { jump, verses, roots } = result;
  const empty = !jump && verses.length === 0 && roots.length === 0;
  if (empty) {
    return <p className="py-8 text-center text-paper-500">No results.</p>;
  }
  return (
    <div>
      {jump && <JumpSection jump={jump} />}

      {verses.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-paper-500">Verses</h2>
          <ul className="space-y-3">
            {verses.map((v: VerseHit, i) => (
              <li key={`${v.source}-${v.surah_id}-${v.ayah_number}-${i}`}>
                <Link href={`/surah/${v.surah_id}`} className="block">
                  <span className="text-xs uppercase text-paper-400">
                    {`${v.surah_id}:${v.ayah_number} · ${v.source}`}
                  </span>
                  <p className="text-paper-800 dark:text-paper-200">
                    <Highlighted text={v.snippet} />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {roots.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-paper-500">Roots</h2>
          <ul className="flex flex-wrap gap-2">
            {roots.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/dictionary/${r.root_buckwalter}`}
                  className="rounded-full bg-paper-200 px-3 py-1 text-sm dark:bg-night-100"
                >
                  <span className="font-arabic">{r.root_arabic}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
```

> Root link path mirrors the existing dictionary route `app/dictionary/[root]/page.tsx` (param = `root_buckwalter`). Verify that param name against that page before finalizing; adjust the `href` if it differs.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web test -- SearchResults`
Expected: PASS — `<mark>` for snippet + jump word; surah-level link; empty state.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/search/SearchResults.tsx apps/web/src/test/SearchResults.test.tsx
git commit -m "feat(web): add shared SearchResults component with highlight"
```

---

### Task 10: /search SSR page + query parser

**Files:**
- Create: `apps/web/src/app/search/page.tsx`
- Create: `apps/web/src/app/search/params.ts`
- Test: `apps/web/src/test/searchParams.test.ts`

**Interfaces:**
- Consumes: `search`, `getDatabase`, `SearchResults`.
- Produces: `parseSearchQuery(q: string | undefined): string | null` (trim, cap 100, null if empty); SSR page reading `?q=`.

- [ ] **Step 1: Write the failing test** — `apps/web/src/test/searchParams.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseSearchQuery } from '../app/search/params';

describe('parseSearchQuery', () => {
  it('trims and returns a query', () => expect(parseSearchQuery('  throne ')).toBe('throne'));
  it('returns null for undefined', () => expect(parseSearchQuery(undefined)).toBeNull());
  it('returns null for blank', () => expect(parseSearchQuery('   ')).toBeNull());
  it('caps length at 100', () => expect(parseSearchQuery('x'.repeat(200))).toHaveLength(100));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- searchParams`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `apps/web/src/app/search/params.ts`:

```typescript
// Kept out of page.tsx: Next route modules may only export reserved names.
export function parseSearchQuery(q: string | undefined): string | null {
  if (q == null) return null;
  const trimmed = q.trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, 100);
}
```

`apps/web/src/app/search/page.tsx`:

```typescript
export const dynamic = 'force-dynamic';

import { search } from '@quran-corpus/data';
import { getDatabase } from '../../lib/db';
import { SearchResults } from '../../components/search/SearchResults';
import { parseSearchQuery } from './params';

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

const EMPTY = { jump: null, verses: [], roots: [] };

export default async function SearchPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const query = parseSearchQuery(q);
  const db = await getDatabase();
  const result = query ? await search(db, query) : EMPTY;
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-paper-900 dark:text-paper-100">Search</h1>
      <form role="search" action="/search" method="get" className="mb-6 flex gap-2">
        <input
          type="search"
          name="q"
          aria-label="Search the Quran"
          defaultValue={query ?? ''}
          placeholder="Verse (2:255), Arabic, meaning, or word…"
          className="flex-1 rounded-lg border border-paper-300 bg-paper-50 px-4 py-2 text-paper-900 placeholder:text-paper-400 focus:border-paper-500 focus:outline-none dark:border-night-100 dark:bg-night-50 dark:text-paper-100"
        />
        <button
          type="submit"
          className="rounded-lg bg-paper-800 px-4 py-2 text-sm font-medium text-paper-50 dark:bg-night-100 dark:text-paper-100"
        >
          Search
        </button>
      </form>
      {query && <SearchResults result={result} />}
    </main>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web test -- searchParams && pnpm --filter web type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/search/page.tsx apps/web/src/app/search/params.ts apps/web/src/test/searchParams.test.ts
git commit -m "feat(web): add /search SSR page + query parser"
```

---

### Task 11: SearchSheet live bottom-sheet

**Files:**
- Create: `apps/web/src/components/search/SearchSheet.tsx`
- Test: `apps/web/src/test/SearchSheet.test.tsx`

**Interfaces:**
- Consumes: `SearchResults`; `/api/search` endpoint; `framer-motion` (already in stack).
- Produces: `SearchSheet({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element` — client component. Debounced (200ms) input → `fetch('/api/search?q=')` → `SearchResults`. Respects `prefers-reduced-motion` (via `useReducedMotion`). "See all" link → `/search?q=`.

- [ ] **Step 1: Write the failing test** — `apps/web/src/test/SearchSheet.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SearchSheet } from '../components/search/SearchSheet';

const result = { jump: null, verses: [{ surah_id: 2, ayah_number: 255, source: 'en', snippet: 'the throne' }], roots: [] };

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => result }) as Response));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('SearchSheet', () => {
  it('renders an input when open', () => {
    render(<SearchSheet open onClose={() => {}} />);
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });
  it('debounces then fetches and renders results', async () => {
    render(<SearchSheet open onClose={() => {}} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'throne' } });
    expect(fetch).not.toHaveBeenCalled(); // not yet — still within debounce
    await vi.advanceTimersByTimeAsync(250);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/search?q=throne'));
  });
  it('calls onClose from the close control', () => {
    const onClose = vi.fn();
    render(<SearchSheet open onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- SearchSheet`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement** — `apps/web/src/components/search/SearchSheet.tsx`:

```typescript
'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import type { SearchResult } from '@quran-corpus/data';
import { SearchResults } from './SearchResults';

const EMPTY: SearchResult = { jump: null, verses: [], roots: [] };

export function SearchSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [result, setResult] = useState<SearchResult>(EMPTY);
  const reduce = useReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const term = q.trim();
    if (term.length === 0) {
      setResult(EMPTY);
      return;
    }
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
      setResult((await res.json()) as SearchResult);
    }, 200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            role="dialog"
            aria-label="Search"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-paper-50 p-4 dark:bg-night-300"
            initial={reduce ? { opacity: 0 } : { y: '100%' }}
            animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            <div className="mb-4 flex items-center gap-2">
              <input
                type="search"
                autoFocus
                aria-label="Search the Quran"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Verse, Arabic, meaning, or word…"
                className="flex-1 rounded-lg border border-paper-300 bg-paper-50 px-4 py-2 focus:outline-none dark:border-night-100 dark:bg-night-50"
              />
              <button type="button" aria-label="Close search" onClick={onClose} className="px-2 text-paper-500">
                ✕
              </button>
            </div>
            <SearchResults result={result} />
            {q.trim().length > 0 && (
              <Link
                href={`/search?q=${encodeURIComponent(q.trim())}`}
                onClick={onClose}
                className="mt-4 block text-center text-sm text-paper-600 underline dark:text-paper-300"
              >
                See all results
              </Link>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web test -- SearchSheet`
Expected: PASS — input renders, debounce→fetch, close.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/search/SearchSheet.tsx apps/web/src/test/SearchSheet.test.tsx
git commit -m "feat(web): add live SearchSheet bottom-sheet"
```

---

### Task 12: Header search trigger + mount

**Files:**
- Create: `apps/web/src/components/search/SearchTrigger.tsx`
- Modify: `apps/web/src/app/layout.tsx`
- Test: `apps/web/src/test/SearchTrigger.test.tsx`

**Interfaces:**
- Consumes: `SearchSheet` (Task 11).
- Produces: `SearchTrigger(): JSX.Element` — client component: a floating 🔍 button that toggles `SearchSheet` open. Mounted globally in `layout.tsx`.

- [ ] **Step 1: Write the failing test** — `apps/web/src/test/SearchTrigger.test.tsx`:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchTrigger } from '../components/search/SearchTrigger';

describe('SearchTrigger', () => {
  it('shows a search button and opens the sheet on click', () => {
    render(<SearchTrigger />);
    const btn = screen.getByRole('button', { name: /search/i });
    expect(btn).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /search/i })).toBeNull();
    fireEvent.click(btn);
    expect(screen.getByRole('dialog', { name: /search/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web test -- SearchTrigger`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement** — `apps/web/src/components/search/SearchTrigger.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { SearchSheet } from './SearchSheet';

export function SearchTrigger() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Search"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-paper-800 text-paper-50 shadow-lg dark:bg-night-100 dark:text-paper-100"
      >
        🔍
      </button>
      <SearchSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
```

Modify `apps/web/src/app/layout.tsx` — import and mount inside `<body>` after `{children}`:

```typescript
import { SearchTrigger } from '../components/search/SearchTrigger';
```

```typescript
      <body className="bg-paper-50 font-sans text-paper-900 antialiased dark:bg-night-300 dark:text-paper-100">
        {children}
        <SearchTrigger />
      </body>
```

- [ ] **Step 4: Run full web + data suites + lint**

Run: `pnpm --filter web test && pnpm --filter web lint && pnpm --filter @quran-corpus/data test`
Expected: PASS — all green.

- [ ] **Step 5: Manual smoke against the real DB (optional but recommended)**

Run: `DATABASE_URL=file:/home/claude/quran-data/quran.db pnpm --filter web dev` then hit `/search?q=2:255` (jump), `/search?q=الرحمن` (Arabic), `/search?q=throne` (translation). Confirm highlight + jump.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/search/SearchTrigger.tsx apps/web/src/app/layout.tsx apps/web/src/test/SearchTrigger.test.tsx
git commit -m "feat(web): mount global search trigger + sheet"
```

---

## Self-Review

**Spec coverage:**
- Verse-ref jump (`S`, `S:A`, `S:A:W`, surah-name) → Task 5 + Task 7. ✓
- Root/meaning (reuse `searchRoots`) → Task 7 orchestrator. ✓
- Translation-text FTS5 → Tasks 3/4/6. ✓
- Arabic verse text harakat-free → Task 2 normalizer + Tasks 3/4/6 (unified FTS5). ✓
- Two surfaces sharing one query layer + one component → Task 8 (API), 9 (SearchResults), 10 (/search), 11 (sheet), 12 (entry). ✓
- Deterministic ranking Jump→Verses(bm25)→Roots → Task 7 order + Task 9 render order. ✓
- Highlight (snippet + word-ref) → Task 6 sentinels + Task 9 `<mark>`. ✓
- Migrate splitter prereq → Task 1. ✓
- OWASP (validation, FTS escape, no raw HTML, no logging) → Tasks 2/6/8/9. ✓
- Testing (data unit, web component, API) → every task ships tests. E2E smoke = Task 12 Step 5 (manual; automated Playwright deferred — corpus has no existing Playwright harness in this package set, YAGNI for 07b).

**Placeholder scan:** No TBD/TODO; every code step is complete runnable code. Two verify-before-finalize notes (root param name in Task 9; framer-motion presence) are explicit checks, not placeholders.

**Type consistency:** `VerseRef{surah,ayah,position}`, `VerseHit{surah_id,ayah_number,source,snippet}`, `JumpVerse{...,highlightPosition}`, `SearchResult{jump,verses,roots}` — defined in Tasks 5/6/7, consumed identically in Tasks 8–12. `search`/`searchVerses`/`parseVerseRef`/`backfillSearchIndex` names consistent across data + web. `snippet(search_fts, 4, …)` matches body column index (0-based) in the Task 3 DDL.

**Risks carried from spec:** normalizer coverage (mitigated by Task 2 real-verse assertions); migrate-splitter regression (Task 1 keeps existing migrate tests); FTS5 availability (RESOLVED — probed).
