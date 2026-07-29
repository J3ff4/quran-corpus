# Versioned API v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Version and harden the three API routes `apps/web` already calls, moving their wire contract into a package a future `apps/mobile` can import.

**Architecture:** Zod schemas in a new `packages/api-contract` are the single artifact — types come from `z.infer`, so validation and types cannot drift. Three `apps/web` route handlers under `app/api/v1/` are adapters only: parse → validate → call one query → map row to DTO → respond. `packages/api-contract` imports nothing from `packages/data`, so mobile can consume types without dragging `@libsql/client` into its bundle.

**Tech Stack:** TypeScript (NodeNext, `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Next.js 15 App Router route handlers, zod, vitest, pnpm workspaces + turbo.

Source spec: `docs/superpowers/specs/2026-07-29-versioned-api-v1-design.md`, **deliberately narrowed** — see the next section.

---

## Scope: three routes, not twelve

The spec designed a twelve-route read API. This plan builds three. The reasoning, recorded so it is not relitigated:

**Spec D2 and D3 cancel each other out.** D3 asks for a full read API; D2 says `apps/mobile` bundles the corpus DB and works fully offline. An offline consumer does not call a read API. Nine of the twelve routes would have shipped with **no consumer at all** — not a future one, none: `apps/mobile` does not exist, and per D2 it would not call them if it did.

**The three routes built here already exist and are already exposed.** They are unauthenticated `GET`s fetched by client components today:

| Live route | Caller |
|---|---|
| `/api/surahs` | `SearchSheet` verse picker |
| `/api/search` | `SearchSheet` debounced search |
| `/api/roots/[root]/concordance` | `ConcordanceList` "load more" |

Versioning them adds no attack surface. Building the other nine would have added nine unauthenticated, un-rate-limited endpoints — some expensive — to a homelab box, with the mitigation (spec D6, Cloudflare edge rate limiting) not yet configured.

**Kept from the spec:** the contract package and zod-as-single-artifact (D10), path versioning with additive-only rules (D7), bare JSON with an error body (D9), the paging envelope (D11), no app auth (D6).

**Dropped:** `/surahs/{id}`, `/surahs/{id}/ayahs`, `/ayahs/{s}:{a}`, `/ayahs/{s}:{a}/translations`, `/words/{s}:{a}:{w}`, `/roots`, `/roots/{bw}`, `/translations`, `/audio/{s}:{a}` — nine routes, no consumer. Adding any later is additive under D7 and needs no version bump. The three `packages/data` queries the spec required (`getAyahByLocation`, `getGlossForWord`, `getLanguages`) existed only to serve those routes and are not written.

**What this fixes that is real today:**

1. **`/api/roots/[root]/concordance` accepts an unbounded `offset`** — `clampInt(sp.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER)`. A large offset makes SQLite walk and discard rows on the corpus's most expensive query, which also rebuilds verse text per row. This plan caps it.
2. **`/api/surahs` returns `PickerSurah`** — a web component's private type frozen into a URL. v1 returns a neutral `SurahDTO` and the component derives its own shape.
3. **No validated contract.** Today's responses are whatever the handler happened to build. Every v1 response is parsed against its schema in a test.

**Not in scope, and not a code change:** Cloudflare edge rate limiting. See "Required before this is exposed" at the end — it applies to the three routes as they are live *today*, independently of this plan.

## Global Constraints

- **`packages/api-contract` imports nothing from `packages/data`.** No `import` of `@quran-corpus/data`, `@libsql/client`, `node:*`, or any Next.js module, in any file under `packages/api-contract/src/`. Task 1 adds a test that enforces this.
- **Only one new runtime dependency: `zod`, pinned `^3.23.8`, and only in `packages/api-contract`.** Do not add it to `apps/web` or `packages/data`. Do not upgrade to zod v4 in this phase — every schema here is written against the v3 API, and v3 already strips unknown keys by default, which is what forward compatibility rests on.
- **All three routes are `GET` and read-only.** No POST/PUT/PATCH/DELETE handlers anywhere under `app/api/v1/`.
- **Every v1 route file declares `export const dynamic = 'force-dynamic';`** — these read a DB and must never be prerendered at build.
- **Error body is always** `{ "error": <code>, "message": <string> }` with `error` ∈ `'invalid_params'` (400) | `'not_found'` (404) | `'internal'` (500). No other codes, no other body shape, no 401/403 — unauthenticated is the design.
- **Errors never echo raw input back, and never carry a DB error message or stack.** Server-side `console.error` for the detail; the client gets the code plus fixed prose.
- **No CORS headers anywhere.** Deliberate: web is same-origin, and `Access-Control-Allow-Origin: *` would hand any webpage the homelab's read bandwidth.
- **`Cache-Control: public, max-age=86400`** on `/api/v1/surahs` and the concordance route; `public, max-age=60` on `/api/v1/search`, whose query space is unbounded.
- **The Buckwalter root pattern is exactly** `/^[A-Za-z'`><{}|&*$~]{1,12}$/` — copied verbatim from the route being replaced. Do not "improve" it.
- **Concordance keeps its own tighter caps:** `MAX_LIMIT = 50` and `MAX_FORM_IDS = 50`, and an oversized `forms=` list returns 400 rather than being silently truncated.
- **`packages/data` is not modified by this plan.** Its 176 tests must stay green, unchanged.
- **No `// @ts-ignore`, no disabled lint rules without an inline justification comment** (CLAUDE.md §4).
- **Conventional Commits** on every commit: `type(scope): subject` (CLAUDE.md §9).

## Response shape corrections carried into this plan

Two points the spec got wrong, because it predates reading the backing query signatures:

1. **`/search` takes no `limit`/`offset`.** `search(db, q)` returns a composite `{ jump, verses, roots }`, internally capped (verses 50, roots 100) with no offset. It is not a paginated collection, so the envelope does not apply. Route is `/api/v1/search?q=` only.
2. **The concordance response shape does change.** The spec's migration table said "none", which referred to *params*. The body goes from `{ entries, total }` to `{ items, total, limit, offset }`. `ConcordanceList.tsx` is updated in Task 4.

**DTO field policy.** DTOs keep primary keys. `roots.id` is a live React key in `SearchResults.tsx:115`, and `word_id` / `verse_words[].id` drive `trimConcordanceVerse`. Mappers drop nothing from these three responses today; they list fields explicitly so a new DB column is opt-in rather than published by accident.

**Naming policy.** DTOs keep the DB's snake_case location names — `surah_id`, `ayah_number`, `position` — because that is already the live wire format for concordance and search.

---

## File Structure

**Created — `packages/api-contract/`**

| File | Responsibility |
|---|---|
| `package.json` | `@quran-corpus/api-contract`, `type: module`, zod dep, build/test scripts |
| `tsconfig.json` | extends `@quran-corpus/config/tsconfig/base`, `outDir: dist`, `rootDir: src` |
| `vitest.config.ts` | node environment, `globals: false` |
| `src/index.ts` | `export * as v1 from './v1/index.js'` |
| `src/v1/index.ts` | namespace barrel |
| `src/v1/common.ts` | error body, codes, caps, `paged()`, shared param schemas |
| `src/v1/surahs.ts` | `SurahDTO` |
| `src/v1/roots.ts` | `RootDTO`, `VerseWordDTO`, `ConcordanceEntryDTO`, `PagedConcordanceDTO` |
| `src/v1/search.ts` | `VerseHitDTO`, `JumpVerseDTO`, `SearchResultDTO` |
| `tests/common.test.ts` | param-schema bounds, error body, `paged()` |
| `tests/purity.test.ts` | enforces the no-`packages/data` / no-node import constraint |
| `tests/schemas.test.ts` | every resource schema parses a valid fixture and rejects a broken one |

**Created — `apps/web/src/app/api/v1/`**

| File | Responsibility |
|---|---|
| `_lib/respond.ts` | `ApiError`, `json()`, `fail()`, `handle()` |
| `_lib/params.ts` | string → value parsing: `clampInt`, `parseFormIds`, `parseRootBw` |
| `_lib/map.ts` | `packages/data` row types → v1 DTOs (the only place this conversion happens) |
| `surahs/route.ts` | `GET /api/v1/surahs` |
| `search/route.ts` | `GET /api/v1/search?q=` |
| `roots/[root]/concordance/route.ts` | `GET /api/v1/roots/{bw}/concordance?forms=&limit=&offset=` |

**Modified**

- `apps/web/package.json` — add `@quran-corpus/api-contract` dep
- `apps/web/src/components/search/SearchSheet.tsx` — two fetch URLs, plus mapping `SurahDTO` → `PickerSurah` client-side
- `apps/web/src/components/dictionary/ConcordanceList.tsx` — URL, and `entries` → `items`
- `apps/web/src/test/SearchSheet.test.tsx`, `apps/web/src/test/ConcordanceList.test.tsx` — mocked URLs and payloads

**Deleted (Task 4)**

- `apps/web/src/app/api/search/route.ts`, `apps/web/src/app/api/surahs/route.ts`, `apps/web/src/app/api/roots/[root]/concordance/route.ts`
- `apps/web/src/test/api-surahs.test.ts`, `searchApi.test.ts`, `concordanceRoute.test.ts` — coverage ported into the v1 test files in Task 3

---

## Task 1: `packages/api-contract`

**Files:**
- Create: `packages/api-contract/package.json`
- Create: `packages/api-contract/tsconfig.json`
- Create: `packages/api-contract/vitest.config.ts`
- Create: `packages/api-contract/src/index.ts`
- Create: `packages/api-contract/src/v1/index.ts`
- Create: `packages/api-contract/src/v1/common.ts`
- Create: `packages/api-contract/src/v1/surahs.ts`
- Create: `packages/api-contract/src/v1/roots.ts`
- Create: `packages/api-contract/src/v1/search.ts`
- Test: `packages/api-contract/tests/common.test.ts`
- Test: `packages/api-contract/tests/purity.test.ts`
- Test: `packages/api-contract/tests/schemas.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, all reachable as `v1.<name>` from `@quran-corpus/api-contract`:
  - `API_ERROR_CODES` (readonly tuple), `ApiErrorCode` (union type), `ErrorBody`
  - `DEFAULT_LIMIT = 20`, `MAX_LIMIT = 100`, `MAX_OFFSET = 100000`, `CONCORDANCE_MAX_LIMIT = 50`, `MAX_FORM_IDS = 50`
  - `BUCKWALTER_PATTERN` (RegExp), `paged<T>(item: T)`
  - `SurahIdParam`, `AyahNumberParam`, `WordPositionParam`, `RootBwParam`, `SearchQueryParam`, `LimitParam`, `OffsetParam`
  - `SurahDTO`, `RootDTO`, `VerseWordDTO`, `ConcordanceEntryDTO`, `PagedConcordanceDTO`, `VerseHitDTO`, `JumpVerseDTO`, `SearchResultDTO`

Each schema is exported twice under one name — zod's value and `z.infer`'s type — using `export const X = …; export type X = z.infer<typeof X>;`.

- [ ] **Step 1: Create the package manifest**

`packages/api-contract/package.json`:

```json
{
  "name": "@quran-corpus/api-contract",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@quran-corpus/config": "workspace:*",
    "@types/node": "^22.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig and vitest config**

`packages/api-contract/tsconfig.json`:

```json
{
  "extends": "@quran-corpus/config/tsconfig/base",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["tests/**/*", "dist/**/*", "node_modules/**/*"]
}
```

`packages/api-contract/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
  },
});
```

No `"types": ["node"]` in tsconfig — the package must not use node built-ins, and omitting the types makes that a compile error rather than a convention.

- [ ] **Step 3: Install**

Run: `pnpm install`

Expected: `packages/api-contract` appears in the workspace; `zod` resolves under `packages/api-contract/node_modules`. `pnpm-workspace.yaml` already globs `packages/*`, so no edit is needed there.

- [ ] **Step 4: Write the failing tests**

`packages/api-contract/tests/common.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  ErrorBody,
  API_ERROR_CODES,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_OFFSET,
  CONCORDANCE_MAX_LIMIT,
  MAX_FORM_IDS,
  BUCKWALTER_PATTERN,
  paged,
  SurahIdParam,
  AyahNumberParam,
  WordPositionParam,
  RootBwParam,
  SearchQueryParam,
} from '../src/v1/common.js';

describe('common caps', () => {
  it('pins the documented numeric caps', () => {
    expect(DEFAULT_LIMIT).toBe(20);
    expect(MAX_LIMIT).toBe(100);
    expect(MAX_OFFSET).toBe(100_000);
    expect(CONCORDANCE_MAX_LIMIT).toBe(50);
    expect(MAX_FORM_IDS).toBe(50);
  });
});

describe('ErrorBody', () => {
  it('accepts the three codes and nothing else', () => {
    expect(API_ERROR_CODES).toEqual(['invalid_params', 'not_found', 'internal']);
    expect(ErrorBody.safeParse({ error: 'not_found', message: 'no' }).success).toBe(true);
    expect(ErrorBody.safeParse({ error: 'teapot', message: 'no' }).success).toBe(false);
  });

  it('requires a message', () => {
    expect(ErrorBody.safeParse({ error: 'internal' }).success).toBe(false);
  });
});

describe('paged', () => {
  it('wraps an item schema with items/total/limit/offset', () => {
    const s = paged(z.object({ id: z.number() }));
    expect(s.safeParse({ items: [{ id: 1 }], total: 1, limit: 20, offset: 0 }).success).toBe(true);
  });

  it('rejects a negative offset and a zero limit', () => {
    const s = paged(z.object({ id: z.number() }));
    expect(s.safeParse({ items: [], total: 0, limit: 20, offset: -1 }).success).toBe(false);
    expect(s.safeParse({ items: [], total: 0, limit: 0, offset: 0 }).success).toBe(false);
  });

  it('strips unknown keys rather than throwing, so an older client survives a newer response', () => {
    const s = paged(z.object({ id: z.number() }));
    const out = s.parse({
      items: [{ id: 1, futureField: 'x' }],
      total: 1,
      limit: 20,
      offset: 0,
      nextCursor: 'y',
    });
    expect(out.items[0]).toEqual({ id: 1 });
    expect(out).not.toHaveProperty('nextCursor');
  });
});

describe('param schemas', () => {
  it('bounds surah to 1..114', () => {
    expect(SurahIdParam.safeParse(1).success).toBe(true);
    expect(SurahIdParam.safeParse(114).success).toBe(true);
    expect(SurahIdParam.safeParse(0).success).toBe(false);
    expect(SurahIdParam.safeParse(115).success).toBe(false);
    expect(SurahIdParam.safeParse(1.5).success).toBe(false);
  });

  it('bounds ayah to 1..286, the length of the longest surah', () => {
    expect(AyahNumberParam.safeParse(286).success).toBe(true);
    expect(AyahNumberParam.safeParse(287).success).toBe(false);
    expect(AyahNumberParam.safeParse(0).success).toBe(false);
  });

  it('requires word position >= 1', () => {
    expect(WordPositionParam.safeParse(1).success).toBe(true);
    expect(WordPositionParam.safeParse(0).success).toBe(false);
  });

  it('accepts Buckwalter roots and rejects path junk', () => {
    expect(RootBwParam.safeParse('ktb').success).toBe(true);
    expect(RootBwParam.safeParse('>mn').success).toBe(true);
    expect(RootBwParam.safeParse('../etc').success).toBe(false);
    expect(RootBwParam.safeParse('').success).toBe(false);
    expect(RootBwParam.safeParse('abcdefghijklm').success).toBe(false);
    expect(BUCKWALTER_PATTERN.source).toBe("^[A-Za-z'`><{}|&*$~]{1,12}$");
  });

  it('bounds the search query to 1..100 chars', () => {
    expect(SearchQueryParam.safeParse('a').success).toBe(true);
    expect(SearchQueryParam.safeParse('a'.repeat(100)).success).toBe(true);
    expect(SearchQueryParam.safeParse('a'.repeat(101)).success).toBe(false);
    expect(SearchQueryParam.safeParse('').success).toBe(false);
  });
});
```

`packages/api-contract/tests/purity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// This package is what a future apps/mobile imports. If anything here reaches
// into @quran-corpus/data, mobile drags @libsql/client into its bundle -- the
// same failure the @quran-corpus/data/client split already exists to prevent.
// Node built-ins are banned too: React Native has no node core.
const BANNED = ['@quran-corpus/data', '@libsql/client', 'next/', 'node:'];

const srcDir = join(process.cwd(), 'src');

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((p) => p.endsWith('.ts'))
    .map((p) => join(dir, p));
}

describe('api-contract purity', () => {
  const files = tsFiles(srcDir);

  it('finds the source files it is meant to guard', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s imports nothing banned', (file) => {
    const src = readFileSync(file, 'utf8');
    for (const banned of BANNED) {
      expect(src).not.toContain(`from '${banned}`);
      expect(src).not.toContain(`from "${banned}`);
    }
  });

  it('depends only on zod at runtime', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {})).toEqual(['zod']);
  });
});
```

`packages/api-contract/tests/schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SurahDTO } from '../src/v1/surahs.js';
import { RootDTO, VerseWordDTO, ConcordanceEntryDTO, PagedConcordanceDTO } from '../src/v1/roots.js';
import { SearchResultDTO } from '../src/v1/search.js';

const surah = {
  id: 1,
  name_arabic: 'الفاتحة',
  name_translit: 'Al-Fatihah',
  name_translation: 'The Opening',
  revelation_type: 'meccan',
  ayah_count: 7,
  order_number: 1,
};

const entry = {
  surah_id: 2,
  ayah_number: 2,
  position: 3,
  word_id: 40,
  text_arabic: 'ٱلْكِتَٰبُ',
  transliteration: 'l-kitābu',
  gloss: 'the Book',
  verse_words: [
    { id: 38, position: 1, text_arabic: 'ذَٰلِكَ' },
    { id: 39, position: 2, text_arabic: 'ٱلْكِتَٰبُ', starts_clause: true },
  ],
  form_id: 3,
};

describe('SurahDTO', () => {
  it('accepts a surah row', () => {
    expect(SurahDTO.safeParse(surah).success).toBe(true);
  });

  it('rejects an unknown revelation_type', () => {
    expect(SurahDTO.safeParse({ ...surah, revelation_type: 'martian' }).success).toBe(false);
  });
});

describe('RootDTO', () => {
  it('accepts a root', () => {
    expect(
      RootDTO.safeParse({ id: 1, root_buckwalter: 'ktb', root_arabic: 'كتب', occurrence_count: 319 })
        .success,
    ).toBe(true);
  });
});

describe('VerseWordDTO', () => {
  it('treats starts_clause as optional -- it is present only on concordance verses', () => {
    expect(VerseWordDTO.safeParse({ id: 1, position: 1, text_arabic: 'x' }).success).toBe(true);
    expect(
      VerseWordDTO.safeParse({ id: 1, position: 1, text_arabic: 'x', starts_clause: true }).success,
    ).toBe(true);
  });
});

describe('ConcordanceEntryDTO', () => {
  it('accepts a full entry', () => {
    expect(ConcordanceEntryDTO.safeParse(entry).success).toBe(true);
  });

  it('accepts form_id null -- a data gap, not an error', () => {
    expect(
      ConcordanceEntryDTO.safeParse({ ...entry, form_id: null, transliteration: null, gloss: null })
        .success,
    ).toBe(true);
  });

  it('pages', () => {
    expect(
      PagedConcordanceDTO.safeParse({ items: [entry], total: 319, limit: 20, offset: 0 }).success,
    ).toBe(true);
  });
});

describe('SearchResultDTO', () => {
  it('accepts an empty result', () => {
    expect(SearchResultDTO.safeParse({ jump: null, verses: [], roots: [] }).success).toBe(true);
  });

  it('accepts a jump with a null ayah_number (whole-surah reference)', () => {
    expect(
      SearchResultDTO.safeParse({
        jump: {
          surah_id: 2,
          ayah_number: null,
          text_uthmani: '',
          words: [],
          highlightPosition: null,
        },
        verses: [{ surah_id: 1, ayah_number: 1, source: 'ar', snippet: 'بسم' }],
        roots: [{ id: 1, root_buckwalter: 'ktb', root_arabic: 'كتب', occurrence_count: 319 }],
      }).success,
    ).toBe(true);
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `pnpm --filter @quran-corpus/api-contract test`

Expected: FAIL — `Failed to resolve import "../src/v1/common.js"`.

- [ ] **Step 6: Write `src/v1/common.ts`**

```ts
import { z } from 'zod';

export const API_ERROR_CODES = ['invalid_params', 'not_found', 'internal'] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const ErrorBody = z.object({
  error: z.enum(API_ERROR_CODES),
  message: z.string(),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

/** Global ceiling. Endpoints may cap lower (concordance does); none may cap higher. */
export const MAX_LIMIT = 100;
export const DEFAULT_LIMIT = 20;
/** An uncapped offset makes SQLite walk the whole result set to throw it away. */
export const MAX_OFFSET = 100_000;

/** Concordance rows carry rebuilt verse text, so they cost far more per row. */
export const CONCORDANCE_MAX_LIMIT = 50;
/** The largest root (qwm) has 22 derived forms; 50 gives headroom while staying
 *  far below SQLite's bind-variable ceiling. */
export const MAX_FORM_IDS = 50;

/** Buckwalter root alphabet: ASCII letters plus the hamza/madda/wasla symbols.
 *  Parametrized queries make injection a non-issue; this rejects junk paths early. */
export const BUCKWALTER_PATTERN = /^[A-Za-z'`><{}|&*$~]{1,12}$/;

/** The one envelope in v1. Bare arrays and objects elsewhere -- this exists
 *  because `total` has nowhere else to live. */
export function paged<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  });
}

export const SurahIdParam = z.number().int().min(1).max(114);
/** 286 is Al-Baqarah, the longest surah. */
export const AyahNumberParam = z.number().int().min(1).max(286);
export const WordPositionParam = z.number().int().min(1);
export const RootBwParam = z.string().regex(BUCKWALTER_PATTERN);
export const SearchQueryParam = z.string().min(1).max(100);

/** These document the contract's bounds. Query strings are parsed and clamped
 *  by apps/web's _lib/params.ts, where junk clamps to the default rather than
 *  400ing -- preserving the behaviour of the routes being replaced. */
export const LimitParam = z.number().int().min(1).max(MAX_LIMIT);
export const OffsetParam = z.number().int().min(0).max(MAX_OFFSET);
```

- [ ] **Step 7: Write `src/v1/surahs.ts`**

```ts
import { z } from 'zod';
import { SurahIdParam } from './common.js';

/** The neutral surah shape. Replaces PickerSurah on the wire: a web
 *  component's private type must not be frozen into a URL. */
export const SurahDTO = z.object({
  id: SurahIdParam,
  name_arabic: z.string(),
  name_translit: z.string(),
  name_translation: z.string(),
  revelation_type: z.enum(['meccan', 'medinan']),
  ayah_count: z.number().int().positive(),
  order_number: z.number().int().positive(),
});
export type SurahDTO = z.infer<typeof SurahDTO>;
```

- [ ] **Step 8: Write `src/v1/roots.ts`**

```ts
import { z } from 'zod';
import { AyahNumberParam, SurahIdParam, WordPositionParam, paged } from './common.js';

export const RootDTO = z.object({
  id: z.number().int().positive(),
  root_buckwalter: z.string(),
  root_arabic: z.string(),
  occurrence_count: z.number().int().nonnegative(),
});
export type RootDTO = z.infer<typeof RootDTO>;

export const VerseWordDTO = z.object({
  id: z.number().int().positive(),
  position: WordPositionParam,
  text_arabic: z.string(),
  /** Present only on concordance verses; absent elsewhere. */
  starts_clause: z.boolean().optional(),
});
export type VerseWordDTO = z.infer<typeof VerseWordDTO>;

export const ConcordanceEntryDTO = z.object({
  surah_id: SurahIdParam,
  ayah_number: AyahNumberParam,
  position: WordPositionParam,
  word_id: z.number().int().positive(),
  text_arabic: z.string(),
  transliteration: z.string().nullable(),
  gloss: z.string().nullable(),
  verse_words: z.array(VerseWordDTO),
  /** null when no root_forms row matches this occurrence's lemma (data gap --
   *  the occurrence still shows, just untagged and unfilterable). */
  form_id: z.number().int().positive().nullable(),
});
export type ConcordanceEntryDTO = z.infer<typeof ConcordanceEntryDTO>;

export const PagedConcordanceDTO = paged(ConcordanceEntryDTO);
export type PagedConcordanceDTO = z.infer<typeof PagedConcordanceDTO>;
```

- [ ] **Step 9: Write `src/v1/search.ts`**

```ts
import { z } from 'zod';
import { AyahNumberParam, SurahIdParam, WordPositionParam } from './common.js';
import { RootDTO } from './roots.js';

export const VerseHitDTO = z.object({
  surah_id: SurahIdParam,
  ayah_number: AyahNumberParam,
  /** 'ar' for the Arabic index, otherwise a translation language_code. */
  source: z.string(),
  snippet: z.string(),
});
export type VerseHitDTO = z.infer<typeof VerseHitDTO>;

export const JumpVerseDTO = z.object({
  surah_id: SurahIdParam,
  /** null when the query named a surah but no ayah. */
  ayah_number: AyahNumberParam.nullable(),
  text_uthmani: z.string(),
  words: z.array(z.object({ position: WordPositionParam, text_arabic: z.string() })),
  highlightPosition: WordPositionParam.nullable(),
});
export type JumpVerseDTO = z.infer<typeof JumpVerseDTO>;

/** Not a paginated collection: search() caps verses at 50 and roots at 100
 *  internally and has no offset, so the paging envelope does not apply. */
export const SearchResultDTO = z.object({
  jump: JumpVerseDTO.nullable(),
  verses: z.array(VerseHitDTO),
  roots: z.array(RootDTO),
});
export type SearchResultDTO = z.infer<typeof SearchResultDTO>;
```

- [ ] **Step 10: Write the barrels**

`packages/api-contract/src/v1/index.ts`:

```ts
export * from './common.js';
export * from './surahs.js';
export * from './roots.js';
export * from './search.js';
```

`packages/api-contract/src/index.ts`:

```ts
export * as v1 from './v1/index.js';
```

- [ ] **Step 11: Run the tests to verify they pass**

Run: `pnpm --filter @quran-corpus/api-contract test`

Expected: PASS, all tests green.

- [ ] **Step 12: Build and type-check**

Run: `pnpm --filter @quran-corpus/api-contract build && pnpm --filter @quran-corpus/api-contract type-check`

Expected: `dist/index.js` and `dist/index.d.ts` exist, no type errors.

- [ ] **Step 13: Commit**

```bash
git add packages/api-contract pnpm-lock.yaml
git commit -m "feat(api-contract): add the v1 wire contract package"
```

---

## Task 2: Handler plumbing

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/app/api/v1/_lib/respond.ts`
- Create: `apps/web/src/app/api/v1/_lib/params.ts`
- Create: `apps/web/src/app/api/v1/_lib/map.ts`
- Test: `apps/web/src/test/v1-respond.test.ts`
- Test: `apps/web/src/test/v1-params.test.ts`
- Test: `apps/web/src/test/v1-map.test.ts`

**Interfaces:**
- Consumes: `v1` from `@quran-corpus/api-contract` (Task 1); row types `Surah`, `Root`, `SearchResult` from `@quran-corpus/data`.
- Produces:
  - `respond.ts` — `class ApiError extends Error { readonly code: v1.ApiErrorCode; readonly status: number }`; `json<T>(body: T, maxAgeSeconds?: number): Response` (default `86400`); `fail(code: v1.ApiErrorCode, message: string): Response`; `handle(fn: () => Promise<Response>): Promise<Response>`.
  - `params.ts` — `clampInt(raw: string | null, fallback: number, min: number, max: number): number`; `FormIdLimitError` (class); `parseFormIds(raw: string | null): number[] | undefined`; `parseRootBw(raw: string): string` (throws `ApiError`).
  - `map.ts` — `toSurah(row: Surah): v1.SurahDTO`; `toRoot(row: Root): v1.RootDTO`; `toSearchResult(result: SearchResult): v1.SearchResultDTO`.

`params.ts` imports nothing from `@quran-corpus/data`: every route test mocks that module with a partial factory, and a named import the factory omits is a module-eval failure.

- [ ] **Step 1: Add the contract dependency to `apps/web`**

In `apps/web/package.json`, add to `dependencies`, before `@quran-corpus/data`:

```json
"@quran-corpus/api-contract": "workspace:*",
```

Run: `pnpm install`

Expected: `@quran-corpus/api-contract` resolves from `apps/web`.

- [ ] **Step 2: Write the failing tests**

`apps/web/src/test/v1-respond.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApiError, json, fail, handle } from '../app/api/v1/_lib/respond';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('json', () => {
  it('defaults to a 24h cache and 200', async () => {
    const res = json({ ok: true });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400');
    expect(await res.json()).toEqual({ ok: true });
  });

  it('honours an explicit max-age', () => {
    expect(json({ ok: true }, 60).headers.get('Cache-Control')).toBe('public, max-age=60');
  });

  it('sets no CORS header', () => {
    expect(json({ ok: true }).headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('fail', () => {
  it('maps each code to its status and emits the contract body', async () => {
    expect(fail('invalid_params', 'bad').status).toBe(400);
    expect(fail('not_found', 'gone').status).toBe(404);
    expect(fail('internal', 'boom').status).toBe(500);
    expect(await fail('not_found', 'gone').json()).toEqual({ error: 'not_found', message: 'gone' });
  });

  it('does not cache an error response', () => {
    expect(fail('not_found', 'gone').headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('handle', () => {
  it('passes a successful response through', async () => {
    const res = await handle(async () => json({ ok: true }));
    expect(res.status).toBe(200);
  });

  it('converts a thrown ApiError into its response', async () => {
    const res = await handle(async () => {
      throw new ApiError('not_found', 'no such root');
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found', message: 'no such root' });
  });

  it('converts an unexpected throw into a 500 that leaks nothing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await handle(async () => {
      throw new Error('SQLITE_BUSY: /home/joe/quran.db is locked');
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('internal');
    expect(body.message).not.toContain('SQLITE_BUSY');
    expect(body.message).not.toContain('quran.db');
    // The detail is still recorded server-side.
    expect(spy).toHaveBeenCalled();
  });
});
```

`apps/web/src/test/v1-params.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { clampInt, parseFormIds, FormIdLimitError, parseRootBw } from '../app/api/v1/_lib/params';
import { ApiError } from '../app/api/v1/_lib/respond';

describe('clampInt', () => {
  it('clamps into range', () => {
    expect(clampInt('500', 20, 1, 100)).toBe(100);
    expect(clampInt('-5', 20, 1, 100)).toBe(1);
    expect(clampInt('50', 20, 1, 100)).toBe(50);
  });

  it('falls back on junk, null and non-integers rather than 400ing', () => {
    expect(clampInt(null, 20, 1, 100)).toBe(20);
    expect(clampInt('abc', 20, 1, 100)).toBe(20);
    expect(clampInt('1.5', 20, 1, 100)).toBe(20);
    expect(clampInt('', 20, 1, 100)).toBe(20);
  });
});

describe('parseFormIds', () => {
  it('parses a comma list', () => {
    expect(parseFormIds('3,7,12')).toEqual([3, 7, 12]);
  });

  it('drops junk rather than erroring', () => {
    expect(parseFormIds('3,abc,7')).toEqual([3, 7]);
  });

  it('returns undefined for absent, empty, and all-junk input', () => {
    expect(parseFormIds(null)).toBeUndefined();
    expect(parseFormIds('')).toBeUndefined();
    expect(parseFormIds('abc,def')).toBeUndefined();
  });

  it('throws rather than silently truncating an oversized list', () => {
    const oversized = Array.from({ length: 51 }, (_, i) => i + 1).join(',');
    expect(() => parseFormIds(oversized)).toThrow(FormIdLimitError);
  });

  it('accepts exactly the maximum', () => {
    const atMax = Array.from({ length: 50 }, (_, i) => i + 1).join(',');
    expect(parseFormIds(atMax)).toHaveLength(50);
  });
});

describe('parseRootBw', () => {
  it('accepts Buckwalter and percent-decodes first', () => {
    expect(parseRootBw('ktb')).toBe('ktb');
    expect(parseRootBw('%3Emn')).toBe('>mn');
  });

  it('rejects traversal and over-long input with an invalid_params ApiError', () => {
    for (const bad of ['../etc', '', 'abcdefghijklm', '%2E%2E%2Fetc']) {
      let thrown: unknown;
      try {
        parseRootBw(bad);
      } catch (e) {
        thrown = e;
      }
      expect(thrown, `root=${bad}`).toBeInstanceOf(ApiError);
      expect((thrown as ApiError).code).toBe('invalid_params');
    }
  });

  it('never echoes the raw input back in the message', () => {
    try {
      parseRootBw('<script>alert(1)</script>');
    } catch (e) {
      expect((e as ApiError).message).not.toContain('script');
    }
  });
});
```

`apps/web/src/test/v1-map.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { v1 } from '@quran-corpus/api-contract';
import { toSurah, toRoot, toSearchResult } from '../app/api/v1/_lib/map';

describe('toSurah', () => {
  it('produces a DTO that parses against the contract', () => {
    const dto = toSurah({
      id: 1,
      name_arabic: 'الفاتحة',
      name_translit: 'Al-Fatihah',
      name_translation: 'The Opening',
      revelation_type: 'meccan',
      ayah_count: 7,
      order_number: 1,
    });
    expect(v1.SurahDTO.parse(dto)).toEqual(dto);
  });
});

describe('toRoot', () => {
  it('produces a DTO that parses against the contract', () => {
    const dto = toRoot({ id: 1, root_buckwalter: 'ktb', root_arabic: 'كتب', occurrence_count: 319 });
    expect(v1.RootDTO.parse(dto)).toEqual(dto);
  });
});

describe('toSearchResult', () => {
  it('maps the composite through and parses', () => {
    const dto = toSearchResult({
      jump: null,
      verses: [{ surah_id: 1, ayah_number: 1, source: 'ar', snippet: 'بسم' }],
      roots: [{ id: 1, root_buckwalter: 'ktb', root_arabic: 'كتب', occurrence_count: 319 }],
    });
    expect(v1.SearchResultDTO.parse(dto)).toEqual(dto);
  });

  it('carries a jump verse through', () => {
    const dto = toSearchResult({
      jump: {
        surah_id: 2,
        ayah_number: 255,
        text_uthmani: 'ٱللَّهُ',
        words: [{ position: 1, text_arabic: 'ٱللَّهُ' }],
        highlightPosition: 1,
      },
      verses: [],
      roots: [],
    });
    expect(v1.SearchResultDTO.parse(dto)).toEqual(dto);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @quran-corpus/web test src/test/v1-respond.test.ts src/test/v1-params.test.ts src/test/v1-map.test.ts`

Expected: FAIL — `Failed to resolve import "../app/api/v1/_lib/respond"`.

- [ ] **Step 4: Write `apps/web/src/app/api/v1/_lib/respond.ts`**

```ts
import { NextResponse } from 'next/server';
import { v1 } from '@quran-corpus/api-contract';

const STATUS: Record<v1.ApiErrorCode, number> = {
  invalid_params: 400,
  not_found: 404,
  internal: 500,
};

/** Thrown anywhere inside a handler; `handle` turns it into the wire body. */
export class ApiError extends Error {
  readonly code: v1.ApiErrorCode;
  readonly status: number;

  constructor(code: v1.ApiErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = STATUS[code];
  }
}

/** Success response. Corpus data is immutable between scrapes, hence the long
 *  default TTL; /search overrides it because its query space is unbounded and a
 *  long edge TTL there is a cache-fill vector rather than a win. */
export function json<T>(body: T, maxAgeSeconds = 86400): Response {
  return NextResponse.json(body, {
    headers: { 'Cache-Control': `public, max-age=${maxAgeSeconds}` },
  });
}

export function fail(code: v1.ApiErrorCode, message: string): Response {
  const body: v1.ErrorBody = { error: code, message };
  return NextResponse.json(body, {
    status: STATUS[code],
    headers: { 'Cache-Control': 'no-store' },
  });
}

/** Wraps a handler body so an ApiError becomes its response and anything else
 *  becomes a 500 that carries no DB text, path or stack to the client. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message);
    console.error('[api/v1] unhandled error', err);
    return fail('internal', 'Request failed.');
  }
}
```

- [ ] **Step 5: Write `apps/web/src/app/api/v1/_lib/params.ts`**

```ts
import { v1 } from '@quran-corpus/api-contract';
import { ApiError } from './respond';

/** Clamp a query-string integer to [min,max], falling back on junk. Junk
 *  clamps rather than 400s -- this is the behaviour of the routes being
 *  replaced, and a bad `limit` should not fail an otherwise valid request. */
export function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (raw === null || raw === '' || !Number.isInteger(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/** Thrown instead of silently truncating an oversized `forms=` list -- a caller
 *  asking for N ids must never get a 200 scoped to fewer than N with no
 *  indication anything was dropped. */
export class FormIdLimitError extends Error {}

/** Parse "3,7,12" into [3,7,12], silently dropping non-numeric entries.
 *  Returns undefined (not []) when nothing valid remains, so callers can omit
 *  the option entirely rather than pass an empty-but-present filter. */
export function parseFormIds(raw: string | null): number[] | undefined {
  if (!raw) return undefined;
  const ids = raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length > v1.MAX_FORM_IDS) throw new FormIdLimitError();
  return ids.length > 0 ? ids : undefined;
}

/** Parse a [root] path segment. Parametrized queries make injection a
 *  non-issue; this rejects junk paths early. Lives here rather than in the
 *  route file: Next.js type-checks route.ts and rejects exports that are not
 *  handlers or route config. */
export function parseRootBw(raw: string): string {
  const bw = decodeURIComponent(raw);
  if (!v1.BUCKWALTER_PATTERN.test(bw)) {
    throw new ApiError('invalid_params', 'Root must be 1-12 Buckwalter characters.');
  }
  return bw;
}
```

- [ ] **Step 6: Write `apps/web/src/app/api/v1/_lib/map.ts`**

```ts
import { v1 } from '@quran-corpus/api-contract';
import type { Surah, Root, SearchResult } from '@quran-corpus/data';

// The only place packages/data rows become v1 DTOs. A schema rename upstream
// fails here loudly instead of silently changing the wire format. Fields are
// listed explicitly rather than spread, so a new DB column is opt-in rather
// than published by accident.

export function toSurah(row: Surah): v1.SurahDTO {
  return {
    id: row.id,
    name_arabic: row.name_arabic,
    name_translit: row.name_translit,
    name_translation: row.name_translation,
    revelation_type: row.revelation_type,
    ayah_count: row.ayah_count,
    order_number: row.order_number,
  };
}

export function toRoot(row: Root): v1.RootDTO {
  return {
    id: row.id,
    root_buckwalter: row.root_buckwalter,
    root_arabic: row.root_arabic,
    occurrence_count: row.occurrence_count,
  };
}

export function toSearchResult(result: SearchResult): v1.SearchResultDTO {
  return {
    jump: result.jump,
    verses: result.verses,
    roots: result.roots.map(toRoot),
  };
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter @quran-corpus/web test src/test/v1-respond.test.ts src/test/v1-params.test.ts src/test/v1-map.test.ts`

Expected: PASS.

- [ ] **Step 8: Type-check and lint**

Run: `pnpm --filter @quran-corpus/web type-check && pnpm --filter @quran-corpus/web lint`

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/web/package.json apps/web/src/app/api/v1/_lib apps/web/src/test/v1-respond.test.ts apps/web/src/test/v1-params.test.ts apps/web/src/test/v1-map.test.ts pnpm-lock.yaml
git commit -m "feat(web/api-v1): add request/response plumbing and row-to-DTO mappers"
```

---

## Task 3: The three v1 routes

**Files:**
- Create: `apps/web/src/app/api/v1/surahs/route.ts`
- Create: `apps/web/src/app/api/v1/search/route.ts`
- Create: `apps/web/src/app/api/v1/roots/[root]/concordance/route.ts`
- Test: `apps/web/src/test/v1-surahs.test.ts`
- Test: `apps/web/src/test/v1-search.test.ts`
- Test: `apps/web/src/test/v1-concordance.test.ts`

**Interfaces:**
- Consumes: `handle`, `json`, `ApiError` from `_lib/respond`; `clampInt`, `parseFormIds`, `FormIdLimitError`, `parseRootBw` from `_lib/params`; `toSurah`, `toSearchResult` from `_lib/map`; `getAllSurahs`, `search`, `EMPTY_SEARCH_RESULT`, `getRootConcordancePage`, `countRootConcordance` from `@quran-corpus/data`; `getDatabase` from `apps/web/src/lib/db`.
- Produces:
  - `GET /api/v1/surahs` → `v1.SurahDTO[]`
  - `GET /api/v1/search?q=` → `v1.SearchResultDTO`
  - `GET /api/v1/roots/{bw}/concordance?forms=&limit=&offset=` → `v1.PagedConcordanceDTO`

Relative import depths, since these are easy to get wrong:

| Route file | `lib/db` | `_lib` |
|---|---|---|
| `v1/surahs/route.ts` | `../../../../lib/db` | `../_lib/…` |
| `v1/search/route.ts` | `../../../../lib/db` | `../_lib/…` |
| `v1/roots/[root]/concordance/route.ts` | `../../../../../../lib/db` | `../../../_lib/…` |

- [ ] **Step 1: Write the failing tests**

`apps/web/src/test/v1-surahs.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { v1 } from '@quran-corpus/api-contract';

const surahsStub = [
  {
    id: 1,
    name_arabic: 'الفاتحة',
    name_translit: 'Al-Fatihah',
    name_translation: 'The Opening',
    revelation_type: 'meccan' as const,
    ayah_count: 7,
    order_number: 1,
  },
  {
    id: 2,
    name_arabic: 'البقرة',
    name_translit: 'Al-Baqarah',
    name_translation: 'The Cow',
    revelation_type: 'medinan' as const,
    ayah_count: 286,
    order_number: 2,
  },
];

const getAllSurahs = vi.fn(async () => surahsStub);

vi.mock('@quran-corpus/data', () => ({ getAllSurahs }));
vi.mock('../lib/db', () => ({ getDatabase: vi.fn(async () => ({})) }));

const { GET } = await import('../app/api/v1/surahs/route');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/surahs', () => {
  it('returns full SurahDTOs, not the three-field PickerSurah subset', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(v1.SurahDTO.array().parse(body)).toEqual(body);
    expect(body).toHaveLength(2);
    expect(body[0]).toHaveProperty('name_arabic');
    expect(body[0]).toHaveProperty('revelation_type');
    expect(body[0]).toHaveProperty('order_number');
  });

  it('caches for a day', async () => {
    expect((await GET()).headers.get('Cache-Control')).toBe('public, max-age=86400');
  });

  it('returns the contract error body when the DB throws, leaking nothing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getAllSurahs.mockRejectedValueOnce(new Error('SQLITE_BUSY: /home/joe/quran.db'));
    const res = await GET();
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe('internal');
    expect(body.message).not.toContain('quran.db');
    spy.mockRestore();
  });
});
```

`apps/web/src/test/v1-search.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { v1 } from '@quran-corpus/api-contract';

const EMPTY_SEARCH_RESULT = { jump: null, verses: [], roots: [] };
const searchFn = vi.fn(async (_db: unknown, _q: string) => ({
  jump: null,
  verses: [{ surah_id: 1, ayah_number: 1, source: 'ar', snippet: 'بسم' }],
  roots: [{ id: 1, root_buckwalter: 'ktb', root_arabic: 'كتب', occurrence_count: 319 }],
}));

vi.mock('@quran-corpus/data', () => ({ search: searchFn, EMPTY_SEARCH_RESULT }));
vi.mock('../lib/db', () => ({ getDatabase: vi.fn(async () => ({})) }));

const { GET } = await import('../app/api/v1/search/route');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/search', () => {
  it('returns a contract-valid SearchResult', async () => {
    const res = await GET(new Request('http://x/api/v1/search?q=kitab'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(v1.SearchResultDTO.parse(body)).toEqual(body);
    expect(searchFn).toHaveBeenCalledWith(expect.anything(), 'kitab');
  });

  it('trims the query before searching', async () => {
    await GET(new Request('http://x/api/v1/search?q=%20kitab%20'));
    expect(searchFn).toHaveBeenCalledWith(expect.anything(), 'kitab');
  });

  it('returns the empty result for a missing or blank q, without querying', async () => {
    for (const url of [
      'http://x/api/v1/search',
      'http://x/api/v1/search?q=',
      'http://x/api/v1/search?q=%20',
    ]) {
      const res = await GET(new Request(url));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(EMPTY_SEARCH_RESULT);
    }
    expect(searchFn).not.toHaveBeenCalled();
  });

  it('400s on an over-long query instead of running it', async () => {
    const res = await GET(new Request(`http://x/api/v1/search?q=${'a'.repeat(101)}`));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_params');
    expect(searchFn).not.toHaveBeenCalled();
  });

  it('uses a short cache TTL, unlike the immutable routes', async () => {
    const res = await GET(new Request('http://x/api/v1/search?q=kitab'));
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
  });
});
```

`apps/web/src/test/v1-concordance.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { v1 } from '@quran-corpus/api-contract';

// Typed with the real call signatures (db, bw, opts?) so `.mock.calls[n][2]`
// type-checks below -- an untyped `vi.fn(async () => [])` infers a 0-arg
// mock and TS rejects indexing a 3rd call argument.
const getRootConcordancePage = vi.fn(async (_db: unknown, _bw: string, _opts?: unknown) => []);
const countRootConcordance = vi.fn(async (_db: unknown, _bw: string, _formIds?: number[]) => 0);

vi.mock('@quran-corpus/data', () => ({ getRootConcordancePage, countRootConcordance }));
vi.mock('../lib/db', () => ({ getDatabase: vi.fn(async () => ({})) }));

const { GET } = await import('../app/api/v1/roots/[root]/concordance/route');

function call(url: string, root = 'ktb') {
  return GET(new Request(url), { params: Promise.resolve({ root }) });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/roots/{bw}/concordance', () => {
  it('returns the paged envelope with items, not entries', async () => {
    countRootConcordance.mockResolvedValueOnce(319);
    const res = await call('http://x/api/v1/roots/ktb/concordance');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(v1.PagedConcordanceDTO.parse(body)).toEqual(body);
    expect(body).not.toHaveProperty('entries');
    expect(body.total).toBe(319);
    expect(body.limit).toBe(20);
    expect(body.offset).toBe(0);
  });

  it('parses forms= into formIds passed to both queries', async () => {
    await call('http://x/api/v1/roots/ktb/concordance?forms=3,7,12');
    expect(getRootConcordancePage).toHaveBeenCalledWith(
      expect.anything(),
      'ktb',
      expect.objectContaining({ formIds: [3, 7, 12] }),
    );
    expect(countRootConcordance).toHaveBeenCalledWith(expect.anything(), 'ktb', [3, 7, 12]);
  });

  it('omits formIds entirely when forms= is absent', async () => {
    await call('http://x/api/v1/roots/ktb/concordance');
    expect(getRootConcordancePage.mock.calls.at(-1)![2]).not.toHaveProperty('formIds');
    expect(countRootConcordance.mock.calls.at(-1)![2]).toBeUndefined();
  });

  it('drops non-numeric junk from forms= instead of erroring', async () => {
    const res = await call('http://x/api/v1/roots/ktb/concordance?forms=3,abc,7');
    expect(res.status).toBe(200);
    expect(getRootConcordancePage.mock.calls.at(-1)![2]).toMatchObject({ formIds: [3, 7] });
  });

  it('empty forms= (no valid ids) behaves like no filter', async () => {
    await call('http://x/api/v1/roots/ktb/concordance?forms=abc,def');
    expect(getRootConcordancePage.mock.calls.at(-1)![2]).not.toHaveProperty('formIds');
  });

  it('rejects an oversized forms= list with 400 instead of silently truncating it', async () => {
    const oversized = Array.from({ length: 500 }, (_, i) => i + 1).join(',');
    const res = await call(`http://x/api/v1/roots/ktb/concordance?forms=${oversized}`);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_params');
    // Never reaches the DB layer with a silently-scoped-down filter.
    expect(getRootConcordancePage).not.toHaveBeenCalled();
  });

  it('caps limit at 50, below the global ceiling of 100', async () => {
    const res = await call('http://x/api/v1/roots/ktb/concordance?limit=100');
    expect((await res.json()).limit).toBe(50);
    expect(getRootConcordancePage.mock.calls.at(-1)![2]).toMatchObject({ limit: 50 });
  });

  it('caps offset at MAX_OFFSET -- an unbounded offset makes SQLite walk and discard', async () => {
    const res = await call('http://x/api/v1/roots/ktb/concordance?offset=99999999');
    expect((await res.json()).offset).toBe(v1.MAX_OFFSET);
    expect(getRootConcordancePage.mock.calls.at(-1)![2]).toMatchObject({ offset: v1.MAX_OFFSET });
  });

  it('400s on a junk root path without touching the DB', async () => {
    const res = await call('http://x/api/v1/roots/x/concordance', '../etc');
    expect(res.status).toBe(400);
    expect(getRootConcordancePage).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @quran-corpus/web test src/test/v1-surahs.test.ts src/test/v1-search.test.ts src/test/v1-concordance.test.ts`

Expected: FAIL — unresolved route imports.

- [ ] **Step 3: Write `apps/web/src/app/api/v1/surahs/route.ts`**

```ts
import { getAllSurahs } from '@quran-corpus/data';
import { getDatabase } from '../../../../lib/db';
import { handle, json } from '../_lib/respond';
import { toSurah } from '../_lib/map';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return handle(async () => {
    const db = await getDatabase();
    return json((await getAllSurahs(db)).map(toSurah));
  });
}
```

- [ ] **Step 4: Write `apps/web/src/app/api/v1/search/route.ts`**

```ts
import { search, EMPTY_SEARCH_RESULT } from '@quran-corpus/data';
import { v1 } from '@quran-corpus/api-contract';
import { getDatabase } from '../../../../lib/db';
import { ApiError, handle, json } from '../_lib/respond';
import { toSearchResult } from '../_lib/map';

export const dynamic = 'force-dynamic';

/** Short TTL: the query space is unbounded, so a long edge TTL here is a
 *  cache-fill vector rather than a win. */
const SEARCH_MAX_AGE = 60;

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const q = (new URL(request.url).searchParams.get('q') ?? '').trim();
    // An empty query is the resting state of a search box, not a client error.
    if (q.length === 0) return json(EMPTY_SEARCH_RESULT, SEARCH_MAX_AGE);
    if (!v1.SearchQueryParam.safeParse(q).success) {
      throw new ApiError('invalid_params', 'q must be between 1 and 100 characters.');
    }
    const db = await getDatabase();
    return json(toSearchResult(await search(db, q)), SEARCH_MAX_AGE);
  });
}
```

Behaviour change from the route this replaces: an over-long `q` now returns 400 rather than a 200 carrying the empty result. A silent empty result for a malformed request is indistinguishable from "no matches", which is the wrong signal.

- [ ] **Step 5: Write `apps/web/src/app/api/v1/roots/[root]/concordance/route.ts`**

```ts
import { getRootConcordancePage, countRootConcordance } from '@quran-corpus/data';
import { v1 } from '@quran-corpus/api-contract';
import { getDatabase } from '../../../../../../lib/db';
import { ApiError, handle, json } from '../../../_lib/respond';
import { clampInt, parseFormIds, FormIdLimitError, parseRootBw } from '../../../_lib/params';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ root: string }> },
): Promise<Response> {
  return handle(async () => {
    const bw = parseRootBw((await params).root);
    const sp = new URL(request.url).searchParams;
    // Concordance rows carry rebuilt verse text, so this caps below the global
    // ceiling. MAX_LIMIT is a ceiling, not a replacement for a tighter cap.
    const limit = clampInt(sp.get('limit'), v1.DEFAULT_LIMIT, 1, v1.CONCORDANCE_MAX_LIMIT);
    // Was Number.MAX_SAFE_INTEGER. An unbounded offset makes SQLite walk the
    // whole result set and discard it, on the corpus's most expensive query.
    const offset = clampInt(sp.get('offset'), 0, 0, v1.MAX_OFFSET);

    let formIds: number[] | undefined;
    try {
      formIds = parseFormIds(sp.get('forms'));
    } catch (e) {
      if (e instanceof FormIdLimitError) {
        throw new ApiError('invalid_params', `forms accepts at most ${v1.MAX_FORM_IDS} ids.`);
      }
      throw e;
    }

    const db = await getDatabase();
    const [items, total] = await Promise.all([
      getRootConcordancePage(db, bw, { limit, offset, ...(formIds ? { formIds } : {}) }),
      countRootConcordance(db, bw, formIds),
    ]);
    return json({ items, total, limit, offset });
  });
}
```

`getRootConcordancePage` already returns `ConcordanceEntry[]` in the exact DTO shape, so no mapper is needed here — the schema assertion in the test is what guards that.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @quran-corpus/web test src/test/v1-surahs.test.ts src/test/v1-search.test.ts src/test/v1-concordance.test.ts`

Expected: PASS.

- [ ] **Step 7: Type-check and lint**

Run: `pnpm --filter @quran-corpus/web type-check && pnpm --filter @quran-corpus/web lint`

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/api/v1/surahs apps/web/src/app/api/v1/search apps/web/src/app/api/v1/roots apps/web/src/test/v1-surahs.test.ts apps/web/src/test/v1-search.test.ts apps/web/src/test/v1-concordance.test.ts
git commit -m "feat(web/api-v1): add the surahs, search and concordance routes"
```

---

## Task 4: Migrate the callers and delete the legacy routes

**Files:**
- Modify: `apps/web/src/components/search/SearchSheet.tsx`
- Modify: `apps/web/src/components/dictionary/ConcordanceList.tsx`
- Modify: `apps/web/src/test/SearchSheet.test.tsx`
- Modify: `apps/web/src/test/ConcordanceList.test.tsx`
- Delete: `apps/web/src/app/api/search/route.ts`
- Delete: `apps/web/src/app/api/surahs/route.ts`
- Delete: `apps/web/src/app/api/roots/[root]/concordance/route.ts` (and the now-empty `apps/web/src/app/api/roots/` tree)
- Delete: `apps/web/src/test/api-surahs.test.ts`, `apps/web/src/test/searchApi.test.ts`, `apps/web/src/test/concordanceRoute.test.ts`

**Interfaces:**
- Consumes: the three v1 routes from Task 3.
- Produces: no unversioned API routes remain under `apps/web/src/app/api/` — only the `v1/` tree.

Clean cut, no redirect shims (spec D5). Old paths are deleted in the same commit that repoints their callers, so a revert restores both together.

- [ ] **Step 1: Repoint `SearchSheet.tsx`**

Two `fetch` calls change. The surah fetch also changes shape: `/api/v1/surahs` returns `SurahDTO`, so the component derives its own `PickerSurah` with the mapper that already sits beside the type.

Extend the existing import from `../wbw/types` to bring in the mapper:

```ts
import { toPickerSurah, type PickerSurah } from '../wbw/types';
```

Add the wire type. **`import type`, not a value import** — that erases at build time, so zod never reaches the browser bundle. A value import here would repeat the client-barrel poison incident in a new package:

```ts
import type { v1 } from '@quran-corpus/api-contract';
```

Change the surah fetch (currently around line 23):

```ts
        const res = await fetch('/api/v1/surahs', { signal: ctrl.signal });
        if (!res.ok) return;
        // v1 returns neutral SurahDTOs; the picker's shape is a web concern
        // and is derived here rather than frozen into the URL.
        const data = (await res.json()) as v1.SurahDTO[];
        setSurahs(data.map(toPickerSurah));
```

Change the search fetch (currently around line 46):

```ts
        const res = await fetch(`/api/v1/search?q=${encodeURIComponent(term)}`, {
          signal: ctrl.signal,
        });
```

If `toPickerSurah`'s parameter type is the `packages/data` `Surah` and TypeScript rejects a `v1.SurahDTO` argument, do **not** widen the mapper or cast: the two shapes are field-identical, so a mismatch means one of them drifted. Reconcile the drift.

- [ ] **Step 2: Repoint `ConcordanceList.tsx`**

Change `buildUrl` (currently around line 106):

```ts
  function buildUrl(offset: number, formIds: number[]): string {
    const base = `/api/v1/roots/${encodeURIComponent(rootBw)}/concordance?offset=${offset}&limit=${PAGE}`;
    return formIds.length > 0 ? `${base}&forms=${formIds.join(',')}` : base;
  }
```

and the response destructuring below it, where `entries` becomes `items`:

```ts
      const data = (await res.json()) as { items: ConcordanceEntry[]; total: number };
```

Then update every use of `data.entries` in the lines that follow to `data.items`. Do not rename the component's own `entries` state variable — only the wire field changed.

- [ ] **Step 3: Update the two component tests**

In `apps/web/src/test/SearchSheet.test.tsx` and `apps/web/src/test/ConcordanceList.test.tsx`, update the mocked fetch URLs and payloads:

- any `'/api/surahs'` → `'/api/v1/surahs'`, and its stub payload becomes full `SurahDTO` objects (`id`, `name_arabic`, `name_translit`, `name_translation`, `revelation_type`, `ayah_count`, `order_number`) rather than the three-field `PickerSurah` subset;
- any `'/api/search'` → `'/api/v1/search'`;
- any `/api/roots/…/concordance` → `/api/v1/roots/…/concordance`, and any stub body `{ entries: [...], total: n }` → `{ items: [...], total: n, limit: 20, offset: 0 }`.

Assertions about rendered output must not change. If one has to, the refactor changed user-visible behaviour and the component is wrong, not the test.

- [ ] **Step 4: Run the two component tests to verify they pass**

Run: `pnpm --filter @quran-corpus/web test src/test/SearchSheet.test.tsx src/test/ConcordanceList.test.tsx`

Expected: PASS.

- [ ] **Step 5: Delete the legacy routes and their tests**

```bash
git rm apps/web/src/app/api/search/route.ts \
       apps/web/src/app/api/surahs/route.ts \
       apps/web/src/app/api/roots/\[root\]/concordance/route.ts \
       apps/web/src/test/api-surahs.test.ts \
       apps/web/src/test/searchApi.test.ts \
       apps/web/src/test/concordanceRoute.test.ts
```

Their coverage now lives in `v1-surahs.test.ts`, `v1-search.test.ts` and `v1-concordance.test.ts`.

- [ ] **Step 6: Verify no reference to an unversioned API path survives**

Run: `grep -rn "'/api/\(search\|surahs\|roots\)" apps/web/src || echo "clean"`

Expected: `clean`. Anything printed is a caller this task missed — fix it before continuing.

Run: `ls apps/web/src/app/api`

Expected: `v1` only. Remove any empty directories left behind by the deletions.

- [ ] **Step 7: Run the whole suite**

Run: `pnpm test`

Expected: PASS across all three packages — `packages/data` (176, untouched by this plan), `packages/api-contract` (Task 1), and `apps/web` (403 pre-existing minus the 3 deleted route test files, plus the six new v1 test files).

- [ ] **Step 8: Type-check, lint, and build**

**Before running `pnpm build`, stop any `next dev` server.** `next dev` and `next build` share `apps/web/.next`; building over a running dev server corrupts it, producing CSS 404s and `MODULE_NOT_FOUND` at runtime. Recovery is: kill dev, `rm -rf apps/web/.next`, restart.

Run: `pnpm type-check && pnpm lint && pnpm build`

Expected: no errors.

- [ ] **Step 9: Verify zod did not land in the client bundle**

Run: `grep -rl "ZodError" apps/web/.next/static/chunks 2>/dev/null || echo "clean"`

Expected: `clean`. A hit means Step 1's `import type` became a value import somewhere and the contract package is now shipping to browsers.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "refactor(web): move the three unversioned API routes to /api/v1

Callers move in the same commit as the routes they call, so a revert
restores both together. /api/v1/surahs returns a neutral SurahDTO rather
than PickerSurah -- a web component's private type is no longer frozen into
a URL -- and the concordance body is the standard paged envelope, so
`entries` becomes `items`.

Also caps the concordance `offset`, which was Number.MAX_SAFE_INTEGER: an
unbounded offset makes SQLite walk and discard the whole result set on the
corpus's most expensive query.

No redirect shims: the only consumers are in this repo (spec D5)."
```

---

## Done criteria

- Three `GET` routes live under `/api/v1`; no unversioned API routes remain.
- `pnpm test`, `pnpm lint`, `pnpm type-check`, `pnpm build` all pass.
- `packages/api-contract` imports nothing from `packages/data` — enforced by `tests/purity.test.ts`, not by convention.
- zod is absent from the client bundle (Task 4 Step 9).
- Every route's response parses against its own zod schema in a test.
- The concordance `offset` is capped.
- The 6-step loop (CLAUDE.md §4) applies to the branch as a whole: self-review, then `/code-review` (user-triggered — stop and ask), then lint/type/test, then CodeRabbit, then a final re-review before merge.

## Required before this is exposed — not a code change

The three routes are **live and unauthenticated today**, before this plan runs. That is a standing gap, not one this plan introduces, and the plan does not close it.

Add a Cloudflare rate-limiting rule on `/api/*` before the repo goes public (already blocked on the GitHub Support GC, so there is time). Concordance is the endpoint that matters — it rebuilds verse text per row, so it is the cheapest way to make the homelab work hard from outside.

Application-level caps (`CONCORDANCE_MAX_LIMIT`, `MAX_OFFSET`, `MAX_FORM_IDS`) bound the cost of a *single* request. They do nothing about request *volume*. Only the edge does that.

## Deferred, and why

- **The other nine routes from the spec.** No consumer. Additive under D7 — adding any later needs no version bump and no v2. Build them when something calls them.
- **A DB update/sync endpoint (spec D12).** This is the one genuinely server-shaped problem in the project: `quran.db` is **134 MB live**, and a mobile app that bundles it freezes the corpus at ship time — every later fix (hamza seats, the 930-root re-scrape, `grammar_note`) is stranded until an app-store update. Decide bundle-vs-sync with real numbers when `apps/mobile` starts; that decision determines which endpoints are actually needed, and it may well be these three plus a manifest rather than a full read API.
