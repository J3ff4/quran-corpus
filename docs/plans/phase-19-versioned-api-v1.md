# Versioned API v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a read-only, versioned HTTP API at `/api/v1` backed by `packages/data`, with its wire contract owned by a new `packages/api-contract`.

**Architecture:** Zod schemas in `packages/api-contract` are the single artifact — types come from `z.infer`, so validation and types cannot drift. `apps/web` route handlers under `app/api/v1/` are adapters only: parse → validate → call one query → map row to DTO → respond. `packages/api-contract` imports nothing from `packages/data`, so `apps/mobile` can consume types without dragging `@libsql/client` into its bundle.

**Tech Stack:** TypeScript (NodeNext, `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`), Next.js 15 App Router route handlers, zod, vitest, pnpm workspaces + turbo.

Source spec: `docs/superpowers/specs/2026-07-29-versioned-api-v1-design.md`.

## Global Constraints

- **`packages/api-contract` imports nothing from `packages/data`.** No `import` of `@quran-corpus/data`, `@libsql/client`, `node:*`, or any Next.js module, in any file under `packages/api-contract/src/`. Task 1 adds a test that enforces this.
- **Only one new runtime dependency: `zod`, pinned `^3.23.8`, and only in `packages/api-contract`.** Do not add it to `apps/web` or `packages/data`. Do not upgrade to zod v4 in this phase — every schema here is written against the v3 API, and v3 already strips unknown keys by default, which is what the forward-compatibility guarantee rests on.
- **All twelve routes are `GET` and read-only.** No POST/PUT/PATCH/DELETE handlers anywhere under `app/api/v1/`.
- **Every v1 route file declares `export const dynamic = 'force-dynamic';`** — these read a DB and must never be prerendered at build.
- **Error body is always** `{ "error": <code>, "message": <string> }` with `error` ∈ `'invalid_params'` (400) | `'not_found'` (404) | `'internal'` (500). No other codes, no other body shape, no 401/403 — unauthenticated is the design.
- **Errors never echo raw input back, and never carry a DB error message or stack.** Server-side `console.error` for the detail; the client gets the code plus fixed prose.
- **No CORS headers anywhere.** Deliberate: a native client does not need them and web is same-origin.
- **`Cache-Control: public, max-age=86400`** on every route except `/api/v1/search`, which gets `public, max-age=60`.
- **The Buckwalter root pattern is exactly** `/^[A-Za-z'`><{}|&*$~]{1,12}$/` — copied verbatim from the route being replaced. Do not "improve" it.
- **Concordance keeps its own tighter caps:** `MAX_LIMIT = 50` and `MAX_FORM_IDS = 50`, and an oversized `forms=` list returns 400 rather than being silently truncated. The global `MAX_LIMIT = 100` is a ceiling, not a replacement.
- **No `// @ts-ignore`, no disabled lint rules without an inline justification comment** (CLAUDE.md §4).
- **Conventional Commits** on every commit: `type(scope): subject` (CLAUDE.md §9).

## Spec corrections carried into this plan

The spec was approved before the backing query signatures were read. Four points are resolved here; each is a deliberate ruling, not a gap.

1. **`/search` takes no `limit`/`offset`.** `search(db, q)` returns a composite `{ jump, verses, roots }`, internally capped (verses 50, roots 100) with no offset. It is not a paginated collection, so §5's envelope does not apply. Route is `/api/v1/search?q=` only.
2. **`/translations` requires `surah` as well as `lang`.** Its backing query is `getTranslationsBySurahAndLang(db, surahId, languageCode)`. Route is `/api/v1/translations?surah=&lang=`, both required.
3. **The concordance response shape does change.** §9's "none" refers to *params*. The body goes from `{ entries, total }` to `{ items, total, limit, offset }` per §5. `ConcordanceList.tsx` is updated in Task 10.
4. **Three queries do not exist and are added to `packages/data` in Task 3.** `getAyahByLocation` (nothing maps surah:ayah → `ayahs.id`; `getAyahWithWords` takes the PK), `getGlossForWord` (`getGlossesWithFallback` is surah-scoped — using it for one word reads a whole surah), and `getLanguages` (§6 requires `lang` validated against the DB, and no query reads the `languages` table).

**DTO field policy.** DTOs keep primary keys. `root_forms.id` is load-bearing (the `forms=` filter), `words.id` / `word_id` is load-bearing (`trimConcordanceVerse`), and `roots.id` is a live React key. Mappers drop only foreign keys and raw source blobs: `ayah_id`, `root_id`, `morphology_json`, `grammar_arabic` (known-garbled, superseded by `grammar_note`), and `ayahs.audio_url` (superseded by `/api/v1/audio`).

**Naming policy.** DTOs keep the DB's snake_case location names — `surah_id`, `ayah_number`, `position` — because that is already the live wire format for concordance and search. Do not rename to `surah`/`ayah`.

---

## File Structure

**Created — `packages/api-contract/`**

| File | Responsibility |
|---|---|
| `package.json` | `@quran-corpus/api-contract`, `type: module`, zod dep, build/test scripts |
| `tsconfig.json` | extends `@quran-corpus/config/tsconfig/base`, `outDir: dist`, `rootDir: src` |
| `vitest.config.ts` | node environment, `globals: false` |
| `src/index.ts` | `export * as v1 from './v1/index.js'` |
| `src/v1/index.ts` | namespace barrel re-exporting the seven resource modules + common |
| `src/v1/common.ts` | error body, codes, caps, `paged()`, shared param schemas |
| `src/v1/surahs.ts` | `SurahDTO` |
| `src/v1/ayahs.ts` | `AyahDTO`, `AyahWithWordsDTO` |
| `src/v1/words.ts` | `WordDTO`, `WordSegmentDTO`, `ConceptTagDTO`, `WordDetailDTO` |
| `src/v1/roots.ts` | `RootDTO`, `RootFormDTO`, `RootDefinitionDTO`, `RootEntryDTO`, `VerseWordDTO`, `ConcordanceEntryDTO` |
| `src/v1/search.ts` | `VerseHitDTO`, `JumpVerseDTO`, `SearchResultDTO` |
| `src/v1/translations.ts` | `TranslationDTO`, `LanguageDTO` |
| `src/v1/audio.ts` | `AudioDTO`, `RECITER_IDS` |
| `tests/common.test.ts` | param-schema bounds, error body, `paged()` |
| `tests/purity.test.ts` | enforces the no-`packages/data` / no-node import constraint |
| `tests/schemas.test.ts` | every resource schema parses a valid fixture and rejects a broken one |

**Created — `apps/web/src/app/api/v1/`**

| File | Responsibility |
|---|---|
| `_lib/params.ts` | string → value parsing: `clampInt`, `parseFormIds`, `parseAyahRef`, `parseWordRef`, `parseSurahId`, `parseRootBw` |
| `_lib/lang.ts` | `parseLang` — the one parser that needs a DB read, kept out of `params.ts` so that module stays free of `@quran-corpus/data` |
| `_lib/respond.ts` | `ApiError`, `json()`, `fail()`, `handle()` |
| `_lib/map.ts` | `packages/data` row types → v1 DTOs (the only place this conversion happens) |
| `surahs/route.ts` … `audio/[ref]/route.ts` | one thin handler each, twelve total |

**Created — other**

- `apps/web/src/lib/reciters.ts` — reciter registry + `buildAudioUrl`, shared by the API route and `useAyahAudio`.

**Modified**

- `packages/data/src/queries/ayahs.ts` — add `getAyahByLocation`
- `packages/data/src/queries/glosses.ts` — add `getGlossForWord`
- `packages/data/src/queries/languages.ts` — **created**, `getLanguages`
- `packages/data/src/index.ts` — export the three
- `apps/web/package.json` — add `@quran-corpus/api-contract` dep
- `apps/web/src/hooks/useAyahAudio.ts` — use the shared registry
- `apps/web/src/components/search/SearchSheet.tsx` — two fetch URLs
- `apps/web/src/components/dictionary/ConcordanceList.tsx` — URL + `entries` → `items`

**Deleted (Task 10)**

- `apps/web/src/app/api/search/route.ts`, `apps/web/src/app/api/surahs/route.ts`, `apps/web/src/app/api/roots/[root]/concordance/route.ts`
- `apps/web/src/test/api-surahs.test.ts`, `searchApi.test.ts`, `concordanceRoute.test.ts` (ported to v1 equivalents in Tasks 5/7/8)

---

## Task 1: Scaffold `packages/api-contract` with common schemas

**Files:**
- Create: `packages/api-contract/package.json`
- Create: `packages/api-contract/tsconfig.json`
- Create: `packages/api-contract/vitest.config.ts`
- Create: `packages/api-contract/src/index.ts`
- Create: `packages/api-contract/src/v1/index.ts`
- Create: `packages/api-contract/src/v1/common.ts`
- Test: `packages/api-contract/tests/common.test.ts`
- Test: `packages/api-contract/tests/purity.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: from `src/v1/common.ts` — `ApiErrorCode` (union type), `API_ERROR_CODES` (readonly tuple), `ErrorBody` (schema + type), `DEFAULT_LIMIT = 20`, `MAX_LIMIT = 100`, `MAX_OFFSET = 100000`, `CONCORDANCE_MAX_LIMIT = 50`, `MAX_FORM_IDS = 50`, `BUCKWALTER_PATTERN` (RegExp), `paged<T>(item: T)`, and param schemas `SurahIdParam`, `AyahNumberParam`, `WordPositionParam`, `RootBwParam`, `LangParam`, `SearchQueryParam`, `LimitParam`, `OffsetParam`.

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

Note: no `"types": ["node"]` in tsconfig — the package must not use node built-ins, and omitting the types makes that a compile error rather than a convention.

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
  CONCORDANCE_MAX_LIMIT,
  MAX_FORM_IDS,
  BUCKWALTER_PATTERN,
  paged,
  SurahIdParam,
  AyahNumberParam,
  WordPositionParam,
  RootBwParam,
  LangParam,
  SearchQueryParam,
} from '../src/v1/common.js';

describe('common caps', () => {
  it('pins the documented numeric caps', () => {
    expect(DEFAULT_LIMIT).toBe(20);
    expect(MAX_LIMIT).toBe(100);
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
    const out = s.parse({ items: [{ id: 1, futureField: 'x' }], total: 1, limit: 20, offset: 0, nextCursor: 'y' });
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

  it('bounds ayah to 1..286 (the longest surah; per-surah bound is a handler check)', () => {
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

  it('accepts language codes and rejects junk', () => {
    expect(LangParam.safeParse('en').success).toBe(true);
    expect(LangParam.safeParse('uz').success).toBe(true);
    expect(LangParam.safeParse('EN').success).toBe(false);
    expect(LangParam.safeParse('english').success).toBe(false);
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

// This package is imported by apps/mobile. If anything here reaches into
// @quran-corpus/data, mobile drags @libsql/client into its bundle -- the same
// failure the @quran-corpus/data/client split already exists to prevent.
// Node built-ins are banned too: React Native has no node core.
const BANNED = [
  '@quran-corpus/data',
  '@libsql/client',
  'next/',
  'node:',
];

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
/** An uncapped offset makes SQLite scan the whole table to throw the rows away. */
export const MAX_OFFSET = 100_000;

/** Concordance rows carry rebuilt verse text, so they cost far more per row. */
export const CONCORDANCE_MAX_LIMIT = 50;
/** The largest root (qwm) has 22 derived forms; 50 gives headroom while staying
 *  far below SQLite's bind-variable ceiling. */
export const MAX_FORM_IDS = 50;

/** Buckwalter root alphabet: ASCII letters plus the hamza/madda/wasla symbols.
 *  Parametrized queries make injection a non-issue; this rejects junk paths early. */
export const BUCKWALTER_PATTERN = /^[A-Za-z'`><{}|&*$~]{1,12}$/;

/** The one envelope in v1. Bare arrays elsewhere -- `total` has nowhere else to live. */
export function paged<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  });
}

export const SurahIdParam = z.number().int().min(1).max(114);
/** 286 is Al-Baqarah, the longest surah. The real per-surah bound needs
 *  surahs.ayah_count and is checked in the handler, which 404s past the end. */
export const AyahNumberParam = z.number().int().min(1).max(286);
export const WordPositionParam = z.number().int().min(1);
export const RootBwParam = z.string().regex(BUCKWALTER_PATTERN);
/** ISO-639-1 plus an optional subtag. Existence in the DB is a handler check. */
export const LangParam = z.string().regex(/^[a-z]{2}(-[A-Za-z]{2,8})?$/);
export const SearchQueryParam = z.string().min(1).max(100);

/** Documents the contract's bound. Query strings are parsed and clamped by
 *  apps/web's _lib/params.ts (junk clamps to the default rather than 400ing,
 *  preserving the behaviour of the routes being replaced). */
export const LimitParam = z.number().int().min(1).max(MAX_LIMIT);
export const OffsetParam = z.number().int().min(0).max(MAX_OFFSET);
```

- [ ] **Step 7: Write the barrels**

`packages/api-contract/src/v1/index.ts`:

```ts
export * from './common.js';
```

`packages/api-contract/src/index.ts`:

```ts
export * as v1 from './v1/index.js';
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm --filter @quran-corpus/api-contract test`

Expected: PASS, all tests green.

- [ ] **Step 9: Verify it builds and type-checks**

Run: `pnpm --filter @quran-corpus/api-contract build && pnpm --filter @quran-corpus/api-contract type-check`

Expected: `dist/index.js` and `dist/index.d.ts` exist, no type errors.

- [ ] **Step 10: Commit**

```bash
git add packages/api-contract pnpm-lock.yaml
git commit -m "feat(api-contract): scaffold the v1 contract package with common schemas"
```

---

## Task 2: Resource schemas

**Files:**
- Create: `packages/api-contract/src/v1/surahs.ts`
- Create: `packages/api-contract/src/v1/ayahs.ts`
- Create: `packages/api-contract/src/v1/words.ts`
- Create: `packages/api-contract/src/v1/roots.ts`
- Create: `packages/api-contract/src/v1/search.ts`
- Create: `packages/api-contract/src/v1/translations.ts`
- Create: `packages/api-contract/src/v1/audio.ts`
- Modify: `packages/api-contract/src/v1/index.ts`
- Test: `packages/api-contract/tests/schemas.test.ts`

**Interfaces:**
- Consumes: `paged`, `SurahIdParam`, `AyahNumberParam`, `WordPositionParam` from `./common.js` (Task 1).
- Produces: schemas + inferred types, all exported from the `v1` namespace —
  `SurahDTO`, `AyahDTO`, `AyahWithWordsDTO`, `WordDTO`, `WordSegmentDTO`, `ConceptTagDTO`, `WordDetailDTO`, `RootDTO`, `RootFormDTO`, `RootDefinitionDTO`, `RootEntryDTO`, `VerseWordDTO`, `ConcordanceEntryDTO`, `PagedConcordanceDTO`, `PagedRootsDTO`, `VerseHitDTO`, `JumpVerseDTO`, `SearchResultDTO`, `TranslationDTO`, `LanguageDTO`, `AudioDTO`, `RECITER_IDS`.

Each schema is exported twice under one name — zod's value and `z.infer`'s type — using the `export const X = …; export type X = z.infer<typeof X>;` pattern already used for `ErrorBody` in Task 1.

- [ ] **Step 1: Write the failing test**

`packages/api-contract/tests/schemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SurahDTO } from '../src/v1/surahs.js';
import { AyahDTO, AyahWithWordsDTO } from '../src/v1/ayahs.js';
import { WordDTO, WordSegmentDTO, WordDetailDTO } from '../src/v1/words.js';
import { RootDTO, RootFormDTO, RootEntryDTO, ConcordanceEntryDTO } from '../src/v1/roots.js';
import { SearchResultDTO } from '../src/v1/search.js';
import { TranslationDTO, LanguageDTO } from '../src/v1/translations.js';
import { AudioDTO, RECITER_IDS } from '../src/v1/audio.js';

const surah = {
  id: 1,
  name_arabic: 'الفاتحة',
  name_translit: 'Al-Fatihah',
  name_translation: 'The Opening',
  revelation_type: 'meccan',
  ayah_count: 7,
  order_number: 1,
};

const ayah = {
  id: 1,
  surah_id: 1,
  ayah_number: 1,
  text_uthmani: 'بِسْمِ ٱللَّهِ',
  text_simple: 'بسم الله',
  juz: 1,
  page: 1,
};

const word = {
  id: 1,
  position: 1,
  text_arabic: 'بِسْمِ',
  transliteration: "bis'mi",
  root: 'سمو',
  lemma: 'ٱسْم',
  root_buckwalter: 'smw',
  lemma_buckwalter: 'Ism',
  pos_tag: 'N',
  morphology_description: 'genitive masculine noun',
  grammar_note: null,
};

const segment = {
  id: 1,
  segment_index: 0,
  segment_type: 'prefix',
  pos_tag: 'P',
  form_arabic: 'بِ',
  form_buckwalter: 'bi',
  features_json: null,
  lemma: null,
  root: null,
};

describe('SurahDTO', () => {
  it('accepts a surah row', () => {
    expect(SurahDTO.safeParse(surah).success).toBe(true);
  });

  it('rejects an unknown revelation_type', () => {
    expect(SurahDTO.safeParse({ ...surah, revelation_type: 'martian' }).success).toBe(false);
  });
});

describe('AyahDTO', () => {
  it('accepts an ayah with nullable juz/page/text_simple', () => {
    expect(AyahDTO.safeParse({ ...ayah, text_simple: null, juz: null, page: null }).success).toBe(true);
  });

  it('drops audio_url -- /api/v1/audio owns that now', () => {
    const out = AyahDTO.parse({ ...ayah, audio_url: 'https://example.test/1.mp3' });
    expect(out).not.toHaveProperty('audio_url');
  });

  it('composes with words', () => {
    expect(AyahWithWordsDTO.safeParse({ ayah, words: [word] }).success).toBe(true);
  });
});

describe('WordDTO', () => {
  it('accepts a word row', () => {
    expect(WordDTO.safeParse(word).success).toBe(true);
  });

  it('drops ayah_id, morphology_json and grammar_arabic', () => {
    const out = WordDTO.parse({
      ...word,
      ayah_id: 9,
      morphology_json: '{"raw":1}',
      grammar_arabic: 'garbled',
    });
    expect(out).not.toHaveProperty('ayah_id');
    expect(out).not.toHaveProperty('morphology_json');
    expect(out).not.toHaveProperty('grammar_arabic');
  });
});

describe('WordDetailDTO', () => {
  it('accepts word + segments + tags + gloss', () => {
    expect(
      WordDetailDTO.safeParse({
        word,
        segments: [segment],
        concept_tags: [{ id: 1, tag_label: 'mercy', tag_type: 'concept' }],
        gloss: { gloss_text: 'In (the) name', gloss_lang: 'en' },
      }).success,
    ).toBe(true);
  });

  it('accepts a null gloss', () => {
    expect(
      WordDetailDTO.safeParse({ word, segments: [], concept_tags: [], gloss: null }).success,
    ).toBe(true);
  });

  it('drops word_id from a segment', () => {
    const out = WordSegmentDTO.parse({ ...segment, word_id: 7 });
    expect(out).not.toHaveProperty('word_id');
  });
});

describe('RootDTO and friends', () => {
  it('accepts a root', () => {
    expect(
      RootDTO.safeParse({ id: 1, root_buckwalter: 'ktb', root_arabic: 'كتب', occurrence_count: 319 })
        .success,
    ).toBe(true);
  });

  it('keeps root_forms.id -- the forms= filter needs it -- but drops root_id', () => {
    const out = RootFormDTO.parse({
      id: 3,
      root_id: 1,
      sort_order: 1,
      pos_label: 'verb',
      form_arabic: 'كَتَبَ',
      form_translit: 'kataba',
      gloss: 'to write',
      occurrence_count: 40,
    });
    expect(out.id).toBe(3);
    expect(out).not.toHaveProperty('root_id');
  });

  it('accepts a full root entry', () => {
    expect(
      RootEntryDTO.safeParse({
        root: { id: 1, root_buckwalter: 'ktb', root_arabic: 'كتب', occurrence_count: 319 },
        forms: [],
        definitions: [{ source: "Lane's Lexicon", definition: 'he wrote' }],
      }).success,
    ).toBe(true);
  });

  it('accepts a concordance entry with optional starts_clause on verse words', () => {
    expect(
      ConcordanceEntryDTO.safeParse({
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
      }).success,
    ).toBe(true);
  });

  it('accepts form_id null -- a data gap, not an error', () => {
    expect(
      ConcordanceEntryDTO.safeParse({
        surah_id: 2,
        ayah_number: 2,
        position: 3,
        word_id: 40,
        text_arabic: 'ٱلْكِتَٰبُ',
        transliteration: null,
        gloss: null,
        verse_words: [],
        form_id: null,
      }).success,
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

describe('TranslationDTO / LanguageDTO', () => {
  it('carries ayah_number so a bulk surah fetch is addressable', () => {
    expect(
      TranslationDTO.safeParse({
        surah_id: 1,
        ayah_number: 1,
        language_code: 'en',
        translator: 'Saheeh International',
        text: 'In the name of Allah',
      }).success,
    ).toBe(true);
  });

  it('accepts a language row', () => {
    expect(
      LanguageDTO.safeParse({
        code: 'en',
        name_native: 'English',
        name_english: 'English',
        direction: 'ltr',
      }).success,
    ).toBe(true);
  });
});

describe('AudioDTO', () => {
  it('names the known reciters', () => {
    expect(RECITER_IDS).toContain('abdulbasit_murattal');
  });

  it('accepts a resolved audio url', () => {
    expect(
      AudioDTO.safeParse({
        surah_id: 1,
        ayah_number: 1,
        reciter: 'abdulbasit_murattal',
        url: 'https://everyayah.com/data/Abdul_Basit_Murattal_64kbps/001001.mp3',
      }).success,
    ).toBe(true);
  });

  it('rejects a non-url', () => {
    expect(
      AudioDTO.safeParse({
        surah_id: 1,
        ayah_number: 1,
        reciter: 'abdulbasit_murattal',
        url: 'not a url',
      }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @quran-corpus/api-contract test tests/schemas.test.ts`

Expected: FAIL — `Failed to resolve import "../src/v1/surahs.js"`.

- [ ] **Step 3: Write `src/v1/surahs.ts`**

```ts
import { z } from 'zod';
import { SurahIdParam } from './common.js';

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

- [ ] **Step 4: Write `src/v1/words.ts`**

Words come before ayahs because `AyahWithWordsDTO` composes `WordDTO`.

```ts
import { z } from 'zod';
import { WordPositionParam } from './common.js';

/** No ayah_id (foreign key), no morphology_json (raw scrape blob), no
 *  grammar_arabic (garbled at the source; grammar_note supersedes it). */
export const WordDTO = z.object({
  id: z.number().int().positive(),
  position: WordPositionParam,
  text_arabic: z.string(),
  transliteration: z.string().nullable(),
  root: z.string().nullable(),
  lemma: z.string().nullable(),
  root_buckwalter: z.string().nullable(),
  lemma_buckwalter: z.string().nullable(),
  pos_tag: z.string().nullable(),
  morphology_description: z.string().nullable(),
  grammar_note: z.string().nullable(),
});
export type WordDTO = z.infer<typeof WordDTO>;

export const WordSegmentDTO = z.object({
  id: z.number().int().positive(),
  segment_index: z.number().int().nonnegative(),
  segment_type: z.string().nullable(),
  pos_tag: z.string().nullable(),
  form_arabic: z.string().nullable(),
  form_buckwalter: z.string().nullable(),
  features_json: z.string().nullable(),
  lemma: z.string().nullable(),
  root: z.string().nullable(),
});
export type WordSegmentDTO = z.infer<typeof WordSegmentDTO>;

export const ConceptTagDTO = z.object({
  id: z.number().int().positive(),
  tag_label: z.string(),
  tag_type: z.string().nullable(),
});
export type ConceptTagDTO = z.infer<typeof ConceptTagDTO>;

export const GlossDTO = z.object({
  gloss_text: z.string(),
  /** Which language actually supplied the text -- may differ from the requested
   *  lang when the fallback chain kicked in. */
  gloss_lang: z.string(),
});
export type GlossDTO = z.infer<typeof GlossDTO>;

export const WordDetailDTO = z.object({
  word: WordDTO,
  segments: z.array(WordSegmentDTO),
  concept_tags: z.array(ConceptTagDTO),
  gloss: GlossDTO.nullable(),
});
export type WordDetailDTO = z.infer<typeof WordDetailDTO>;
```

- [ ] **Step 5: Write `src/v1/ayahs.ts`**

```ts
import { z } from 'zod';
import { AyahNumberParam, SurahIdParam } from './common.js';
import { WordDTO } from './words.js';

/** No audio_url: /api/v1/audio owns reciter resolution, and the column is empty
 *  on all 6236 rows anyway. */
export const AyahDTO = z.object({
  id: z.number().int().positive(),
  surah_id: SurahIdParam,
  ayah_number: AyahNumberParam,
  text_uthmani: z.string(),
  text_simple: z.string().nullable(),
  juz: z.number().int().nullable(),
  page: z.number().int().nullable(),
});
export type AyahDTO = z.infer<typeof AyahDTO>;

export const AyahWithWordsDTO = z.object({
  ayah: AyahDTO,
  words: z.array(WordDTO),
});
export type AyahWithWordsDTO = z.infer<typeof AyahWithWordsDTO>;
```

- [ ] **Step 6: Write `src/v1/roots.ts`**

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

/** `id` stays: it is the value the concordance `forms=` filter takes. `root_id`
 *  goes: the caller already knows which root it asked for. */
export const RootFormDTO = z.object({
  id: z.number().int().positive(),
  sort_order: z.number().int(),
  pos_label: z.string(),
  form_arabic: z.string().nullable(),
  form_translit: z.string().nullable(),
  gloss: z.string().nullable(),
  occurrence_count: z.number().int().nonnegative(),
});
export type RootFormDTO = z.infer<typeof RootFormDTO>;

export const RootDefinitionDTO = z.object({
  source: z.string(),
  definition: z.string(),
});
export type RootDefinitionDTO = z.infer<typeof RootDefinitionDTO>;

export const RootEntryDTO = z.object({
  root: RootDTO,
  forms: z.array(RootFormDTO),
  definitions: z.array(RootDefinitionDTO),
});
export type RootEntryDTO = z.infer<typeof RootEntryDTO>;

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

export const PagedRootsDTO = paged(RootDTO);
export type PagedRootsDTO = z.infer<typeof PagedRootsDTO>;

export const PagedConcordanceDTO = paged(ConcordanceEntryDTO);
export type PagedConcordanceDTO = z.infer<typeof PagedConcordanceDTO>;

export const ROOT_SORTS = ['alpha', 'frequency'] as const;
export const RootSortParam = z.enum(ROOT_SORTS);
export type RootSort = z.infer<typeof RootSortParam>;
```

- [ ] **Step 7: Write `src/v1/search.ts`**

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
 *  internally and has no offset, so §5's envelope does not apply. */
export const SearchResultDTO = z.object({
  jump: JumpVerseDTO.nullable(),
  verses: z.array(VerseHitDTO),
  roots: z.array(RootDTO),
});
export type SearchResultDTO = z.infer<typeof SearchResultDTO>;
```

- [ ] **Step 8: Write `src/v1/translations.ts`**

```ts
import { z } from 'zod';
import { AyahNumberParam, SurahIdParam } from './common.js';

/** surah_id/ayah_number replace the ayah_id foreign key so a bulk surah fetch
 *  is addressable without a second round trip. */
export const TranslationDTO = z.object({
  surah_id: SurahIdParam,
  ayah_number: AyahNumberParam,
  language_code: z.string(),
  translator: z.string(),
  text: z.string(),
});
export type TranslationDTO = z.infer<typeof TranslationDTO>;

export const LanguageDTO = z.object({
  code: z.string(),
  name_native: z.string(),
  name_english: z.string(),
  direction: z.enum(['ltr', 'rtl']),
});
export type LanguageDTO = z.infer<typeof LanguageDTO>;
```

- [ ] **Step 9: Write `src/v1/audio.ts`**

```ts
import { z } from 'zod';
import { AyahNumberParam, SurahIdParam } from './common.js';

/** The contract's list of reciters. apps/web's src/lib/reciters.ts holds the
 *  URL templates; this is only the set of accepted ids, so a client can
 *  validate a reciter without knowing how URLs are built. */
export const RECITER_IDS = ['abdulbasit_murattal'] as const;
export const ReciterParam = z.enum(RECITER_IDS);
export type ReciterId = z.infer<typeof ReciterParam>;

export const AudioDTO = z.object({
  surah_id: SurahIdParam,
  ayah_number: AyahNumberParam,
  reciter: ReciterParam,
  url: z.string().url(),
});
export type AudioDTO = z.infer<typeof AudioDTO>;
```

- [ ] **Step 10: Extend the v1 barrel**

`packages/api-contract/src/v1/index.ts`:

```ts
export * from './common.js';
export * from './surahs.js';
export * from './words.js';
export * from './ayahs.js';
export * from './roots.js';
export * from './search.js';
export * from './translations.js';
export * from './audio.js';
```

- [ ] **Step 11: Run the tests to verify they pass**

Run: `pnpm --filter @quran-corpus/api-contract test`

Expected: PASS, all tests green (including `purity.test.ts`, which now walks eight files).

- [ ] **Step 12: Build and type-check**

Run: `pnpm --filter @quran-corpus/api-contract build && pnpm --filter @quran-corpus/api-contract type-check`

Expected: no errors.

- [ ] **Step 13: Commit**

```bash
git add packages/api-contract
git commit -m "feat(api-contract): add the v1 resource schemas"
```

---

## Task 3: Three new `packages/data` queries

**Files:**
- Modify: `packages/data/src/queries/ayahs.ts`
- Modify: `packages/data/src/queries/glosses.ts`
- Create: `packages/data/src/queries/languages.ts`
- Modify: `packages/data/src/index.ts`
- Test: `packages/data/tests/ayahs.test.ts` (extend)
- Test: `packages/data/tests/glosses.test.ts` (extend)
- Test: `packages/data/tests/languages.test.ts` (create)

**Interfaces:**
- Consumes: `Client` from `../db.js`, existing `rowToAyah`, types from `../types.js`.
- Produces:
  - `getAyahByLocation(db: Client, surahId: number, ayahNumber: number): Promise<Ayah | null>`
  - `getGlossForWord(db: Client, wordId: number, lang: string, fallback?: string): Promise<GlossWithLang | null>` (`fallback` defaults to `'en'`)
  - `getLanguages(db: Client): Promise<Language[]>`

  All three are re-exported from `@quran-corpus/data`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/data/tests/ayahs.test.ts` (inside the existing top-level scope; the file already provisions an in-memory DB in `beforeAll`):

```ts
describe('getAyahByLocation', () => {
  it('finds an ayah by surah and ayah number', async () => {
    const a = await getAyahByLocation(db, 1, 1);
    expect(a).not.toBeNull();
    expect(a!.surah_id).toBe(1);
    expect(a!.ayah_number).toBe(1);
    expect(typeof a!.id).toBe('number');
  });

  it('returns null past the end of the surah', async () => {
    expect(await getAyahByLocation(db, 1, 999)).toBeNull();
  });

  it('returns null for a surah with no rows', async () => {
    expect(await getAyahByLocation(db, 114, 1)).toBeNull();
  });
});
```

Add `getAyahByLocation` to that file's import from `../src/queries/ayahs.js`. If the existing `beforeAll` does not already insert surah 1 ayah 1, add the same inserts the file already uses for its other tests — do not change existing fixture rows.

Append to `packages/data/tests/glosses.test.ts`:

```ts
describe('getGlossForWord', () => {
  it('returns the gloss in the requested language', async () => {
    const w = await db.execute("SELECT id FROM words WHERE position = 1 LIMIT 1");
    const wordId = w.rows[0]!['id'] as number;
    const g = await getGlossForWord(db, wordId, 'en');
    expect(g).toEqual({ word_id: wordId, gloss_text: 'In (the) name', gloss_lang: 'en' });
  });

  it('falls back to en and reports which language was used', async () => {
    const w = await db.execute("SELECT id FROM words WHERE position = 1 LIMIT 1");
    const wordId = w.rows[0]!['id'] as number;
    const g = await getGlossForWord(db, wordId, 'uz');
    expect(g).toEqual({ word_id: wordId, gloss_text: 'In (the) name', gloss_lang: 'en' });
  });

  it('returns null when neither the language nor the fallback has a gloss', async () => {
    const ins = await db.execute({
      sql: `INSERT INTO words (ayah_id, position, text_arabic)
            SELECT id, 99, 'x' FROM ayahs LIMIT 1 RETURNING id`,
      args: [],
    });
    const orphanId = ins.rows[0]!['id'] as number;
    expect(await getGlossForWord(db, orphanId, 'en')).toBeNull();
  });

  it('returns null for a word id that does not exist', async () => {
    expect(await getGlossForWord(db, 999999, 'en')).toBeNull();
  });
});
```

Add `getGlossForWord` to that file's import from `../src/queries/glosses.js`.

Create `packages/data/tests/languages.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { createDatabase, type Client } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
import { getLanguages } from '../src/queries/languages.js';

let db: Client;

beforeAll(async () => {
  db = createDatabase('file::memory:');
  await runMigrations(db);
  await db.execute({
    sql: `INSERT INTO languages (code, name_native, name_english, direction) VALUES
          ('en', 'English', 'English', 'ltr'),
          ('ar', 'العربية', 'Arabic', 'rtl'),
          ('uz', 'Oʻzbekcha', 'Uzbek', 'ltr')`,
    args: [],
  });
});

describe('getLanguages', () => {
  it('returns every language row, ordered by code', async () => {
    const langs = await getLanguages(db);
    expect(langs.map((l) => l.code)).toEqual(['ar', 'en', 'uz']);
  });

  it('carries the direction flag', async () => {
    const langs = await getLanguages(db);
    expect(langs.find((l) => l.code === 'ar')!.direction).toBe('rtl');
    expect(langs.find((l) => l.code === 'en')!.direction).toBe('ltr');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @quran-corpus/data test`

Expected: FAIL — `getAyahByLocation is not exported`, `getGlossForWord is not exported`, and `Failed to resolve import "../src/queries/languages.js"`.

- [ ] **Step 3: Add `getAyahByLocation` to `packages/data/src/queries/ayahs.ts`**

Append to the file (it already has `rowToAyah` in scope):

```ts
/** Resolve a surah:ayah reference to its row. The corpus is keyed on
 *  ayahs.id internally, but every external reference (API path, deep link,
 *  bookmark) is surah:ayah -- this is the only bridge between the two. */
export async function getAyahByLocation(
  db: Client,
  surahId: number,
  ayahNumber: number,
): Promise<Ayah | null> {
  const result = await db.execute({
    sql: 'SELECT * FROM ayahs WHERE surah_id = ? AND ayah_number = ?',
    args: [surahId, ayahNumber],
  });
  const row = result.rows[0];
  return row ? rowToAyah(row) : null;
}
```

- [ ] **Step 4: Add `getGlossForWord` to `packages/data/src/queries/glosses.ts`**

Append to the file:

```ts
/** One word's gloss with the same language-fallback semantics as
 *  getGlossesWithFallback, scoped to a single word. The surah-wide query would
 *  read thousands of rows to answer a single-word request. */
export async function getGlossForWord(
  db: Client,
  wordId: number,
  lang: string,
  fallback = 'en',
): Promise<GlossWithLang | null> {
  const result = await db.execute({
    sql: `SELECT w.id AS word_id,
                 COALESCE(pref.gloss_text, fb.gloss_text) AS gloss_text,
                 CASE WHEN pref.gloss_text IS NOT NULL THEN ? ELSE ? END AS gloss_lang
          FROM words w
          LEFT JOIN word_glosses pref ON pref.word_id = w.id AND pref.language_code = ?
          LEFT JOIN word_glosses fb   ON fb.word_id   = w.id AND fb.language_code = ?
          WHERE w.id = ?
            AND COALESCE(pref.gloss_text, fb.gloss_text) IS NOT NULL`,
    args: [lang, fallback, lang, fallback, wordId],
  });
  const row = result.rows[0];
  if (!row) return null;
  return {
    word_id: row['word_id'] as number,
    gloss_text: row['gloss_text'] as string,
    gloss_lang: row['gloss_lang'] as string,
  };
}
```

- [ ] **Step 5: Create `packages/data/src/queries/languages.ts`**

```ts
import type { Client } from '../db.js';
import type { Language } from '../types.js';

/** Every language the corpus carries content for. The API validates a `lang`
 *  param against this rather than trusting a regex -- a syntactically valid
 *  code with no rows behind it is still a bad request. */
export async function getLanguages(db: Client): Promise<Language[]> {
  const result = await db.execute('SELECT * FROM languages ORDER BY code');
  return result.rows.map((row) => ({
    code: row['code'] as string,
    name_native: row['name_native'] as string,
    name_english: row['name_english'] as string,
    direction: row['direction'] as 'ltr' | 'rtl',
  }));
}
```

- [ ] **Step 6: Export the three from the barrel**

In `packages/data/src/index.ts`:

- change `export { getAyahsBySurah, getAyahWithWords } from './queries/ayahs.js';`
  to `export { getAyahsBySurah, getAyahWithWords, getAyahByLocation } from './queries/ayahs.js';`
- change `export { getGlossesBySurahAndLang, getGlossesWithFallback } from './queries/glosses.js';`
  to `export { getGlossesBySurahAndLang, getGlossesWithFallback, getGlossForWord } from './queries/glosses.js';`
- add a new line after the glosses export: `export { getLanguages } from './queries/languages.js';`

Do not touch `packages/data/src/client.ts` — these three take a `Client` and must never reach the browser bundle.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter @quran-corpus/data test`

Expected: PASS. All 176 pre-existing tests still green, plus the new ones.

- [ ] **Step 8: Rebuild the package**

Run: `pnpm --filter @quran-corpus/data build`

Expected: no errors. **This step is not optional** — `apps/web` imports `packages/data`'s compiled `dist/`, not `src/`. Skipping it makes every later task fail with "not exported" against code that is visibly present in `src/`.

- [ ] **Step 9: Commit**

```bash
git add packages/data
git commit -m "feat(data): add getAyahByLocation, getGlossForWord and getLanguages"
```

---

## Task 4: Handler plumbing — `_lib/params.ts`, `_lib/respond.ts`, `_lib/map.ts`

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/app/api/v1/_lib/params.ts`
- Create: `apps/web/src/app/api/v1/_lib/respond.ts`
- Create: `apps/web/src/app/api/v1/_lib/map.ts`
- Test: `apps/web/src/test/v1-params.test.ts`
- Test: `apps/web/src/test/v1-respond.test.ts`
- Test: `apps/web/src/test/v1-map.test.ts`

**Interfaces:**
- Consumes: `v1` from `@quran-corpus/api-contract` (Tasks 1–2); row types from `@quran-corpus/data` (`Surah`, `Ayah`, `Word`, `WordSegment`, `ConceptTag`, `Root`, `RootForm`, `RootDefinition`, `Translation`, `Language`, `GlossWithLang`, `SearchResult`).
- Produces:
  - `params.ts` — `clampInt(raw: string | null, fallback: number, min: number, max: number): number`; `FormIdLimitError` (class); `parseFormIds(raw: string | null): number[] | undefined`; `parseAyahRef(raw: string): { surahId: number; ayahNumber: number }`; `parseWordRef(raw: string): { surahId: number; ayahNumber: number; position: number }`; `parseSurahId(raw: string): number`; `parseRootBw(raw: string): string`. Every `parse*` function throws `ApiError` on malformed input. **`params.ts` imports nothing from `@quran-corpus/data`** — every route test mocks that module with a partial factory, and a named import of something the factory omits is a module-eval failure. `parseLang` needs a DB read, which is why it lives in its own module (Task 6).
  - `respond.ts` — `class ApiError extends Error { code: v1.ApiErrorCode; status: number }`; `json<T>(body: T, maxAgeSeconds?: number): Response` (default `86400`); `fail(code: v1.ApiErrorCode, message: string): Response`; `handle(fn: () => Promise<Response>): Promise<Response>`.
  - `map.ts` — `toSurah`, `toAyah`, `toWord`, `toWordSegment`, `toConceptTag`, `toGloss`, `toRoot`, `toRootForm`, `toRootDefinition`, `toTranslation`, `toLanguage`, `toSearchResult`. Signatures listed in Step 6.

- [ ] **Step 1: Add the contract dependency to `apps/web`**

In `apps/web/package.json`, add to `dependencies`, keeping alphabetical order (before `@quran-corpus/data`):

```json
"@quran-corpus/api-contract": "workspace:*",
```

Run: `pnpm install`

Expected: `@quran-corpus/api-contract` resolves from `apps/web`.

- [ ] **Step 2: Write the failing tests**

`apps/web/src/test/v1-params.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  clampInt,
  parseFormIds,
  FormIdLimitError,
  parseAyahRef,
  parseWordRef,
  parseSurahId,
  parseRootBw,
} from '../app/api/v1/_lib/params';
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

describe('parseAyahRef', () => {
  it('splits surah:ayah', () => {
    expect(parseAyahRef('2:255')).toEqual({ surahId: 2, ayahNumber: 255 });
  });

  it('rejects malformed refs with an invalid_params ApiError', () => {
    for (const bad of ['2', '2:', ':255', '2:255:1', 'a:b', '0:1', '115:1', '2:0', '2:287', '2:1.5']) {
      let thrown: unknown;
      try {
        parseAyahRef(bad);
      } catch (e) {
        thrown = e;
      }
      expect(thrown, `expected ${bad} to be rejected`).toBeInstanceOf(ApiError);
      expect((thrown as ApiError).code).toBe('invalid_params');
    }
  });

  it('never echoes the raw input back in the message', () => {
    try {
      parseAyahRef('<script>alert(1)</script>');
    } catch (e) {
      expect((e as ApiError).message).not.toContain('script');
    }
  });
});

describe('parseWordRef', () => {
  it('splits surah:ayah:position', () => {
    expect(parseWordRef('2:255:1')).toEqual({ surahId: 2, ayahNumber: 255, position: 1 });
  });

  it('rejects malformed refs', () => {
    for (const bad of ['2:255', '2:255:0', '2:255:1:9', 'a:b:c', '']) {
      expect(() => parseWordRef(bad)).toThrow(ApiError);
    }
  });
});

describe('parseSurahId', () => {
  it('parses an in-range id', () => {
    expect(parseSurahId('114')).toBe(114);
  });

  it('rejects junk and out-of-range values', () => {
    for (const bad of ['abc', '0', '115', '1.5', '', ' 1', '+1', '1e2']) {
      expect(() => parseSurahId(bad), `id=${bad}`).toThrow(ApiError);
    }
  });
});

describe('parseRootBw', () => {
  it('accepts Buckwalter and percent-decodes first', () => {
    expect(parseRootBw('ktb')).toBe('ktb');
    expect(parseRootBw('%3Emn')).toBe('>mn');
  });

  it('rejects traversal and over-long input', () => {
    for (const bad of ['../etc', '', 'abcdefghijklm', '%2E%2E%2Fetc']) {
      expect(() => parseRootBw(bad), `root=${bad}`).toThrow(ApiError);
    }
  });
});
```

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
      throw new ApiError('not_found', 'no such surah');
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not_found', message: 'no such surah' });
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

`apps/web/src/test/v1-map.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { v1 } from '@quran-corpus/api-contract';
import { toSurah, toAyah, toWord, toWordSegment, toRoot, toRootForm, toTranslation, toSearchResult } from '../app/api/v1/_lib/map';

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

describe('toAyah', () => {
  it('drops audio_url', () => {
    const dto = toAyah({
      id: 1,
      surah_id: 1,
      ayah_number: 1,
      text_uthmani: 'بِسْمِ',
      text_simple: 'بسم',
      juz: 1,
      page: 1,
      audio_url: 'https://example.test/x.mp3',
    });
    expect(dto).not.toHaveProperty('audio_url');
    expect(v1.AyahDTO.parse(dto)).toEqual(dto);
  });
});

describe('toWord', () => {
  it('drops ayah_id, morphology_json, grammar_arabic and audio_url', () => {
    const dto = toWord({
      id: 5,
      ayah_id: 1,
      position: 1,
      text_arabic: 'بِسْمِ',
      transliteration: "bis'mi",
      root: 'سمو',
      lemma: 'ٱسْم',
      root_buckwalter: 'smw',
      lemma_buckwalter: 'Ism',
      pos_tag: 'N',
      morphology_json: '{"raw":1}',
      morphology_description: 'genitive masculine noun',
      grammar_arabic: 'garbled',
      grammar_note: null,
      audio_url: null,
    });
    expect(dto).not.toHaveProperty('ayah_id');
    expect(dto).not.toHaveProperty('morphology_json');
    expect(dto).not.toHaveProperty('grammar_arabic');
    expect(dto).not.toHaveProperty('audio_url');
    expect(v1.WordDTO.parse(dto)).toEqual(dto);
  });
});

describe('toWordSegment', () => {
  it('drops word_id', () => {
    const dto = toWordSegment({
      id: 1,
      word_id: 5,
      segment_index: 0,
      segment_type: 'prefix',
      pos_tag: 'P',
      form_arabic: 'بِ',
      form_buckwalter: 'bi',
      features_json: null,
      lemma: null,
      root: null,
    });
    expect(dto).not.toHaveProperty('word_id');
    expect(v1.WordSegmentDTO.parse(dto)).toEqual(dto);
  });
});

describe('toRootForm', () => {
  it('keeps id and drops root_id', () => {
    const dto = toRootForm({
      id: 3,
      root_id: 1,
      sort_order: 1,
      pos_label: 'verb',
      form_arabic: 'كَتَبَ',
      form_translit: 'kataba',
      gloss: 'to write',
      occurrence_count: 40,
    });
    expect(dto.id).toBe(3);
    expect(dto).not.toHaveProperty('root_id');
    expect(v1.RootFormDTO.parse(dto)).toEqual(dto);
  });
});

describe('toTranslation', () => {
  it('replaces ayah_id with surah_id/ayah_number', () => {
    const dto = toTranslation(
      { id: 9, ayah_id: 1, language_code: 'en', translator: 'Saheeh', text: 'In the name' },
      1,
      1,
    );
    expect(dto).not.toHaveProperty('ayah_id');
    expect(dto).not.toHaveProperty('id');
    expect(v1.TranslationDTO.parse(dto)).toEqual(dto);
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
});

describe('toRoot', () => {
  it('passes a root through unchanged and parses', () => {
    const dto = toRoot({ id: 1, root_buckwalter: 'ktb', root_arabic: 'كتب', occurrence_count: 319 });
    expect(v1.RootDTO.parse(dto)).toEqual(dto);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @quran-corpus/web test src/test/v1-params.test.ts src/test/v1-respond.test.ts src/test/v1-map.test.ts`

Expected: FAIL — `Failed to resolve import "../app/api/v1/_lib/params"`.

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

/** Parse the integer parts of a ref segment. Rejects anything that is not a
 *  bare non-negative integer, so "1e3", "+1", " 1" and "1.0" all fail. */
function refInt(part: string): number | null {
  if (!/^\d+$/.test(part)) return null;
  return Number(part);
}

/** "2:255" -> { surahId: 2, ayahNumber: 255 }. Messages are fixed prose: the
 *  raw input is never echoed back. */
export function parseAyahRef(raw: string): { surahId: number; ayahNumber: number } {
  const parts = raw.split(':');
  if (parts.length !== 2) {
    throw new ApiError('invalid_params', 'Ayah reference must be "surah:ayah", e.g. 2:255.');
  }
  const surahId = refInt(parts[0]!);
  const ayahNumber = refInt(parts[1]!);
  if (surahId === null || ayahNumber === null) {
    throw new ApiError('invalid_params', 'Ayah reference must be "surah:ayah", e.g. 2:255.');
  }
  if (!v1.SurahIdParam.safeParse(surahId).success) {
    throw new ApiError('invalid_params', 'Surah must be between 1 and 114.');
  }
  if (!v1.AyahNumberParam.safeParse(ayahNumber).success) {
    throw new ApiError('invalid_params', 'Ayah must be between 1 and 286.');
  }
  return { surahId, ayahNumber };
}

/** "2:255:1" -> { surahId: 2, ayahNumber: 255, position: 1 }. */
export function parseWordRef(raw: string): {
  surahId: number;
  ayahNumber: number;
  position: number;
} {
  const parts = raw.split(':');
  if (parts.length !== 3) {
    throw new ApiError(
      'invalid_params',
      'Word reference must be "surah:ayah:position", e.g. 2:255:1.',
    );
  }
  const { surahId, ayahNumber } = parseAyahRef(`${parts[0]!}:${parts[1]!}`);
  const position = refInt(parts[2]!);
  if (position === null || !v1.WordPositionParam.safeParse(position).success) {
    throw new ApiError('invalid_params', 'Word position must be 1 or greater.');
  }
  return { surahId, ayahNumber, position };
}

/** Parse a bare [id] path segment as a surah id.
 *  Lives here, not in the route file: Next.js type-checks route.ts and rejects
 *  exports that are not handlers or route config, so two routes cannot share a
 *  helper by exporting it from one of them. */
export function parseSurahId(raw: string): number {
  const n = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!v1.SurahIdParam.safeParse(n).success) {
    throw new ApiError('invalid_params', 'Surah must be between 1 and 114.');
  }
  return n;
}

/** Parse a [root] path segment. Parametrized queries make injection a
 *  non-issue; this rejects junk paths early. Same route.ts-export reason as
 *  parseSurahId for living here. */
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
import type {
  Surah,
  Ayah,
  Word,
  WordSegment,
  ConceptTag,
  Root,
  RootForm,
  RootDefinition,
  Translation,
  Language,
  GlossWithLang,
  SearchResult,
} from '@quran-corpus/data';

// The only place packages/data rows become v1 DTOs. A schema rename upstream
// fails here loudly instead of silently changing the wire format.

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

export function toAyah(row: Ayah): v1.AyahDTO {
  return {
    id: row.id,
    surah_id: row.surah_id,
    ayah_number: row.ayah_number,
    text_uthmani: row.text_uthmani,
    text_simple: row.text_simple,
    juz: row.juz,
    page: row.page,
  };
}

export function toWord(row: Word): v1.WordDTO {
  return {
    id: row.id,
    position: row.position,
    text_arabic: row.text_arabic,
    transliteration: row.transliteration,
    root: row.root,
    lemma: row.lemma,
    root_buckwalter: row.root_buckwalter,
    lemma_buckwalter: row.lemma_buckwalter,
    pos_tag: row.pos_tag,
    morphology_description: row.morphology_description,
    grammar_note: row.grammar_note,
  };
}

export function toWordSegment(row: WordSegment): v1.WordSegmentDTO {
  return {
    id: row.id,
    segment_index: row.segment_index,
    segment_type: row.segment_type,
    pos_tag: row.pos_tag,
    form_arabic: row.form_arabic,
    form_buckwalter: row.form_buckwalter,
    features_json: row.features_json,
    lemma: row.lemma,
    root: row.root,
  };
}

export function toConceptTag(row: ConceptTag): v1.ConceptTagDTO {
  return { id: row.id, tag_label: row.tag_label, tag_type: row.tag_type };
}

export function toGloss(row: GlossWithLang | null): v1.GlossDTO | null {
  return row ? { gloss_text: row.gloss_text, gloss_lang: row.gloss_lang } : null;
}

export function toRoot(row: Root): v1.RootDTO {
  return {
    id: row.id,
    root_buckwalter: row.root_buckwalter,
    root_arabic: row.root_arabic,
    occurrence_count: row.occurrence_count,
  };
}

export function toRootForm(row: RootForm): v1.RootFormDTO {
  return {
    id: row.id,
    sort_order: row.sort_order,
    pos_label: row.pos_label,
    form_arabic: row.form_arabic,
    form_translit: row.form_translit,
    gloss: row.gloss,
    occurrence_count: row.occurrence_count,
  };
}

export function toRootDefinition(row: RootDefinition): v1.RootDefinitionDTO {
  return { source: row.source, definition: row.definition };
}

export function toTranslation(
  row: Translation,
  surahId: number,
  ayahNumber: number,
): v1.TranslationDTO {
  return {
    surah_id: surahId,
    ayah_number: ayahNumber,
    language_code: row.language_code,
    translator: row.translator,
    text: row.text,
  };
}

export function toLanguage(row: Language): v1.LanguageDTO {
  return {
    code: row.code,
    name_native: row.name_native,
    name_english: row.name_english,
    direction: row.direction,
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

Run: `pnpm --filter @quran-corpus/web test src/test/v1-params.test.ts src/test/v1-respond.test.ts src/test/v1-map.test.ts`

Expected: PASS.

- [ ] **Step 8: Type-check and lint**

Run: `pnpm --filter @quran-corpus/web type-check && pnpm --filter @quran-corpus/web lint`

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/web/package.json apps/web/src/app/api/v1/_lib apps/web/src/test/v1-params.test.ts apps/web/src/test/v1-respond.test.ts apps/web/src/test/v1-map.test.ts pnpm-lock.yaml
git commit -m "feat(web/api-v1): add request/response plumbing and row-to-DTO mappers"
```

---

## Task 5: Surah routes

**Files:**
- Create: `apps/web/src/app/api/v1/surahs/route.ts`
- Create: `apps/web/src/app/api/v1/surahs/[id]/route.ts`
- Create: `apps/web/src/app/api/v1/surahs/[id]/ayahs/route.ts`
- Test: `apps/web/src/test/v1-surahs.test.ts`

**Interfaces:**
- Consumes: `json`, `fail`, `handle`, `ApiError` from `_lib/respond`; `clampInt` from `_lib/params`; `toSurah`, `toAyah`, `toWord` from `_lib/map`; `getAllSurahs`, `getSurahById`, `getAyahsBySurah`, `getWordsBySurahAyahRange` from `@quran-corpus/data`; `getDatabase` from `apps/web/src/lib/db`.
- Produces: `GET /api/v1/surahs` → `v1.SurahDTO[]`; `GET /api/v1/surahs/{id}` → `v1.SurahDTO`; `GET /api/v1/surahs/{id}/ayahs?from=&to=` → `{ surah: v1.SurahDTO; ayahs: { ayah: v1.AyahDTO; words: v1.WordDTO[] }[] }`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/test/v1-surahs.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { v1 } from '@quran-corpus/api-contract';

const surah1 = {
  id: 1,
  name_arabic: 'الفاتحة',
  name_translit: 'Al-Fatihah',
  name_translation: 'The Opening',
  revelation_type: 'meccan' as const,
  ayah_count: 7,
  order_number: 1,
};

function ayah(n: number) {
  return {
    id: n,
    surah_id: 1,
    ayah_number: n,
    text_uthmani: `ayah ${n}`,
    text_simple: null,
    juz: 1,
    page: 1,
    audio_url: null,
  };
}

function word(id: number, ayahId: number, position: number) {
  return {
    id,
    ayah_id: ayahId,
    position,
    text_arabic: 'w',
    transliteration: null,
    root: null,
    lemma: null,
    root_buckwalter: null,
    lemma_buckwalter: null,
    pos_tag: null,
    morphology_json: null,
    morphology_description: null,
    grammar_arabic: null,
    grammar_note: null,
    audio_url: null,
  };
}

const getAllSurahs = vi.fn(async () => [surah1]);
const getSurahById = vi.fn(async (_db: unknown, id: number) => (id === 1 ? surah1 : null));
const getAyahsBySurah = vi.fn(async () => [ayah(1), ayah(2), ayah(3)]);
const getWordsBySurahAyahRange = vi.fn(async (_db: unknown, _s: number, lo: number, hi: number) =>
  [word(10, 1, 1), word(20, 2, 1), word(30, 3, 1)].filter((w) => w.ayah_id >= lo && w.ayah_id <= hi),
);

vi.mock('@quran-corpus/data', () => ({
  getAllSurahs,
  getSurahById,
  getAyahsBySurah,
  getWordsBySurahAyahRange,
}));
vi.mock('../lib/db', () => ({ getDatabase: vi.fn(async () => ({})) }));

const { GET: listSurahs } = await import('../app/api/v1/surahs/route');
const { GET: getSurah } = await import('../app/api/v1/surahs/[id]/route');
const { GET: getSurahAyahs } = await import('../app/api/v1/surahs/[id]/ayahs/route');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/surahs', () => {
  it('returns full SurahDTOs, not the PickerSurah subset', async () => {
    const res = await listSurahs();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(v1.SurahDTO.array().parse(body)).toEqual(body);
    expect(body[0]).toHaveProperty('name_arabic');
    expect(body[0]).toHaveProperty('revelation_type');
  });

  it('caches for a day', async () => {
    const res = await listSurahs();
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400');
  });
});

describe('GET /api/v1/surahs/{id}', () => {
  it('returns one surah', async () => {
    const res = await getSurah(new Request('http://x/api/v1/surahs/1'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(200);
    expect(v1.SurahDTO.parse(await res.json())).toBeTruthy();
  });

  it('400s on a non-numeric or out-of-range id', async () => {
    for (const bad of ['abc', '0', '115', '1.5']) {
      const res = await getSurah(new Request(`http://x/api/v1/surahs/${bad}`), {
        params: Promise.resolve({ id: bad }),
      });
      expect(res.status, `id=${bad}`).toBe(400);
      expect((await res.json()).error).toBe('invalid_params');
    }
  });

  it('404s when the surah is absent from the DB', async () => {
    getSurahById.mockResolvedValueOnce(null);
    const res = await getSurah(new Request('http://x/api/v1/surahs/9'), {
      params: Promise.resolve({ id: '9' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not_found');
  });
});

describe('GET /api/v1/surahs/{id}/ayahs', () => {
  it('defaults to the whole surah and nests words under their ayah', async () => {
    const res = await getSurahAyahs(new Request('http://x/api/v1/surahs/1/ayahs'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      surah: unknown;
      ayahs: { ayah: { ayah_number: number }; words: { id: number }[] }[];
    };
    expect(getWordsBySurahAyahRange).toHaveBeenCalledWith(expect.anything(), 1, 1, 7);
    expect(body.ayahs).toHaveLength(3);
    expect(body.ayahs[0]!.words.map((w) => w.id)).toEqual([10]);
  });

  it('honours from= and to=', async () => {
    await getSurahAyahs(new Request('http://x/api/v1/surahs/1/ayahs?from=2&to=3'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(getWordsBySurahAyahRange).toHaveBeenCalledWith(expect.anything(), 1, 2, 3);
  });

  it('clamps a range past the end of the surah instead of erroring', async () => {
    await getSurahAyahs(new Request('http://x/api/v1/surahs/1/ayahs?from=0&to=999'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(getWordsBySurahAyahRange).toHaveBeenCalledWith(expect.anything(), 1, 1, 7);
  });

  it('400s when from > to', async () => {
    const res = await getSurahAyahs(new Request('http://x/api/v1/surahs/1/ayahs?from=5&to=2'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(400);
  });

  it('404s for an absent surah', async () => {
    getSurahById.mockResolvedValueOnce(null);
    const res = await getSurahAyahs(new Request('http://x/api/v1/surahs/9/ayahs'), {
      params: Promise.resolve({ id: '9' }),
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @quran-corpus/web test src/test/v1-surahs.test.ts`

Expected: FAIL — `Failed to resolve import "../app/api/v1/surahs/route"`.

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

- [ ] **Step 4: Write `apps/web/src/app/api/v1/surahs/[id]/route.ts`**

```ts
import { getSurahById } from '@quran-corpus/data';
import { getDatabase } from '../../../../../lib/db';
import { ApiError, handle, json } from '../../_lib/respond';
import { parseSurahId } from '../../_lib/params';
import { toSurah } from '../../_lib/map';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const id = parseSurahId((await params).id);
    const db = await getDatabase();
    const surah = await getSurahById(db, id);
    if (!surah) throw new ApiError('not_found', 'No such surah.');
    return json(toSurah(surah));
  });
}
```

- [ ] **Step 5: Write `apps/web/src/app/api/v1/surahs/[id]/ayahs/route.ts`**

```ts
import { getSurahById, getAyahsBySurah, getWordsBySurahAyahRange } from '@quran-corpus/data';
import { getDatabase } from '../../../../../../lib/db';
import { ApiError, handle, json } from '../../../_lib/respond';
import { clampInt, parseSurahId } from '../../../_lib/params';
import { toSurah, toAyah, toWord } from '../../../_lib/map';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return handle(async () => {
    const id = parseSurahId((await params).id);
    const db = await getDatabase();
    const surah = await getSurahById(db, id);
    if (!surah) throw new ApiError('not_found', 'No such surah.');

    const sp = new URL(request.url).searchParams;
    // Clamp to the surah's real extent rather than 400ing: a client paging
    // blindly to the end should get the tail, not an error.
    const from = clampInt(sp.get('from'), 1, 1, surah.ayah_count);
    const to = clampInt(sp.get('to'), surah.ayah_count, 1, surah.ayah_count);
    if (from > to) {
      throw new ApiError('invalid_params', 'from must not be greater than to.');
    }

    const [ayahs, words] = await Promise.all([
      getAyahsBySurah(db, id),
      getWordsBySurahAyahRange(db, id, from, to),
    ]);

    const wordsByAyahId = new Map<number, typeof words>();
    for (const w of words) {
      const bucket = wordsByAyahId.get(w.ayah_id);
      if (bucket) bucket.push(w);
      else wordsByAyahId.set(w.ayah_id, [w]);
    }

    return json({
      surah: toSurah(surah),
      ayahs: ayahs
        .filter((a) => a.ayah_number >= from && a.ayah_number <= to)
        .map((a) => ({
          ayah: toAyah(a),
          words: (wordsByAyahId.get(a.id) ?? []).map(toWord),
        })),
    });
  });
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @quran-corpus/web test src/test/v1-surahs.test.ts`

Expected: PASS.

- [ ] **Step 7: Type-check and lint**

Run: `pnpm --filter @quran-corpus/web type-check && pnpm --filter @quran-corpus/web lint`

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/api/v1/surahs apps/web/src/test/v1-surahs.test.ts
git commit -m "feat(web/api-v1): add the surah routes"
```

---

## Task 6: Ayah and word routes

**Files:**
- Create: `apps/web/src/app/api/v1/_lib/lang.ts`
- Create: `apps/web/src/app/api/v1/ayahs/[ref]/route.ts`
- Create: `apps/web/src/app/api/v1/ayahs/[ref]/translations/route.ts`
- Create: `apps/web/src/app/api/v1/words/[ref]/route.ts`
- Test: `apps/web/src/test/v1-ayahs.test.ts`
- Test: `apps/web/src/test/v1-words.test.ts`

**Interfaces:**
- Consumes: `parseAyahRef`, `parseWordRef` from `_lib/params`; `parseLang` from `_lib/lang`; `ApiError`, `handle`, `json` from `_lib/respond`; `toAyah`, `toWord`, `toWordSegment`, `toConceptTag`, `toGloss`, `toTranslation` from `_lib/map`; `getAyahByLocation`, `getWordsByAyah`, `getTranslationsByAyah`, `getWordByLocation`, `getWordDetail`, `getGlossForWord`, `getLanguages` from `@quran-corpus/data`.
- Produces: `GET /api/v1/ayahs/{s}:{a}` → `v1.AyahWithWordsDTO`; `GET /api/v1/ayahs/{s}:{a}/translations?lang=` → `v1.TranslationDTO[]`; `GET /api/v1/words/{s}:{a}:{w}?lang=` → `v1.WordDetailDTO`.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/test/v1-ayahs.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { v1 } from '@quran-corpus/api-contract';

const ayahRow = {
  id: 262,
  surah_id: 2,
  ayah_number: 255,
  text_uthmani: 'ٱللَّهُ لَآ إِلَٰهَ',
  text_simple: null,
  juz: 3,
  page: 42,
  audio_url: null,
};

const wordRow = {
  id: 1,
  ayah_id: 262,
  position: 1,
  text_arabic: 'ٱللَّهُ',
  transliteration: 'l-lahu',
  root: null,
  lemma: null,
  root_buckwalter: null,
  lemma_buckwalter: null,
  pos_tag: 'PN',
  morphology_json: null,
  morphology_description: null,
  grammar_arabic: null,
  grammar_note: null,
  audio_url: null,
};

const getAyahByLocation = vi.fn(async () => ayahRow);
const getWordsByAyah = vi.fn(async () => [wordRow]);
const getTranslationsByAyah = vi.fn(async () => [
  { id: 1, ayah_id: 262, language_code: 'en', translator: 'Saheeh', text: 'Allah - there is no deity' },
  { id: 2, ayah_id: 262, language_code: 'uz', translator: 'Sodiq', text: 'Alloh...' },
]);
const getLanguages = vi.fn(async () => [
  { code: 'en', name_native: 'English', name_english: 'English', direction: 'ltr' as const },
  { code: 'uz', name_native: 'Oʻzbekcha', name_english: 'Uzbek', direction: 'ltr' as const },
]);

vi.mock('@quran-corpus/data', () => ({
  getAyahByLocation,
  getWordsByAyah,
  getTranslationsByAyah,
  getLanguages,
}));
vi.mock('../lib/db', () => ({ getDatabase: vi.fn(async () => ({})) }));

const { GET: getAyah } = await import('../app/api/v1/ayahs/[ref]/route');
const { GET: getAyahTranslations } = await import('../app/api/v1/ayahs/[ref]/translations/route');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/ayahs/{s}:{a}', () => {
  it('returns the ayah with its words', async () => {
    const res = await getAyah(new Request('http://x/api/v1/ayahs/2:255'), {
      params: Promise.resolve({ ref: '2:255' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(v1.AyahWithWordsDTO.parse(body)).toEqual(body);
    expect(getAyahByLocation).toHaveBeenCalledWith(expect.anything(), 2, 255);
    expect(getWordsByAyah).toHaveBeenCalledWith(expect.anything(), 262);
  });

  it('400s on a malformed ref without touching the DB', async () => {
    const res = await getAyah(new Request('http://x/api/v1/ayahs/nope'), {
      params: Promise.resolve({ ref: 'nope' }),
    });
    expect(res.status).toBe(400);
    expect(getAyahByLocation).not.toHaveBeenCalled();
  });

  it('404s past the end of the surah', async () => {
    getAyahByLocation.mockResolvedValueOnce(null as never);
    const res = await getAyah(new Request('http://x/api/v1/ayahs/1:200'), {
      params: Promise.resolve({ ref: '1:200' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/ayahs/{s}:{a}/translations', () => {
  it('returns every language when lang is omitted', async () => {
    const res = await getAyahTranslations(new Request('http://x/api/v1/ayahs/2:255/translations'), {
      params: Promise.resolve({ ref: '2:255' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(v1.TranslationDTO.array().parse(body)).toEqual(body);
    expect(body).toHaveLength(2);
    expect(body[0].surah_id).toBe(2);
    expect(body[0].ayah_number).toBe(255);
  });

  it('filters to one language when lang is given', async () => {
    const res = await getAyahTranslations(
      new Request('http://x/api/v1/ayahs/2:255/translations?lang=uz'),
      { params: Promise.resolve({ ref: '2:255' }) },
    );
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].language_code).toBe('uz');
  });

  it('400s on a lang not present in the DB', async () => {
    const res = await getAyahTranslations(
      new Request('http://x/api/v1/ayahs/2:255/translations?lang=zz'),
      { params: Promise.resolve({ ref: '2:255' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_params');
  });

  it('400s on a syntactically invalid lang', async () => {
    const res = await getAyahTranslations(
      new Request('http://x/api/v1/ayahs/2:255/translations?lang=ENGLISH'),
      { params: Promise.resolve({ ref: '2:255' }) },
    );
    expect(res.status).toBe(400);
  });
});
```

`apps/web/src/test/v1-words.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { v1 } from '@quran-corpus/api-contract';

const wordRow = {
  id: 55,
  ayah_id: 262,
  position: 1,
  text_arabic: 'ٱللَّهُ',
  transliteration: 'l-lahu',
  root: null,
  lemma: null,
  root_buckwalter: null,
  lemma_buckwalter: null,
  pos_tag: 'PN',
  morphology_json: '{"raw":1}',
  morphology_description: 'proper noun',
  grammar_arabic: 'garbled',
  grammar_note: 'lafz al-jalalah',
  audio_url: null,
};

const segmentRow = {
  id: 9,
  word_id: 55,
  segment_index: 0,
  segment_type: 'stem',
  pos_tag: 'PN',
  form_arabic: 'ٱللَّهُ',
  form_buckwalter: 'All~ahu',
  features_json: null,
  lemma: null,
  root: null,
};

const getWordByLocation = vi.fn(async () => wordRow);
const getWordDetail = vi.fn(async () => ({
  word: wordRow,
  segments: [segmentRow],
  concept_tags: [{ id: 3, word_id: 55, tag_label: 'Allah', tag_type: 'concept' }],
}));
const getGlossForWord = vi.fn(async () => ({ word_id: 55, gloss_text: 'Allah', gloss_lang: 'en' }));
const getLanguages = vi.fn(async () => [
  { code: 'en', name_native: 'English', name_english: 'English', direction: 'ltr' as const },
  { code: 'uz', name_native: 'Oʻzbekcha', name_english: 'Uzbek', direction: 'ltr' as const },
]);

vi.mock('@quran-corpus/data', () => ({
  getWordByLocation,
  getWordDetail,
  getGlossForWord,
  getLanguages,
}));
vi.mock('../lib/db', () => ({ getDatabase: vi.fn(async () => ({})) }));

const { GET } = await import('../app/api/v1/words/[ref]/route');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/words/{s}:{a}:{w}', () => {
  it('returns word, segments, tags and gloss', async () => {
    const res = await GET(new Request('http://x/api/v1/words/2:255:1'), {
      params: Promise.resolve({ ref: '2:255:1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(v1.WordDetailDTO.parse(body)).toEqual(body);
    expect(getWordByLocation).toHaveBeenCalledWith(expect.anything(), 2, 255, 1);
    expect(getWordDetail).toHaveBeenCalledWith(expect.anything(), 55);
  });

  it('never leaks morphology_json or grammar_arabic', async () => {
    const res = await GET(new Request('http://x/api/v1/words/2:255:1'), {
      params: Promise.resolve({ ref: '2:255:1' }),
    });
    const text = await res.text();
    expect(text).not.toContain('morphology_json');
    expect(text).not.toContain('grammar_arabic');
    expect(text).not.toContain('garbled');
  });

  it('defaults the gloss language to en', async () => {
    await GET(new Request('http://x/api/v1/words/2:255:1'), {
      params: Promise.resolve({ ref: '2:255:1' }),
    });
    expect(getGlossForWord).toHaveBeenCalledWith(expect.anything(), 55, 'en');
  });

  it('passes an explicit lang through', async () => {
    await GET(new Request('http://x/api/v1/words/2:255:1?lang=uz'), {
      params: Promise.resolve({ ref: '2:255:1' }),
    });
    expect(getGlossForWord).toHaveBeenCalledWith(expect.anything(), 55, 'uz');
  });

  it('400s on a lang not present in the DB', async () => {
    const res = await GET(new Request('http://x/api/v1/words/2:255:1?lang=zz'), {
      params: Promise.resolve({ ref: '2:255:1' }),
    });
    expect(res.status).toBe(400);
  });

  it('serves a null gloss rather than 404ing when no gloss exists', async () => {
    getGlossForWord.mockResolvedValueOnce(null as never);
    const res = await GET(new Request('http://x/api/v1/words/2:255:1'), {
      params: Promise.resolve({ ref: '2:255:1' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).gloss).toBeNull();
  });

  it('404s when the word position does not exist', async () => {
    getWordByLocation.mockResolvedValueOnce(null as never);
    const res = await GET(new Request('http://x/api/v1/words/2:255:99'), {
      params: Promise.resolve({ ref: '2:255:99' }),
    });
    expect(res.status).toBe(404);
    expect(getWordDetail).not.toHaveBeenCalled();
  });

  it('400s on a two-part ref', async () => {
    const res = await GET(new Request('http://x/api/v1/words/2:255'), {
      params: Promise.resolve({ ref: '2:255' }),
    });
    expect(res.status).toBe(400);
    expect(getWordByLocation).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @quran-corpus/web test src/test/v1-ayahs.test.ts src/test/v1-words.test.ts`

Expected: FAIL — unresolved route imports.

- [ ] **Step 3: Create the shared `lang` validator at `_lib/lang.ts`**

`apps/web/src/app/api/v1/_lib/lang.ts`:

```ts
import { getLanguages, type Client } from '@quran-corpus/data';
import { v1 } from '@quran-corpus/api-contract';
import { ApiError } from './respond';

/** Validate an optional `lang=` query param: syntax first, then existence in
 *  the DB. A syntactically valid code with no rows behind it is still a bad
 *  request. Returns undefined when the param is absent.
 *
 *  Deliberately not in params.ts: this is the only parser that needs a DB
 *  read, and every route test mocks @quran-corpus/data with a partial factory.
 *  Putting this import in params.ts would make a route that never touches
 *  languages fail at module-eval in any test whose factory omits getLanguages. */
export async function parseLang(db: Client, raw: string | null): Promise<string | undefined> {
  if (raw === null || raw === '') return undefined;
  if (!v1.LangParam.safeParse(raw).success) {
    throw new ApiError('invalid_params', 'lang must be a language code such as "en".');
  }
  const langs = await getLanguages(db);
  if (!langs.some((l) => l.code === raw)) {
    throw new ApiError('invalid_params', 'Unknown language code.');
  }
  return raw;
}
```

- [ ] **Step 4: Write `apps/web/src/app/api/v1/ayahs/[ref]/route.ts`**

```ts
import { getAyahByLocation, getWordsByAyah } from '@quran-corpus/data';
import { getDatabase } from '../../../../../lib/db';
import { ApiError, handle, json } from '../../_lib/respond';
import { parseAyahRef } from '../../_lib/params';
import { toAyah, toWord } from '../../_lib/map';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ref: string }> },
): Promise<Response> {
  return handle(async () => {
    const { surahId, ayahNumber } = parseAyahRef(decodeURIComponent((await params).ref));
    const db = await getDatabase();
    const ayah = await getAyahByLocation(db, surahId, ayahNumber);
    if (!ayah) throw new ApiError('not_found', 'No such ayah.');
    const words = await getWordsByAyah(db, ayah.id);
    return json({ ayah: toAyah(ayah), words: words.map(toWord) });
  });
}
```

- [ ] **Step 5: Write `apps/web/src/app/api/v1/ayahs/[ref]/translations/route.ts`**

```ts
import { getAyahByLocation, getTranslationsByAyah } from '@quran-corpus/data';
import { getDatabase } from '../../../../../../lib/db';
import { ApiError, handle, json } from '../../../_lib/respond';
import { parseAyahRef } from '../../../_lib/params';
import { parseLang } from '../../../_lib/lang';
import { toTranslation } from '../../../_lib/map';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ref: string }> },
): Promise<Response> {
  return handle(async () => {
    const { surahId, ayahNumber } = parseAyahRef(decodeURIComponent((await params).ref));
    const db = await getDatabase();
    const lang = await parseLang(db, new URL(request.url).searchParams.get('lang'));
    const ayah = await getAyahByLocation(db, surahId, ayahNumber);
    if (!ayah) throw new ApiError('not_found', 'No such ayah.');
    const rows = await getTranslationsByAyah(db, ayah.id);
    const filtered = lang === undefined ? rows : rows.filter((t) => t.language_code === lang);
    return json(filtered.map((t) => toTranslation(t, surahId, ayahNumber)));
  });
}
```

- [ ] **Step 6: Write `apps/web/src/app/api/v1/words/[ref]/route.ts`**

```ts
import { getWordByLocation, getWordDetail, getGlossForWord } from '@quran-corpus/data';
import { getDatabase } from '../../../../../lib/db';
import { ApiError, handle, json } from '../../_lib/respond';
import { parseWordRef } from '../../_lib/params';
import { parseLang } from '../../_lib/lang';
import { toWord, toWordSegment, toConceptTag, toGloss } from '../../_lib/map';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ref: string }> },
): Promise<Response> {
  return handle(async () => {
    const { surahId, ayahNumber, position } = parseWordRef(decodeURIComponent((await params).ref));
    const db = await getDatabase();
    const lang = (await parseLang(db, new URL(request.url).searchParams.get('lang'))) ?? 'en';

    const word = await getWordByLocation(db, surahId, ayahNumber, position);
    if (!word) throw new ApiError('not_found', 'No such word.');

    const [detail, gloss] = await Promise.all([
      getWordDetail(db, word.id),
      getGlossForWord(db, word.id, lang),
    ]);
    // getWordByLocation just returned this id, so a null here means the row
    // vanished between two reads -- treat it as gone rather than as a 500.
    if (!detail) throw new ApiError('not_found', 'No such word.');

    return json({
      word: toWord(detail.word),
      segments: detail.segments.map(toWordSegment),
      concept_tags: detail.concept_tags.map(toConceptTag),
      gloss: toGloss(gloss),
    });
  });
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter @quran-corpus/web test src/test/v1-ayahs.test.ts src/test/v1-words.test.ts src/test/v1-params.test.ts`

Expected: PASS. `v1-params.test.ts` is re-run because Step 3 edited that module.

- [ ] **Step 8: Type-check and lint**

Run: `pnpm --filter @quran-corpus/web type-check && pnpm --filter @quran-corpus/web lint`

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/api/v1 apps/web/src/test/v1-ayahs.test.ts apps/web/src/test/v1-words.test.ts
git commit -m "feat(web/api-v1): add the ayah and word routes"
```

---

## Task 7: Root routes

**Files:**
- Create: `apps/web/src/app/api/v1/roots/route.ts`
- Create: `apps/web/src/app/api/v1/roots/[root]/route.ts`
- Create: `apps/web/src/app/api/v1/roots/[root]/concordance/route.ts`
- Test: `apps/web/src/test/v1-roots.test.ts`

**Interfaces:**
- Consumes: `clampInt`, `parseFormIds`, `FormIdLimitError` from `_lib/params`; `ApiError`, `handle`, `json`, `fail` from `_lib/respond`; `toRoot`, `toRootForm`, `toRootDefinition` from `_lib/map`; `getAllRoots`, `getRootEntry`, `getRootConcordancePage`, `countRootConcordance` from `@quran-corpus/data`; `v1.BUCKWALTER_PATTERN`, `v1.DEFAULT_LIMIT`, `v1.MAX_LIMIT`, `v1.MAX_OFFSET`, `v1.CONCORDANCE_MAX_LIMIT`, `v1.MAX_FORM_IDS`, `v1.ROOT_SORTS`.
- Produces: `GET /api/v1/roots?sort=&limit=&offset=` → `v1.PagedRootsDTO`; `GET /api/v1/roots/{bw}` → `v1.RootEntryDTO`; `GET /api/v1/roots/{bw}/concordance?forms=&limit=&offset=` → `v1.PagedConcordanceDTO`.

`getAllRoots` already returns the full list sorted hijāʾī by `compareRootsArabic`, and there are 1642 roots — one query, sorted in the data layer, sliced here. `getRootsByFrequency` is deliberately not used: it takes a `limit` but no `offset`, so it cannot page, and re-sorting the same 1642-row array by `occurrence_count` costs nothing.

- [ ] **Step 1: Write the failing test**

`apps/web/src/test/v1-roots.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { v1 } from '@quran-corpus/api-contract';

const roots = [
  { id: 1, root_buckwalter: '>bd', root_arabic: 'ابد', occurrence_count: 28 },
  { id: 2, root_buckwalter: 'ktb', root_arabic: 'كتب', occurrence_count: 319 },
  { id: 3, root_buckwalter: 'qwm', root_arabic: 'قوم', occurrence_count: 660 },
];

const getAllRoots = vi.fn(async () => roots);
const getRootEntry = vi.fn(async (_db: unknown, bw: string) =>
  bw === 'ktb'
    ? {
        root: roots[1]!,
        forms: [
          {
            id: 3,
            root_id: 2,
            sort_order: 1,
            pos_label: 'verb',
            form_arabic: 'كَتَبَ',
            form_translit: 'kataba',
            gloss: 'to write',
            occurrence_count: 40,
          },
        ],
        definitions: [{ id: 1, root_id: 2, source: "Lane's Lexicon", definition: 'he wrote' }],
      }
    : null,
);
const getRootConcordancePage = vi.fn(async (_db: unknown, _bw: string, _opts?: unknown) => []);
const countRootConcordance = vi.fn(async (_db: unknown, _bw: string, _formIds?: number[]) => 0);

vi.mock('@quran-corpus/data', () => ({
  getAllRoots,
  getRootEntry,
  getRootConcordancePage,
  countRootConcordance,
}));
vi.mock('../lib/db', () => ({ getDatabase: vi.fn(async () => ({})) }));

const { GET: listRoots } = await import('../app/api/v1/roots/route');
const { GET: getRoot } = await import('../app/api/v1/roots/[root]/route');
const { GET: getConcordance } = await import('../app/api/v1/roots/[root]/concordance/route');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/roots', () => {
  it('returns a paged envelope with the true total', async () => {
    const res = await listRoots(new Request('http://x/api/v1/roots'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(v1.PagedRootsDTO.parse(body)).toEqual(body);
    expect(body.total).toBe(3);
    expect(body.limit).toBe(20);
    expect(body.offset).toBe(0);
    expect(body.items).toHaveLength(3);
  });

  it('defaults to the data layer order (hijāʾī)', async () => {
    const res = await listRoots(new Request('http://x/api/v1/roots'));
    const body = await res.json();
    expect(body.items.map((r: { id: number }) => r.id)).toEqual([1, 2, 3]);
  });

  it('sorts by frequency descending when asked', async () => {
    const res = await listRoots(new Request('http://x/api/v1/roots?sort=frequency'));
    const body = await res.json();
    expect(body.items.map((r: { id: number }) => r.id)).toEqual([3, 2, 1]);
  });

  it('pages with limit and offset', async () => {
    const res = await listRoots(new Request('http://x/api/v1/roots?limit=1&offset=1'));
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe(2);
    expect(body.total).toBe(3);
    expect(body.offset).toBe(1);
  });

  it('clamps limit to the global ceiling rather than 400ing', async () => {
    const res = await listRoots(new Request('http://x/api/v1/roots?limit=9999'));
    expect((await res.json()).limit).toBe(100);
  });

  it('400s on an unknown sort', async () => {
    const res = await listRoots(new Request('http://x/api/v1/roots?sort=vibes'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_params');
  });
});

describe('GET /api/v1/roots/{bw}', () => {
  it('returns the root entry', async () => {
    const res = await getRoot(new Request('http://x/api/v1/roots/ktb'), {
      params: Promise.resolve({ root: 'ktb' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(v1.RootEntryDTO.parse(body)).toEqual(body);
    expect(body.forms[0].id).toBe(3);
    expect(body.forms[0]).not.toHaveProperty('root_id');
  });

  it('400s on a junk root path without touching the DB', async () => {
    const res = await getRoot(new Request('http://x/api/v1/roots/..%2Fetc'), {
      params: Promise.resolve({ root: '../etc' }),
    });
    expect(res.status).toBe(400);
    expect(getRootEntry).not.toHaveBeenCalled();
  });

  it('404s on an unknown root', async () => {
    const res = await getRoot(new Request('http://x/api/v1/roots/zzz'), {
      params: Promise.resolve({ root: 'zzz' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/roots/{bw}/concordance', () => {
  it('returns the paged envelope with items, not entries', async () => {
    countRootConcordance.mockResolvedValueOnce(319);
    const res = await getConcordance(new Request('http://x/api/v1/roots/ktb/concordance'), {
      params: Promise.resolve({ root: 'ktb' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(v1.PagedConcordanceDTO.parse(body)).toEqual(body);
    expect(body).not.toHaveProperty('entries');
    expect(body.total).toBe(319);
    expect(body.limit).toBe(20);
  });

  it('parses forms= into formIds passed to both queries', async () => {
    await getConcordance(new Request('http://x/api/v1/roots/ktb/concordance?forms=3,7,12'), {
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
    await getConcordance(new Request('http://x/api/v1/roots/ktb/concordance'), {
      params: Promise.resolve({ root: 'ktb' }),
    });
    expect(getRootConcordancePage.mock.calls.at(-1)![2]).not.toHaveProperty('formIds');
    expect(countRootConcordance.mock.calls.at(-1)![2]).toBeUndefined();
  });

  it('drops non-numeric junk from forms= instead of erroring', async () => {
    const res = await getConcordance(
      new Request('http://x/api/v1/roots/ktb/concordance?forms=3,abc,7'),
      { params: Promise.resolve({ root: 'ktb' }) },
    );
    expect(res.status).toBe(200);
    expect(getRootConcordancePage.mock.calls.at(-1)![2]).toMatchObject({ formIds: [3, 7] });
  });

  it('rejects an oversized forms= list with 400 instead of silently truncating it', async () => {
    const oversized = Array.from({ length: 500 }, (_, i) => i + 1).join(',');
    const res = await getConcordance(
      new Request(`http://x/api/v1/roots/ktb/concordance?forms=${oversized}`),
      { params: Promise.resolve({ root: 'ktb' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_params');
    expect(getRootConcordancePage).not.toHaveBeenCalled();
  });

  it('caps limit at 50, below the global ceiling of 100', async () => {
    const res = await getConcordance(new Request('http://x/api/v1/roots/ktb/concordance?limit=100'), {
      params: Promise.resolve({ root: 'ktb' }),
    });
    expect((await res.json()).limit).toBe(50);
    expect(getRootConcordancePage.mock.calls.at(-1)![2]).toMatchObject({ limit: 50 });
  });

  it('400s on a junk root path without touching the DB', async () => {
    const res = await getConcordance(new Request('http://x/api/v1/roots/x/concordance'), {
      params: Promise.resolve({ root: '../etc' }),
    });
    expect(res.status).toBe(400);
    expect(getRootConcordancePage).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @quran-corpus/web test src/test/v1-roots.test.ts`

Expected: FAIL — unresolved route imports.

- [ ] **Step 3: Write `apps/web/src/app/api/v1/roots/route.ts`**

```ts
import { getAllRoots } from '@quran-corpus/data';
import { v1 } from '@quran-corpus/api-contract';
import { getDatabase } from '../../../../lib/db';
import { ApiError, handle, json } from '../_lib/respond';
import { clampInt } from '../_lib/params';
import { toRoot } from '../_lib/map';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const sp = new URL(request.url).searchParams;
    const rawSort = sp.get('sort') ?? 'alpha';
    const parsed = v1.RootSortParam.safeParse(rawSort);
    if (!parsed.success) {
      throw new ApiError('invalid_params', 'sort must be "alpha" or "frequency".');
    }
    const limit = clampInt(sp.get('limit'), v1.DEFAULT_LIMIT, 1, v1.MAX_LIMIT);
    const offset = clampInt(sp.get('offset'), 0, 0, v1.MAX_OFFSET);

    const db = await getDatabase();
    // getAllRoots already returns all 1642 sorted hijāʾī by compareRootsArabic,
    // the single ordering source. Re-sorting that array for `frequency` is
    // cheaper than a second query and keeps `total` honest for both sorts.
    const all = await getAllRoots(db);
    const ordered =
      parsed.data === 'frequency'
        ? [...all].sort((a, b) => b.occurrence_count - a.occurrence_count)
        : all;

    return json({
      items: ordered.slice(offset, offset + limit).map(toRoot),
      total: all.length,
      limit,
      offset,
    });
  });
}
```

- [ ] **Step 4: Write `apps/web/src/app/api/v1/roots/[root]/route.ts`**

```ts
import { getRootEntry } from '@quran-corpus/data';
import { getDatabase } from '../../../../../lib/db';
import { ApiError, handle, json } from '../../_lib/respond';
import { parseRootBw } from '../../_lib/params';
import { toRoot, toRootForm, toRootDefinition } from '../../_lib/map';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ root: string }> },
): Promise<Response> {
  return handle(async () => {
    const bw = parseRootBw((await params).root);
    const db = await getDatabase();
    const entry = await getRootEntry(db, bw);
    if (!entry) throw new ApiError('not_found', 'No such root.');
    return json({
      root: toRoot(entry.root),
      forms: entry.forms.map(toRootForm),
      definitions: entry.definitions.map(toRootDefinition),
    });
  });
}
```

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
    // ceiling. The global MAX_LIMIT is a ceiling, not a replacement.
    const limit = clampInt(sp.get('limit'), v1.DEFAULT_LIMIT, 1, v1.CONCORDANCE_MAX_LIMIT);
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

`getRootConcordancePage` already returns `ConcordanceEntry[]` in the exact DTO shape (see the field-by-field match in `ConcordanceEntryDTO`), so no mapper is needed here — the schema assertion in the test is what guards that.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @quran-corpus/web test src/test/v1-roots.test.ts`

Expected: PASS.

- [ ] **Step 7: Type-check and lint**

Run: `pnpm --filter @quran-corpus/web type-check && pnpm --filter @quran-corpus/web lint`

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/api/v1/roots apps/web/src/test/v1-roots.test.ts
git commit -m "feat(web/api-v1): add the root, root-entry and concordance routes"
```

---

## Task 8: Search and bulk-translations routes

**Files:**
- Create: `apps/web/src/app/api/v1/search/route.ts`
- Create: `apps/web/src/app/api/v1/translations/route.ts`
- Test: `apps/web/src/test/v1-search.test.ts`
- Test: `apps/web/src/test/v1-translations.test.ts`

**Interfaces:**
- Consumes: `handle`, `json`, `ApiError` from `_lib/respond`; `parseLang` from `_lib/lang`; `toSearchResult`, `toTranslation` from `_lib/map`; `search`, `EMPTY_SEARCH_RESULT`, `getSurahById`, `getAyahsBySurah`, `getTranslationsBySurahAndLang`, `getLanguages` from `@quran-corpus/data`; `v1.SearchQueryParam`, `v1.SurahIdParam`.
- Produces: `GET /api/v1/search?q=` → `v1.SearchResultDTO`; `GET /api/v1/translations?surah=&lang=` → `v1.TranslationDTO[]`.

`/search` takes no `limit`/`offset`: `search()` returns a composite, internally capped at 50 verses and 100 roots with no offset, so §5's paging envelope does not apply. It is also the one route with a short cache TTL — its query space is unbounded, so a long edge TTL is a cache-fill vector.

- [ ] **Step 1: Write the failing tests**

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
    for (const url of ['http://x/api/v1/search', 'http://x/api/v1/search?q=', 'http://x/api/v1/search?q=%20']) {
      const res = await GET(new Request(url));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(EMPTY_SEARCH_RESULT);
    }
    expect(searchFn).not.toHaveBeenCalled();
  });

  it('400s on an over-long query', async () => {
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

`apps/web/src/test/v1-translations.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { v1 } from '@quran-corpus/api-contract';

const surah1 = {
  id: 1,
  name_arabic: 'الفاتحة',
  name_translit: 'Al-Fatihah',
  name_translation: 'The Opening',
  revelation_type: 'meccan' as const,
  ayah_count: 7,
  order_number: 1,
};

const getSurahById = vi.fn(async (_db: unknown, id: number) => (id === 1 ? surah1 : null));
const getAyahsBySurah = vi.fn(async () => [
  { id: 10, surah_id: 1, ayah_number: 1, text_uthmani: 'a', text_simple: null, juz: 1, page: 1, audio_url: null },
  { id: 11, surah_id: 1, ayah_number: 2, text_uthmani: 'b', text_simple: null, juz: 1, page: 1, audio_url: null },
]);
const getTranslationsBySurahAndLang = vi.fn(async () => [
  { id: 1, ayah_id: 10, language_code: 'en', translator: 'Saheeh', text: 'In the name of Allah' },
  { id: 2, ayah_id: 11, language_code: 'en', translator: 'Saheeh', text: 'All praise' },
]);
const getLanguages = vi.fn(async () => [
  { code: 'en', name_native: 'English', name_english: 'English', direction: 'ltr' as const },
]);

vi.mock('@quran-corpus/data', () => ({
  getSurahById,
  getAyahsBySurah,
  getTranslationsBySurahAndLang,
  getLanguages,
}));
vi.mock('../lib/db', () => ({ getDatabase: vi.fn(async () => ({})) }));

const { GET } = await import('../app/api/v1/translations/route');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/translations', () => {
  it('returns a surah of translations addressed by ayah_number', async () => {
    const res = await GET(new Request('http://x/api/v1/translations?surah=1&lang=en'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(v1.TranslationDTO.array().parse(body)).toEqual(body);
    expect(body.map((t: { ayah_number: number }) => t.ayah_number)).toEqual([1, 2]);
    expect(body[0]).not.toHaveProperty('ayah_id');
  });

  it('400s when surah is missing', async () => {
    const res = await GET(new Request('http://x/api/v1/translations?lang=en'));
    expect(res.status).toBe(400);
  });

  it('400s when lang is missing', async () => {
    const res = await GET(new Request('http://x/api/v1/translations?surah=1'));
    expect(res.status).toBe(400);
  });

  it('400s on an out-of-range surah', async () => {
    const res = await GET(new Request('http://x/api/v1/translations?surah=115&lang=en'));
    expect(res.status).toBe(400);
    expect(getTranslationsBySurahAndLang).not.toHaveBeenCalled();
  });

  it('400s on a lang not present in the DB', async () => {
    const res = await GET(new Request('http://x/api/v1/translations?surah=1&lang=zz'));
    expect(res.status).toBe(400);
  });

  it('404s for an absent surah', async () => {
    getSurahById.mockResolvedValueOnce(null);
    const res = await GET(new Request('http://x/api/v1/translations?surah=9&lang=en'));
    expect(res.status).toBe(404);
  });

  it('drops a translation whose ayah row is missing rather than emitting a bad ayah_number', async () => {
    getTranslationsBySurahAndLang.mockResolvedValueOnce([
      { id: 3, ayah_id: 999, language_code: 'en', translator: 'Saheeh', text: 'orphan' },
    ]);
    const res = await GET(new Request('http://x/api/v1/translations?surah=1&lang=en'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @quran-corpus/web test src/test/v1-search.test.ts src/test/v1-translations.test.ts`

Expected: FAIL — unresolved route imports.

- [ ] **Step 3: Write `apps/web/src/app/api/v1/search/route.ts`**

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

- [ ] **Step 4: Write `apps/web/src/app/api/v1/translations/route.ts`**

```ts
import { getSurahById, getAyahsBySurah, getTranslationsBySurahAndLang } from '@quran-corpus/data';
import { v1 } from '@quran-corpus/api-contract';
import { getDatabase } from '../../../../lib/db';
import { ApiError, handle, json } from '../_lib/respond';
import { parseLang } from '../_lib/lang';
import { toTranslation } from '../_lib/map';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const sp = new URL(request.url).searchParams;

    const rawSurah = sp.get('surah');
    const surahId = rawSurah !== null && /^\d+$/.test(rawSurah) ? Number(rawSurah) : NaN;
    if (!v1.SurahIdParam.safeParse(surahId).success) {
      throw new ApiError('invalid_params', 'surah is required and must be between 1 and 114.');
    }

    const db = await getDatabase();
    const lang = await parseLang(db, sp.get('lang'));
    if (lang === undefined) {
      throw new ApiError('invalid_params', 'lang is required.');
    }

    const surah = await getSurahById(db, surahId);
    if (!surah) throw new ApiError('not_found', 'No such surah.');

    const [ayahs, rows] = await Promise.all([
      getAyahsBySurah(db, surahId),
      getTranslationsBySurahAndLang(db, surahId, lang),
    ]);
    // Translation rows carry ayah_id; the wire format is surah:ayah. One extra
    // cheap read beats adding a join to the shared query for one caller.
    const ayahNumberById = new Map(ayahs.map((a) => [a.id, a.ayah_number]));

    const out: v1.TranslationDTO[] = [];
    for (const row of rows) {
      const ayahNumber = ayahNumberById.get(row.ayah_id);
      // An orphaned translation row cannot be addressed on the wire; skipping
      // it beats emitting a DTO with a fabricated ayah_number.
      if (ayahNumber === undefined) continue;
      out.push(toTranslation(row, surahId, ayahNumber));
    }
    return json(out);
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @quran-corpus/web test src/test/v1-search.test.ts src/test/v1-translations.test.ts`

Expected: PASS.

- [ ] **Step 6: Type-check and lint**

Run: `pnpm --filter @quran-corpus/web type-check && pnpm --filter @quran-corpus/web lint`

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/api/v1/search apps/web/src/app/api/v1/translations apps/web/src/test/v1-search.test.ts apps/web/src/test/v1-translations.test.ts
git commit -m "feat(web/api-v1): add the search and bulk-translations routes"
```

---

## Task 9: Reciter registry and the audio route

**Files:**
- Create: `apps/web/src/lib/reciters.ts`
- Create: `apps/web/src/app/api/v1/audio/[ref]/route.ts`
- Modify: `apps/web/src/hooks/useAyahAudio.ts`
- Test: `apps/web/src/test/reciters.test.ts`
- Test: `apps/web/src/test/v1-audio.test.ts`
- Test: `apps/web/src/test/useAyahAudio.test.ts` (existing — must stay green)

**Interfaces:**
- Consumes: `v1.RECITER_IDS`, `v1.ReciterParam`, `v1.AudioDTO`; `getAyahByLocation` from `@quran-corpus/data`; `parseAyahRef` from `_lib/params`.
- Produces:
  - `apps/web/src/lib/reciters.ts` — `DEFAULT_RECITER: v1.ReciterId`; `RECITERS: Record<v1.ReciterId, { name: string; buildUrl(surah: number, ayah: number): string }>`; `buildAudioUrl(surah: number, ayah: number, reciter?: v1.ReciterId): string`.
  - `GET /api/v1/audio/{s}:{a}?reciter=` → `v1.AudioDTO`.

The registry is a plain module with no DB access, so both the client hook and the server route import it. That is what keeps the `Abdul_Basit_Murattal_64kbps` string in one place. The hook is **not** changed to fetch the API — the reader already has the ayah in hand, and a network round-trip before playback would be a regression.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/test/reciters.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { v1 } from '@quran-corpus/api-contract';
import { RECITERS, DEFAULT_RECITER, buildAudioUrl } from '../lib/reciters';

describe('reciter registry', () => {
  it('covers exactly the ids the contract declares', () => {
    expect(Object.keys(RECITERS).sort()).toEqual([...v1.RECITER_IDS].sort());
  });

  it('has a default that is a registered id', () => {
    expect(RECITERS[DEFAULT_RECITER]).toBeDefined();
  });
});

describe('buildAudioUrl', () => {
  it('zero-pads surah and ayah to three digits', () => {
    expect(buildAudioUrl(1, 1)).toBe(
      'https://everyayah.com/data/Abdul_Basit_Murattal_64kbps/001001.mp3',
    );
    expect(buildAudioUrl(114, 6)).toBe(
      'https://everyayah.com/data/Abdul_Basit_Murattal_64kbps/114006.mp3',
    );
    expect(buildAudioUrl(2, 255)).toBe(
      'https://everyayah.com/data/Abdul_Basit_Murattal_64kbps/002255.mp3',
    );
  });

  it('produces a url the contract accepts', () => {
    expect(v1.AudioDTO.safeParse({
      surah_id: 1,
      ayah_number: 1,
      reciter: DEFAULT_RECITER,
      url: buildAudioUrl(1, 1),
    }).success).toBe(true);
  });
});
```

`apps/web/src/test/v1-audio.test.ts`:

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { v1 } from '@quran-corpus/api-contract';

const ayahRow = {
  id: 1,
  surah_id: 1,
  ayah_number: 1,
  text_uthmani: 'a',
  text_simple: null,
  juz: 1,
  page: 1,
  audio_url: null as string | null,
};

const getAyahByLocation = vi.fn(async () => ayahRow);

vi.mock('@quran-corpus/data', () => ({ getAyahByLocation }));
vi.mock('../lib/db', () => ({ getDatabase: vi.fn(async () => ({})) }));

const { GET } = await import('../app/api/v1/audio/[ref]/route');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/audio/{s}:{a}', () => {
  it('falls back to the registry when ayahs.audio_url is empty', async () => {
    const res = await GET(new Request('http://x/api/v1/audio/1:1'), {
      params: Promise.resolve({ ref: '1:1' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(v1.AudioDTO.parse(body)).toEqual(body);
    expect(body.url).toBe('https://everyayah.com/data/Abdul_Basit_Murattal_64kbps/001001.mp3');
  });

  it('prefers a populated ayahs.audio_url over the registry', async () => {
    getAyahByLocation.mockResolvedValueOnce({ ...ayahRow, audio_url: 'https://cdn.test/1-1.mp3' });
    const res = await GET(new Request('http://x/api/v1/audio/1:1'), {
      params: Promise.resolve({ ref: '1:1' }),
    });
    expect((await res.json()).url).toBe('https://cdn.test/1-1.mp3');
  });

  it('ignores an empty-string audio_url -- the column is "" on all 6236 rows', async () => {
    getAyahByLocation.mockResolvedValueOnce({ ...ayahRow, audio_url: '' });
    const res = await GET(new Request('http://x/api/v1/audio/1:1'), {
      params: Promise.resolve({ ref: '1:1' }),
    });
    expect((await res.json()).url).toContain('everyayah.com');
  });

  it('400s on an unknown reciter without touching the DB', async () => {
    const res = await GET(new Request('http://x/api/v1/audio/1:1?reciter=nobody'), {
      params: Promise.resolve({ ref: '1:1' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_params');
    expect(getAyahByLocation).not.toHaveBeenCalled();
  });

  it('400s on a malformed ref', async () => {
    const res = await GET(new Request('http://x/api/v1/audio/nope'), {
      params: Promise.resolve({ ref: 'nope' }),
    });
    expect(res.status).toBe(400);
  });

  it('404s for an ayah that does not exist', async () => {
    getAyahByLocation.mockResolvedValueOnce(null as never);
    const res = await GET(new Request('http://x/api/v1/audio/1:99'), {
      params: Promise.resolve({ ref: '1:99' }),
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @quran-corpus/web test src/test/reciters.test.ts src/test/v1-audio.test.ts`

Expected: FAIL — unresolved imports for `../lib/reciters`.

- [ ] **Step 3: Write `apps/web/src/lib/reciters.ts`**

```ts
import { v1 } from '@quran-corpus/api-contract';

/** Where an ayah's recitation lives, per reciter. Pure -- no DB, no Next
 *  imports -- so both the client audio hook and the /api/v1/audio route
 *  import it and the URL template exists exactly once. */
export const RECITERS: Record<
  v1.ReciterId,
  { name: string; buildUrl: (surah: number, ayah: number) => string }
> = {
  abdulbasit_murattal: {
    name: 'Abdul Basit (Murattal)',
    buildUrl: (surah, ayah) =>
      `https://everyayah.com/data/Abdul_Basit_Murattal_64kbps/${pad3(surah)}${pad3(ayah)}.mp3`,
  },
};

export const DEFAULT_RECITER: v1.ReciterId = 'abdulbasit_murattal';

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

export function buildAudioUrl(
  surah: number,
  ayah: number,
  reciter: v1.ReciterId = DEFAULT_RECITER,
): string {
  return RECITERS[reciter].buildUrl(surah, ayah);
}
```

- [ ] **Step 4: Write `apps/web/src/app/api/v1/audio/[ref]/route.ts`**

```ts
import { getAyahByLocation } from '@quran-corpus/data';
import { v1 } from '@quran-corpus/api-contract';
import { getDatabase } from '../../../../../lib/db';
import { ApiError, handle, json } from '../../_lib/respond';
import { parseAyahRef } from '../../_lib/params';
import { buildAudioUrl, DEFAULT_RECITER } from '../../../../../lib/reciters';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ref: string }> },
): Promise<Response> {
  return handle(async () => {
    const { surahId, ayahNumber } = parseAyahRef(decodeURIComponent((await params).ref));

    const rawReciter = new URL(request.url).searchParams.get('reciter');
    let reciter: v1.ReciterId = DEFAULT_RECITER;
    if (rawReciter !== null && rawReciter !== '') {
      const parsed = v1.ReciterParam.safeParse(rawReciter);
      if (!parsed.success) throw new ApiError('invalid_params', 'Unknown reciter.');
      reciter = parsed.data;
    }

    const db = await getDatabase();
    const ayah = await getAyahByLocation(db, surahId, ayahNumber);
    if (!ayah) throw new ApiError('not_found', 'No such ayah.');

    // A populated ayahs.audio_url wins; the column is empty on all 6236 rows
    // today, so in practice the registry answers every request.
    const url = ayah.audio_url ? ayah.audio_url : buildAudioUrl(surahId, ayahNumber, reciter);
    return json({ surah_id: surahId, ayah_number: ayahNumber, reciter, url });
  });
}
```

- [ ] **Step 5: Point `useAyahAudio` at the shared registry**

In `apps/web/src/hooks/useAyahAudio.ts`, replace the local `buildAudioUrl` function:

```ts
function buildAudioUrl(ayah: Ayah): string {
  if (ayah.audio_url) return ayah.audio_url;
  const s = String(ayah.surah_id).padStart(3, '0');
  const a = String(ayah.ayah_number).padStart(3, '0');
  return `https://everyayah.com/data/Abdul_Basit_Murattal_64kbps/${s}${a}.mp3`;
}
```

with a call into the registry, adding the import at the top of the file:

```ts
import { buildAudioUrl as buildReciterUrl } from '../lib/reciters';

// Same precedence /api/v1/audio applies, from the one registry -- the URL
// template must not exist in two places.
function buildAudioUrl(ayah: Ayah): string {
  if (ayah.audio_url) return ayah.audio_url;
  return buildReciterUrl(ayah.surah_id, ayah.ayah_number);
}
```

Do not change any other part of the hook.

- [ ] **Step 6: Run the new tests and the existing hook test**

Run: `pnpm --filter @quran-corpus/web test src/test/reciters.test.ts src/test/v1-audio.test.ts src/test/useAyahAudio.test.ts`

Expected: PASS, including the pre-existing `useAyahAudio.test.ts` unchanged. If it fails, the hook refactor changed behaviour — fix the hook, not the test.

- [ ] **Step 7: Type-check and lint**

Run: `pnpm --filter @quran-corpus/web type-check && pnpm --filter @quran-corpus/web lint`

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/reciters.ts apps/web/src/app/api/v1/audio apps/web/src/hooks/useAyahAudio.ts apps/web/src/test/reciters.test.ts apps/web/src/test/v1-audio.test.ts
git commit -m "feat(web/api-v1): add the audio route and share the reciter registry with the player"
```

---

## Task 10: Migrate the three legacy routes and delete them

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
- Consumes: the twelve v1 routes from Tasks 5–9.
- Produces: no unversioned API routes remain under `apps/web/src/app/api/` except the `v1/` tree.

Clean cut, no redirect shims (spec D5). Old paths are deleted in the same commit that repoints their callers, so a revert restores both together.

- [ ] **Step 1: Repoint `SearchSheet.tsx`**

Two `fetch` calls change. The surah fetch also changes shape: `/api/v1/surahs` returns full `SurahDTO`s, so the component maps them with the `toPickerSurah` helper it already imports the type from.

Change the surah fetch (currently around line 23):

```ts
        const res = await fetch('/api/v1/surahs', { signal: ctrl.signal });
        if (!res.ok) return;
        // v1 returns neutral SurahDTOs; the picker's shape is a web concern and
        // is derived here rather than frozen into the URL.
        const data = (await res.json()) as Surah[];
        setSurahs(data.map(toPickerSurah));
```

and extend the existing import from `../wbw/types` to bring in the mapper:

```ts
import { toPickerSurah, type PickerSurah } from '../wbw/types';
```

`Surah` comes from the data client barrel — add it to the existing import:

```ts
import { EMPTY_SEARCH_RESULT, type SearchResult, type Surah } from '@quran-corpus/data/client';
```

If `Surah` is not exported from `@quran-corpus/data/client`, add `Surah` to the `export type { … }` list in `packages/data/src/client.ts` (it is a pure type, erased at build time, so it cannot drag the driver in), then rebuild with `pnpm --filter @quran-corpus/data build`.

Change the search fetch (currently around line 46):

```ts
        const res = await fetch(`/api/v1/search?q=${encodeURIComponent(term)}`, {
          signal: ctrl.signal,
        });
```

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

In `apps/web/src/test/SearchSheet.test.tsx` and `apps/web/src/test/ConcordanceList.test.tsx`, update the mocked fetch URLs and payloads to match:

- any `'/api/surahs'` → `'/api/v1/surahs'`, and its stub payload becomes full `SurahDTO` objects (`id`, `name_arabic`, `name_translit`, `name_translation`, `revelation_type`, `ayah_count`, `order_number`) rather than the three-field `PickerSurah` subset;
- any `'/api/search'` → `'/api/v1/search'`;
- any `/api/roots/…/concordance` → `/api/v1/roots/…/concordance`, and any stub response body `{ entries: [...], total: n }` → `{ items: [...], total: n, limit: 20, offset: 0 }`.

Assertions about rendered output must not change — if one has to, the refactor changed user-visible behaviour and the component is wrong, not the test.

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

Their coverage now lives in `v1-surahs.test.ts`, `v1-search.test.ts` and `v1-roots.test.ts`.

- [ ] **Step 6: Verify no reference to an unversioned API path survives**

Run: `grep -rn "'/api/\(search\|surahs\|roots\)" apps/web/src || echo "clean"`

Expected: `clean`. Anything printed is a caller Task 10 missed — fix it before continuing.

Run: `ls apps/web/src/app/api`

Expected: `v1` only. Remove any empty directories left behind by the deletions.

- [ ] **Step 7: Run the whole suite**

Run: `pnpm test`

Expected: PASS across all three packages — `packages/data` (176 pre-existing plus Task 3's), `packages/api-contract` (Tasks 1–2), and `apps/web` (403 pre-existing minus the 3 deleted route test files, plus the eight new v1 test files).

- [ ] **Step 8: Type-check, lint, and build**

Run: `pnpm type-check && pnpm lint && pnpm build`

Expected: no errors.

**Before running `pnpm build`, stop any `next dev` server.** `next dev` and `next build` share `apps/web/.next`; building over a running dev server corrupts it, producing CSS 404s and `MODULE_NOT_FOUND` at runtime. Recovery is: kill dev, `rm -rf apps/web/.next`, restart.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor(web): move the three unversioned API routes to /api/v1

Callers move in the same commit as the routes they call, so a revert
restores both together. /api/v1/surahs returns a neutral SurahDTO rather
than PickerSurah -- a web component's type is no longer frozen into a URL --
and the concordance body is the standard paged envelope, so `entries`
becomes `items`.

No redirect shims: the only consumers are in this repo (spec D5)."
```

---

## Done criteria

- Twelve `GET` routes live under `/api/v1`, no unversioned API routes remain.
- `pnpm test`, `pnpm lint`, `pnpm type-check`, `pnpm build` all pass.
- `packages/api-contract` imports nothing from `packages/data` — enforced by `tests/purity.test.ts`, not by convention.
- Every route's response parses against its own zod schema in a test.
- The 6-step loop (CLAUDE.md §4) still applies to the branch as a whole: self-review, then `/code-review` (user-triggered — stop and ask), then lint/type/test, then CodeRabbit, then a final re-review before merge.

## Follow-ups deliberately not in this plan

- **Cloudflare edge rate limiting (spec D6)** is infrastructure configuration, not code — no file in this repo changes. Configure it before the API is reachable from outside the tunnel.
- **`getLemmaFrequency` / `getVerbConcordance`** are not exposed: no consumer. Additive later under D7.
- **A `/api/v1/languages` route** is not exposed: `getLanguages` exists to validate `lang`, and nothing asks for the list yet. Additive later.
- **`apps/mobile`** — this plan builds the API it will consume; the app itself is a later phase.
