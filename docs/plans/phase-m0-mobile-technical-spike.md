# M0 Mobile Technical Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the Android-first native app foundation: Expo app boots, Arabic fonts render, a bundled SQLite DB can be queried offline, one reader screen and one word-detail bottom sheet use real fixture data, and the Abdul Rashid Sufi thin audio endpoint contract works.

**Architecture:** Add `apps/mobile` as an Expo React Native app inside the existing pnpm/turbo monorepo. Keep corpus semantics in `@quran-corpus/data`; expose a DB-safe mobile query entrypoint and use a thin `packages/mobile-data` adapter for Expo SQLite. M0 uses a deterministic tiny fixture DB so the spike is reproducible without a private/full corpus DB artifact.

**Tech Stack:** React Native + Expo, Expo Router, TypeScript, `expo-sqlite`, `expo-asset`, `expo-font`, React Native bottom sheet, Vitest for pure adapter tests, Expo/TypeScript checks for app compile.

## Global Constraints

- Android first, scalable to iOS.
- Platform is React Native + Expo.
- First launch must work offline for core corpus features via bundled DB.
- UI and content languages are English, Uzbek, and Russian, with scalable locale/content architecture.
- Search scope matches the current web app; M0 only proves DB access and leaves full search UI to a later phase.
- V1 reciter is Abdul Rashid Sufi.
- Audio streams through our own thin endpoint backed by QUA/QuranicAudio metadata; no direct QuranClip dependency.
- Treebank is post-v1.
- User data is local-only for v1.
- `packages/data` remains the source of corpus query semantics; do not copy query logic into `apps/mobile`.
- Start with a thin `packages/mobile-data` adapter; deeper `packages/data` refactor only if needed.
- Use CodeRabbit as automated review gate; Greptile is not used.
- Follow the repo 6-step loop in `CLAUDE.md`: Implement -> Self Review -> `/code-review` -> lint/type/test -> CodeRabbit Review -> Final Review.
- Do not make per-task commits until the repo review loop allows it. Use `git diff` checkpoints between tasks.

---

## File Structure

- Create `packages/data/src/mobile.ts`
  DB-safe data entrypoint for mobile. Re-export query functions/types used by mobile. Must not export `createDatabase`, migrations, or `@libsql/client` runtime code.

- Modify `packages/data/package.json`
  Add `./mobile` export to built `dist/mobile.js`.

- Create `packages/data/tests/mobile-entry.test.ts`
  Guards that mobile entrypoint exports query functions and does not export Node/libSQL runtime helpers.

- Create `packages/mobile-data/package.json`
  Workspace package for Expo SQLite adapter and fixture generation.

- Create `packages/mobile-data/src/expoSqliteClient.ts`
  Converts Expo SQLite's `getAllAsync` API into the `execute()` shape expected by existing query functions.

- Create `packages/mobile-data/src/index.ts`
  Public exports for the adapter.

- Create `packages/mobile-data/tests/expoSqliteClient.test.ts`
  Pure fake-DB tests. No Expo runtime required.

- Create `packages/mobile-data/scripts/create-m0-fixture-db.ts`
  Builds `apps/mobile/assets/db/quran-m0.db` from `packages/data/schema.sql` with minimal rows for Surah 1, ayahs 1-2, words, segments, English/Uzbek/Russian translations, one root, one root form, and search index rows.

- Create `packages/mobile-data/tsconfig.json`, `packages/mobile-data/vitest.config.ts`
  Match existing package conventions.

- Create `apps/mobile/package.json`
  Expo app package with `dev`, `android`, `ios`, `lint`, `type-check`, `test`, `build` scripts.

- Create `apps/mobile/app.json`
  Expo app config. Android package name `com.qurancorpus.mobile`. Portrait orientation. App links host mirrors web host after domain is chosen; M0 config keeps linking local.

- Create `apps/mobile/tsconfig.json`
  Extends shared config and supports Expo Router typed routes.

- Create `apps/mobile/babel.config.js`, `apps/mobile/metro.config.js`, `apps/mobile/eslint.config.mjs`
  Expo/monorepo config. Metro must resolve workspace packages and include `.db` assets.

- Create `apps/mobile/vitest.config.ts`
  Node-environment tests for pure mobile helper modules.

- Create `apps/mobile/app/_layout.tsx`
  Root Expo Router layout. Loads Arabic font and DB bootstrap before rendering screens.

- Create `apps/mobile/app/index.tsx`
  M0 reader screen. Shows Surah 1 ayahs from local fixture DB, language segmented control, and tappable words.

- Create `apps/mobile/src/data/openCorpusDb.ts`
  Copies bundled `quran-m0.db` from assets into SQLite storage on first launch and returns an Expo SQLite database handle.

- Create `apps/mobile/src/data/corpusRepository.ts`
  Mobile repository functions over the adapter: `getM0SurahReader()` and `getM0WordDetail()`.

- Create `apps/mobile/src/i18n/languages.ts`
  Defines scalable language metadata for `en`, `uz`, `ru`.

- Create `apps/mobile/src/components/ReaderScreen.tsx`
  Pure-ish screen component fed by repository data.

- Create `apps/mobile/src/components/WordDetailSheet.tsx`
  Bottom sheet for word summary and segment details.

- Create `apps/mobile/src/components/SegmentPills.tsx`
  Native port of current segment-pill concept.

- Create `apps/mobile/src/theme/tokens.ts`
  Brand tokens adapted from PWA warm paper/night direction.

- Keep `apps/mobile/assets/fonts/hafs.18.woff2`
  M0 font proof. Do not alter font file.

- Create `apps/mobile/src/api/audio.ts`
  Client helper for the future thin `GET /api/v1/audio/ayah` endpoint.

- Document backend dependency:
  Thin Abdul Rashid Sufi audio endpoint lives outside this mobile repo. M0 mobile owns the client contract only.

- Modify `turbo.json` only if Expo package scripts need output/cache config beyond current defaults.

---

### Task 1: Mobile-Safe Data Entry Point

**Files:**
- Create: `packages/data/src/mobile.ts`
- Modify: `packages/data/package.json`
- Test: `packages/data/tests/mobile-entry.test.ts`

**Interfaces:**
- Consumes: existing query exports from `packages/data/src/queries/*`.
- Produces: `@quran-corpus/data/mobile` export containing DB-safe queries/types for mobile consumers.

- [ ] **Step 1: Write the failing test**

Create `packages/data/tests/mobile-entry.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

describe('@quran-corpus/data/mobile', () => {
  it('exports mobile-safe query functions', async () => {
    const mod = await import('../src/mobile');

    expect(typeof mod.getAllSurahs).toBe('function');
    expect(typeof mod.getAyahsBySurah).toBe('function');
    expect(typeof mod.getWordsByAyah).toBe('function');
    expect(typeof mod.getWordDetail).toBe('function');
    expect(typeof mod.getTranslationsBySurahAndLang).toBe('function');
    expect(typeof mod.search).toBe('function');
  });

  it('does not export node/libsql runtime helpers', async () => {
    const mod = await import('../src/mobile');

    expect('createDatabase' in mod).toBe(false);
    expect('runMigrations' in mod).toBe(false);
    expect('backfillSearchIndex' in mod).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @quran-corpus/data test -- mobile-entry.test.ts`

Expected: FAIL because `packages/data/src/mobile.ts` does not exist.

- [ ] **Step 3: Add mobile entrypoint**

Create `packages/data/src/mobile.ts`:

```ts
export { getAllSurahs, getSurahById } from './queries/surahs.js';
export { getAyahsBySurah, getAyahWithWords } from './queries/ayahs.js';
export {
  getWordsByAyah,
  getWordsBySurah,
  getWordsBySurahAyahRange,
  getWordByLocation,
  getWordDetail,
  getSegmentsByWordIds,
} from './queries/words.js';
export { getTranslationsByAyah, getTranslation, getTranslationsBySurahAndLang } from './queries/translations.js';
export { getGlossesBySurahAndLang, getGlossesWithFallback } from './queries/glosses.js';
export type { GlossWithLang } from './queries/glosses.js';
export { parseVerseRef, searchVerses, search, EMPTY_SEARCH_RESULT } from './queries/search.js';
export {
  getRootByBuckwalter,
  getAllRoots,
  getRootArabicList,
  getRootsByFrequency,
  searchRoots,
  getRootForms,
  getRootDefinitions,
  getRootEntry,
  getRootConcordance,
  getRootConcordancePage,
  countRootConcordance,
  getRootSearchList,
  getRootNeighbors,
} from './queries/roots.js';
export { buckwalterToArabic, compareRootsArabic, rootFirstLetter, ARABIC_ALPHABET_ORDER } from './text/arabic.js';
export { trimConcordanceVerse } from './text/concordanceTrim.js';
export { isSajdahAyah } from './text/sajdah.js';
export { decodeSegment, posLabelEn } from './morphology/decode.js';
export type {
  Surah,
  Ayah,
  Word,
  Language,
  Translation,
  WordGloss,
  Root,
  RootSearchItem,
  RootForm,
  RootDefinition,
  RootEntry,
  ConcordanceEntry,
  VerseWord,
  WordSegment,
  ConceptTag,
  WordDetail,
  DecodedSegment,
  DecodedFeature,
  LemmaFrequencyEntry,
  VerbConcordanceEntry,
  VerseRef,
  VerseHit,
  JumpVerse,
  SearchResult,
} from './types.js';
```

Modify `packages/data/package.json` exports:

```json
"./mobile": {
  "import": "./dist/mobile.js",
  "types": "./dist/mobile.d.ts"
}
```

- [ ] **Step 4: Run tests and type-check**

Run:

```bash
pnpm --filter @quran-corpus/data test -- mobile-entry.test.ts
pnpm --filter @quran-corpus/data type-check
```

Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run:

```bash
git diff -- packages/data/src/mobile.ts packages/data/package.json packages/data/tests/mobile-entry.test.ts
```

Expected: diff only contains the mobile entrypoint/export/test.

---

### Task 2: Expo SQLite Adapter Package

**Files:**
- Create: `packages/mobile-data/package.json`
- Create: `packages/mobile-data/tsconfig.json`
- Create: `packages/mobile-data/vitest.config.ts`
- Create: `packages/mobile-data/src/expoSqliteClient.ts`
- Create: `packages/mobile-data/src/index.ts`
- Test: `packages/mobile-data/tests/expoSqliteClient.test.ts`

**Interfaces:**
- Consumes: Expo SQLite-compatible `getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]>`.
- Produces:
  - `createExpoSqliteClient(db: ExpoSqliteLike): MobileDataClient`
  - `MobileDataClient.execute(statement: string | { sql: string; args?: SqlValue[] }): Promise<{ rows: MobileRow[] }>`

- [ ] **Step 1: Create package skeleton**

Create `packages/mobile-data/package.json`:

```json
{
  "name": "@quran-corpus/mobile-data",
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
    "@quran-corpus/data": "workspace:*"
  },
  "devDependencies": {
    "@quran-corpus/config": "workspace:*",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

Create `packages/mobile-data/tsconfig.json`:

```json
{
  "extends": "@quran-corpus/config/tsconfig/base",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["tests/**/*", "dist/**/*", "node_modules/**/*"]
}
```

Create `packages/mobile-data/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 2: Write failing adapter tests**

Create `packages/mobile-data/tests/expoSqliteClient.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createExpoSqliteClient } from '../src/expoSqliteClient';

describe('createExpoSqliteClient', () => {
  it('executes plain SQL strings through getAllAsync', async () => {
    const calls: unknown[] = [];
    const db = {
      async getAllAsync(sql: string, params?: unknown[]) {
        calls.push({ sql, params });
        return [{ id: 1, name_translit: 'Al-Fatihah' }];
      },
    };

    const client = createExpoSqliteClient(db);
    const result = await client.execute('SELECT * FROM surahs');

    expect(calls).toEqual([{ sql: 'SELECT * FROM surahs', params: [] }]);
    expect(result.rows).toEqual([{ id: 1, name_translit: 'Al-Fatihah' }]);
  });

  it('executes parameterized statements through getAllAsync', async () => {
    const calls: unknown[] = [];
    const db = {
      async getAllAsync(sql: string, params?: unknown[]) {
        calls.push({ sql, params });
        return [{ id: 7 }];
      },
    };

    const client = createExpoSqliteClient(db);
    const result = await client.execute({ sql: 'SELECT * FROM ayahs WHERE surah_id = ?', args: [1] });

    expect(calls).toEqual([{ sql: 'SELECT * FROM ayahs WHERE surah_id = ?', params: [1] }]);
    expect(result.rows).toEqual([{ id: 7 }]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @quran-corpus/mobile-data test`

Expected: FAIL because `createExpoSqliteClient` does not exist.

- [ ] **Step 4: Implement adapter**

Create `packages/mobile-data/src/expoSqliteClient.ts`:

```ts
export type SqlValue = string | number | boolean | null;
export type MobileRow = Record<string, SqlValue>;

export interface ExpoSqliteLike {
  getAllAsync<T extends MobileRow>(sql: string, params?: SqlValue[]): Promise<T[]>;
}

export interface MobileDataClient {
  execute(statement: string | { sql: string; args?: SqlValue[] }): Promise<{ rows: MobileRow[] }>;
}

export function createExpoSqliteClient(db: ExpoSqliteLike): MobileDataClient {
  return {
    async execute(statement) {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      const args = typeof statement === 'string' ? [] : (statement.args ?? []);
      const rows = await db.getAllAsync<MobileRow>(sql, args);
      return { rows };
    },
  };
}
```

Create `packages/mobile-data/src/index.ts`:

```ts
export {
  createExpoSqliteClient,
  type ExpoSqliteLike,
  type MobileDataClient,
  type MobileRow,
  type SqlValue,
} from './expoSqliteClient.js';
```

- [ ] **Step 5: Run tests and type-check**

Run:

```bash
pnpm --filter @quran-corpus/mobile-data test
pnpm --filter @quran-corpus/mobile-data type-check
```

Expected: PASS.

- [ ] **Step 6: Checkpoint**

Run:

```bash
git diff -- packages/mobile-data
```

Expected: diff only contains the new adapter package.

---

### Task 3: M0 Fixture DB Generator

**Files:**
- Modify: `packages/mobile-data/package.json`
- Create: `packages/mobile-data/scripts/create-m0-fixture-db.ts`
- Create generated artifact: `apps/mobile/assets/db/quran-m0.db`
- Test: `packages/mobile-data/tests/m0Fixture.test.ts`

**Interfaces:**
- Consumes: `packages/data/schema.sql`.
- Produces: `pnpm --filter @quran-corpus/mobile-data generate:m0-db`, which creates `apps/mobile/assets/db/quran-m0.db`.

- [ ] **Step 1: Add failing fixture test**

Create `packages/mobile-data/tests/m0Fixture.test.ts`:

```ts
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('M0 fixture DB artifact', () => {
  it('exists and is non-empty after generate:m0-db', async () => {
    const path = new URL('../../../apps/mobile/assets/db/quran-m0.db', import.meta.url);

    expect(existsSync(path)).toBe(true);
    expect((await stat(path)).size).toBeGreaterThan(1024);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @quran-corpus/mobile-data test -- m0Fixture.test.ts`

Expected: FAIL because `apps/mobile/assets/db/quran-m0.db` does not exist.

- [ ] **Step 3: Add generator script dependency and script**

Modify `packages/mobile-data/package.json`:

```json
"scripts": {
  "build": "tsc",
  "type-check": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "generate:m0-db": "tsx scripts/create-m0-fixture-db.ts"
},
"devDependencies": {
  "@quran-corpus/config": "workspace:*",
  "@types/node": "^22.0.0",
  "tsx": "^4.0.0",
  "typescript": "^5.5.0",
  "vitest": "^2.0.0"
}
```

Create `packages/mobile-data/scripts/create-m0-fixture-db.ts`:

```ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createDatabase } from '../../data/src/db.js';

const dbPath = resolve('../../apps/mobile/assets/db/quran-m0.db');
const schemaPath = resolve('../data/schema.sql');

async function main() {
  await mkdir(dirname(dbPath), { recursive: true });
  await writeFile(dbPath, '');

  const db = createDatabase(`file:${dbPath}`);
  const schema = await readFile(schemaPath, 'utf8');

  for (const statement of schema.split(';').map((s) => s.trim()).filter(Boolean)) {
    await db.execute(`${statement};`);
  }

  await db.batch([
    { sql: "INSERT INTO languages (code, name_native, name_english, direction) VALUES ('en','English','English','ltr')", args: [] },
    { sql: "INSERT INTO languages (code, name_native, name_english, direction) VALUES ('uz','O'zbek','Uzbek','ltr')", args: [] },
    { sql: "INSERT INTO languages (code, name_native, name_english, direction) VALUES ('ru','Русский','Russian','ltr')", args: [] },
    {
      sql: "INSERT INTO surahs (id, name_arabic, name_translit, name_translation, revelation_type, ayah_count, order_number) VALUES (1, 'الفاتحة', 'Al-Fatihah', 'The Opener', 'meccan', 7, 5)",
      args: [],
    },
    {
      sql: "INSERT INTO ayahs (id, surah_id, ayah_number, text_uthmani, text_simple, juz, page, audio_url) VALUES (1, 1, 1, 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ', 'بسم الله الرحمن الرحيم', 1, 1, NULL)",
      args: [],
    },
    {
      sql: "INSERT INTO ayahs (id, surah_id, ayah_number, text_uthmani, text_simple, juz, page, audio_url) VALUES (2, 1, 2, 'ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ', 'الحمد لله رب العالمين', 1, 1, NULL)",
      args: [],
    },
    { sql: "INSERT INTO translations (ayah_id, language_code, translator, text) VALUES (1, 'en', 'M0 fixture', 'In the name of Allah, the Entirely Merciful, the Especially Merciful.')", args: [] },
    { sql: "INSERT INTO translations (ayah_id, language_code, translator, text) VALUES (1, 'uz', 'M0 fixture', 'Mehribon va rahmli Alloh nomi bilan.')", args: [] },
    { sql: "INSERT INTO translations (ayah_id, language_code, translator, text) VALUES (1, 'ru', 'M0 fixture', 'Во имя Аллаха, Милостивого, Милующего.')", args: [] },
    { sql: "INSERT INTO translations (ayah_id, language_code, translator, text) VALUES (2, 'en', 'M0 fixture', 'All praise is for Allah, Lord of all worlds.')", args: [] },
    { sql: "INSERT INTO translations (ayah_id, language_code, translator, text) VALUES (2, 'uz', 'M0 fixture', 'Hamd olamlarning Robbi Allohgadir.')", args: [] },
    { sql: "INSERT INTO translations (ayah_id, language_code, translator, text) VALUES (2, 'ru', 'M0 fixture', 'Хвала Аллаху, Господу миров.')", args: [] },
    { sql: "INSERT INTO roots (id, root_buckwalter, root_arabic, occurrence_count, sort_order) VALUES (1, 'rHm', 'ر ح م', 339, 1)", args: [] },
    { sql: "INSERT INTO root_forms (root_id, sort_order, pos_label, form_arabic, form_translit, gloss, occurrence_count) VALUES (1, 1, 'Noun', 'رَحْمَٰن', 'rahman', 'merciful', 57)", args: [] },
    { sql: "INSERT INTO words (id, ayah_id, position, text_arabic, transliteration, root, lemma, root_buckwalter, lemma_buckwalter, pos_tag, morphology_json, morphology_description, grammar_arabic, grammar_note, audio_url) VALUES (1, 1, 1, 'بِسْمِ', 'bis''mi', NULL, 'اسم', NULL, 'som', 'N', NULL, 'prefixed preposition bi + genitive masculine noun', 'جار ومجرور', NULL, NULL)", args: [] },
    { sql: "INSERT INTO words (id, ayah_id, position, text_arabic, transliteration, root, lemma, root_buckwalter, lemma_buckwalter, pos_tag, morphology_json, morphology_description, grammar_arabic, grammar_note, audio_url) VALUES (2, 1, 2, 'ٱللَّهِ', 'l-lahi', NULL, 'الله', NULL, 'All~ah', 'PN', NULL, 'Allah, genitive proper noun', 'لفظ الجلالة مجرور', NULL, NULL)", args: [] },
    { sql: "INSERT INTO words (id, ayah_id, position, text_arabic, transliteration, root, lemma, root_buckwalter, lemma_buckwalter, pos_tag, morphology_json, morphology_description, grammar_arabic, grammar_note, audio_url) VALUES (3, 1, 3, 'ٱلرَّحْمَٰنِ', 'l-rahmani', 'ر ح م', 'رحمن', 'rHm', 'raHoma`n', 'ADJ', NULL, 'genitive masculine adjective', 'نعت مجرور', NULL, NULL)", args: [] },
    { sql: "INSERT INTO words (id, ayah_id, position, text_arabic, transliteration, root, lemma, root_buckwalter, lemma_buckwalter, pos_tag, morphology_json, morphology_description, grammar_arabic, grammar_note, audio_url) VALUES (4, 2, 1, 'ٱلْحَمْدُ', 'al-hamdu', NULL, 'حمد', NULL, 'Hamod', 'N', NULL, 'nominative masculine noun with definite article', 'مبتدأ مرفوع', NULL, NULL)", args: [] },
    { sql: "INSERT INTO words (id, ayah_id, position, text_arabic, transliteration, root, lemma, root_buckwalter, lemma_buckwalter, pos_tag, morphology_json, morphology_description, grammar_arabic, grammar_note, audio_url) VALUES (5, 2, 2, 'لِلَّهِ', 'lillahi', NULL, 'الله', NULL, 'All~ah', 'PN', NULL, 'preposition li + genitive proper noun', 'جار ومجرور', NULL, NULL)", args: [] },
    { sql: "INSERT INTO words (id, ayah_id, position, text_arabic, transliteration, root, lemma, root_buckwalter, lemma_buckwalter, pos_tag, morphology_json, morphology_description, grammar_arabic, grammar_note, audio_url) VALUES (6, 2, 3, 'رَبِّ', 'rabbi', NULL, 'رب', NULL, 'rab~', 'N', NULL, 'genitive masculine noun', 'مضاف إليه مجرور', NULL, NULL)", args: [] },
    { sql: "INSERT INTO words (id, ayah_id, position, text_arabic, transliteration, root, lemma, root_buckwalter, lemma_buckwalter, pos_tag, morphology_json, morphology_description, grammar_arabic, grammar_note, audio_url) VALUES (7, 2, 4, 'ٱلْعَٰلَمِينَ', 'al-alamina', NULL, 'عالم', NULL, 'Ea`lamiyn', 'N', NULL, 'genitive masculine plural noun', 'مضاف إليه مجرور', NULL, NULL)", args: [] },
    { sql: "INSERT INTO word_segments (word_id, segment_index, segment_type, pos_tag, form_arabic, form_buckwalter, features_json, lemma, root) VALUES (3, 1, 'prefix', 'DET', 'ٱل', 'Al', '{}', NULL, NULL)", args: [] },
    { sql: "INSERT INTO word_segments (word_id, segment_index, segment_type, pos_tag, form_arabic, form_buckwalter, features_json, lemma, root) VALUES (3, 2, 'stem', 'ADJ', 'رَّحْمَٰنِ', 'raHoma`ni', '{\"case\":\"genitive\"}', 'رحمن', 'ر ح م')", args: [] },
  ], 'write');

  await db.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 4: Generate fixture and verify test passes**

Run:

```bash
pnpm --filter @quran-corpus/mobile-data generate:m0-db
pnpm --filter @quran-corpus/mobile-data test -- m0Fixture.test.ts
```

Expected: PASS and `apps/mobile/assets/db/quran-m0.db` exists.

- [ ] **Step 5: Checkpoint**

Run:

```bash
git diff -- packages/mobile-data apps/mobile/assets/db/quran-m0.db
```

Expected: diff contains generator and fixture DB artifact only.

---

### Task 4: Expo Mobile App Scaffold

**Files:**
- Create: `apps/mobile/package.json`
- Create: `apps/mobile/app.json`
- Create: `apps/mobile/tsconfig.json`
- Create: `apps/mobile/babel.config.js`
- Create: `apps/mobile/metro.config.js`
- Create: `apps/mobile/eslint.config.mjs`
- Create: `apps/mobile/vitest.config.ts`
- Create: `apps/mobile/app/_layout.tsx`
- Create: `apps/mobile/app/index.tsx`

**Interfaces:**
- Consumes: workspace packages and Expo Router.
- Produces: an Expo app package with valid `lint`, `type-check`, `test`, `android`, and `dev` scripts.

- [ ] **Step 1: Scaffold Expo package with official template**

Run:

```bash
pnpm dlx create-expo-app@latest apps/mobile --template default
```

Expected:
- `apps/mobile/package.json` exists.
- Expo Router is installed by the template.
- TypeScript config exists.
- No nested lockfile remains under `apps/mobile`.

- [ ] **Step 2: Normalize package scripts and workspace dependencies**

Modify `apps/mobile/package.json` to keep Expo-generated native versions, add workspace deps, and use these scripts:

```json
{
  "name": "@quran-corpus/mobile",
  "version": "0.0.1",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "dev": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "lint": "eslint . --ext .ts,.tsx",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "build": "expo export --platform android --output-dir dist"
  },
  "dependencies": {
    "@quran-corpus/data": "workspace:*",
    "@quran-corpus/mobile-data": "workspace:*"
  },
  "devDependencies": {
    "@quran-corpus/config": "workspace:*",
    "@types/react": "~19.2.2",
    "@typescript-eslint/eslint-plugin": "^8.61.0",
    "@typescript-eslint/parser": "^8.61.0",
    "eslint": "^9.0.0",
    "typescript": "^5.5.0",
    "vitest": "^2.1.9"
  }
}
```

Run Expo's installer so native packages match the scaffolded SDK:

```bash
cd apps/mobile
pnpm expo install expo-asset expo-file-system expo-font expo-sqlite react-native-gesture-handler react-native-reanimated
pnpm add @gorhom/bottom-sheet
cd ../..
pnpm install
```

After the commands, `apps/mobile/package.json` must contain these dependency names:

```text
@gorhom/bottom-sheet
@quran-corpus/data
@quran-corpus/mobile-data
expo
expo-asset
expo-file-system
expo-font
expo-router
expo-sqlite
react
react-native
react-native-gesture-handler
react-native-reanimated
```

`@quran-corpus/*` entries must use `workspace:*`. Expo and React Native package versions must be the versions chosen by `create-expo-app` and `expo install`.

- [ ] **Step 3: Create app config files**

Create or replace `apps/mobile/app.json`:

```json
{
  "expo": {
    "name": "Quran Corpus",
    "slug": "quran-corpus-mobile",
    "scheme": "qurancorpus",
    "version": "0.0.1",
    "orientation": "portrait",
    "userInterfaceStyle": "automatic",
    "assetBundlePatterns": ["assets/**/*"],
    "android": {
      "package": "com.qurancorpus.mobile",
      "minSdkVersion": 26,
      "permissions": []
    },
    "plugins": ["expo-router", "expo-sqlite"]
  }
}
```

Create or replace `apps/mobile/tsconfig.json`:

```json
{
  "extends": "@quran-corpus/config/tsconfig/base",
  "compilerOptions": {
    "jsx": "react-jsx",
    "types": ["react", "react-native"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["app/**/*.ts", "app/**/*.tsx", "src/**/*.ts", "src/**/*.tsx", "expo-env.d.ts"]
}
```

Create `apps/mobile/vitest.config.ts`:

```ts
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Create Metro/Babel/ESLint config**

Create `apps/mobile/babel.config.js`:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-reanimated/plugin'],
  };
};
```

Create `apps/mobile/metro.config.js`:

```js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.assetExts.push('db');

module.exports = config;
```

Create `apps/mobile/eslint.config.mjs`:

```js
import base from '@quran-corpus/config/eslint';

export default [
  ...base,
  {
    ignores: ['dist/**', '.expo/**'],
  },
];
```

- [ ] **Step 5: Add minimal route files**

Create `apps/mobile/app/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

Create `apps/mobile/app/index.tsx`:

```tsx
import { Text, View } from 'react-native';

export default function IndexRoute() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Quran Corpus M0</Text>
    </View>
  );
}
```

- [ ] **Step 6: Verify app package type-checks**

Run:

```bash
pnpm --filter @quran-corpus/mobile type-check
pnpm --filter @quran-corpus/mobile lint
```

Expected: PASS.

- [ ] **Step 7: Checkpoint**

Run:

```bash
git diff -- apps/mobile package.json pnpm-lock.yaml
```

Expected: Expo app scaffold and lockfile changes only. The scaffold may include generated files not listed above; keep generated files only when Expo Router needs them and delete unused sample screens/assets.

---

### Task 5: Bundled DB And Arabic Font Bootstrap

**Files:**
- Copy: `apps/mobile/assets/fonts/hafs.18.woff2`
- Create: `apps/mobile/src/data/openCorpusDb.ts`
- Create: `apps/mobile/src/theme/tokens.ts`
- Modify: `apps/mobile/app/_layout.tsx`
- Test: `apps/mobile/src/data/openCorpusDb.test.ts`

**Interfaces:**
- Consumes: `apps/mobile/assets/db/quran-m0.db`, `apps/mobile/assets/fonts/hafs.18.woff2`.
- Produces:
  - `openCorpusDb(): Promise<SQLite.SQLiteDatabase>`
  - `loadCorpusFonts(): Promise<void>`

- [ ] **Step 1: Verify font asset**

Run:

```bash
test -f apps/mobile/assets/fonts/hafs.18.woff2
```

Expected: font file exists at `apps/mobile/assets/fonts/hafs.18.woff2`.

- [ ] **Step 2: Write failing path/unit test**

Create `apps/mobile/src/data/openCorpusDb.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { corpusDbAssetName, corpusDbFileName } from './openCorpusDb';

describe('openCorpusDb constants', () => {
  it('uses the bundled M0 DB asset name and stable local filename', () => {
    expect(corpusDbAssetName).toBe('quran-m0.db');
    expect(corpusDbFileName).toBe('quran-corpus.db');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @quran-corpus/mobile test -- openCorpusDb.test.ts`

Expected: FAIL because `openCorpusDb.ts` does not exist.

- [ ] **Step 4: Implement DB/font bootstrap**

Create `apps/mobile/src/data/openCorpusDb.ts`:

```ts
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { useFonts } from 'expo-font';

export const corpusDbAssetName = 'quran-m0.db';
export const corpusDbFileName = 'quran-corpus.db';

export async function openCorpusDb(): Promise<SQLite.SQLiteDatabase> {
  const sqliteDir = `${FileSystem.documentDirectory}SQLite`;
  const targetPath = `${sqliteDir}/${corpusDbFileName}`;

  await FileSystem.makeDirectoryAsync(sqliteDir, { intermediates: true });
  const info = await FileSystem.getInfoAsync(targetPath);

  if (!info.exists) {
    const asset = Asset.fromModule(require('../../assets/db/quran-m0.db'));
    await asset.downloadAsync();
    if (!asset.localUri) throw new Error('Bundled corpus DB asset did not resolve to a local URI');
    await FileSystem.copyAsync({ from: asset.localUri, to: targetPath });
  }

  return SQLite.openDatabaseSync(corpusDbFileName);
}

export function useCorpusFonts(): [boolean, Error | null] {
  return useFonts({
    Hafs: require('../../assets/fonts/hafs.18.woff2'),
  });
}
```

Create `apps/mobile/src/theme/tokens.ts`:

```ts
export const colors = {
  paper: '#faf8f3',
  ink: '#1f1a14',
  muted: '#7b7165',
  accent: '#1f6f5b',
  night: '#151412',
  nightText: '#f1ede4',
};
```

Modify `apps/mobile/app/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useCorpusFonts } from '@/data/openCorpusDb';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useCorpusFonts();

  if (fontError) throw fontError;
  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 5: Run test/type-check**

Run:

```bash
pnpm --filter @quran-corpus/mobile test -- openCorpusDb.test.ts
pnpm --filter @quran-corpus/mobile type-check
```

Expected: PASS.

- [ ] **Step 6: Checkpoint**

Run:

```bash
git diff -- apps/mobile/assets apps/mobile/src/data apps/mobile/src/theme apps/mobile/app/_layout.tsx
```

Expected: bootstrap code and assets only.

---

### Task 6: Mobile Repository Over Fixture DB

**Files:**
- Create: `apps/mobile/src/i18n/languages.ts`
- Create: `apps/mobile/src/data/corpusRepository.ts`
- Test: `apps/mobile/src/data/corpusRepository.test.ts`

**Interfaces:**
- Consumes: `createExpoSqliteClient()`, `@quran-corpus/data/mobile` query functions.
- Produces:
  - `type ContentLanguageCode = 'en' | 'uz' | 'ru'`
  - `contentLanguages`
  - `getM0SurahReader(client, languageCode)`
  - `getM0WordDetail(client, wordId)`

- [ ] **Step 1: Add failing repository tests with fake client**

Create `apps/mobile/src/data/corpusRepository.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { contentLanguages } from '../i18n/languages';

describe('contentLanguages', () => {
  it('ships English, Uzbek, and Russian in a scalable metadata shape', () => {
    expect(contentLanguages.map((l) => l.code)).toEqual(['en', 'uz', 'ru']);
    expect(contentLanguages.every((l) => l.label.length > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @quran-corpus/mobile test -- corpusRepository.test.ts`

Expected: FAIL because `languages.ts` does not exist.

- [ ] **Step 3: Implement language metadata**

Create `apps/mobile/src/i18n/languages.ts`:

```ts
export type ContentLanguageCode = 'en' | 'uz' | 'ru';

export interface ContentLanguage {
  code: ContentLanguageCode;
  label: string;
  nativeLabel: string;
  direction: 'ltr' | 'rtl';
}

export const contentLanguages: ContentLanguage[] = [
  { code: 'en', label: 'English', nativeLabel: 'English', direction: 'ltr' },
  { code: 'uz', label: 'Uzbek', nativeLabel: "O'zbek", direction: 'ltr' },
  { code: 'ru', label: 'Russian', nativeLabel: 'Русский', direction: 'ltr' },
];
```

- [ ] **Step 4: Implement repository functions**

Create `apps/mobile/src/data/corpusRepository.ts`:

```ts
import type { MobileDataClient } from '@quran-corpus/mobile-data';
import {
  getAyahsBySurah,
  getSegmentsByWordIds,
  getTranslationsBySurahAndLang,
  getWordsBySurah,
  getWordDetail,
  type Ayah,
  type Translation,
  type Word,
  type WordDetail,
  type WordSegment,
} from '@quran-corpus/data/mobile';
import type { ContentLanguageCode } from '../i18n/languages';

export interface ReaderAyah {
  ayah: Ayah;
  translation: Translation | null;
  words: Word[];
}

export interface SurahReaderData {
  surahId: number;
  ayahs: ReaderAyah[];
}

export async function getM0SurahReader(
  client: MobileDataClient,
  languageCode: ContentLanguageCode,
): Promise<SurahReaderData> {
  const db = client as never;
  const [ayahs, words, translations] = await Promise.all([
    getAyahsBySurah(db, 1),
    getWordsBySurah(db, 1),
    getTranslationsBySurahAndLang(db, 1, languageCode),
  ]);

  return {
    surahId: 1,
    ayahs: ayahs.map((ayah) => ({
      ayah,
      translation: translations.find((t) => t.ayah_id === ayah.id) ?? null,
      words: words.filter((w) => w.ayah_id === ayah.id),
    })),
  };
}

export interface MobileWordDetail {
  detail: WordDetail | null;
  segments: WordSegment[];
}

export async function getM0WordDetail(
  client: MobileDataClient,
  wordId: number,
): Promise<MobileWordDetail> {
  const db = client as never;
  const detail = await getWordDetail(db, wordId);
  const segments = detail ? await getSegmentsByWordIds(db, [detail.word.id]) : [];
  return { detail, segments };
}
```

- [ ] **Step 5: Run tests/type-check**

Run:

```bash
pnpm --filter @quran-corpus/mobile test -- corpusRepository.test.ts
pnpm --filter @quran-corpus/mobile type-check
```

Expected: PASS.

- [ ] **Step 6: Checkpoint**

Run:

```bash
git diff -- apps/mobile/src/i18n apps/mobile/src/data/corpusRepository.ts apps/mobile/src/data/corpusRepository.test.ts
```

Expected: repository and language metadata only.

---

### Task 7: Reader Screen And Word Detail Sheet

**Files:**
- Create: `apps/mobile/src/components/SegmentPills.tsx`
- Create: `apps/mobile/src/components/WordDetailSheet.tsx`
- Create: `apps/mobile/src/components/ReaderScreen.tsx`
- Modify: `apps/mobile/app/index.tsx`

**Interfaces:**
- Consumes: `getM0SurahReader()`, `getM0WordDetail()`, `openCorpusDb()`, `createExpoSqliteClient()`.
- Produces: runnable M0 screen proving Arabic render, language switch, word tap, and bottom sheet.

- [ ] **Step 1: Implement segment pills**

Create `apps/mobile/src/components/SegmentPills.tsx`:

```tsx
import { Text, View } from 'react-native';
import type { WordSegment } from '@quran-corpus/data/mobile';
import { colors } from '@/theme/tokens';

export function SegmentPills({ segments }: { segments: WordSegment[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {segments.map((segment) => (
        <View
          key={segment.id}
          style={{ borderRadius: 999, backgroundColor: '#ede6d8', paddingHorizontal: 10, paddingVertical: 6 }}
        >
          <Text style={{ color: colors.ink }}>
            {segment.pos_tag ?? segment.segment_type ?? 'segment'}
          </Text>
        </View>
      ))}
    </View>
  );
}
```

- [ ] **Step 2: Implement word detail sheet**

Create `apps/mobile/src/components/WordDetailSheet.tsx`:

```tsx
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { forwardRef } from 'react';
import { Text, View } from 'react-native';
import type { MobileWordDetail } from '@/data/corpusRepository';
import { colors } from '@/theme/tokens';
import { SegmentPills } from './SegmentPills';

export const WordDetailSheet = forwardRef<BottomSheet, { wordDetail: MobileWordDetail | null }>(
  function WordDetailSheet({ wordDetail }, ref) {
    return (
      <BottomSheet ref={ref} index={-1} snapPoints={['45%', '80%']} enablePanDownToClose>
        <BottomSheetScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          {!wordDetail?.detail ? (
            <Text>No word selected.</Text>
          ) : (
            <View style={{ gap: 12 }}>
              <Text style={{ fontFamily: 'Hafs', fontSize: 42, color: colors.ink, textAlign: 'right' }}>
                {wordDetail.detail.word.text_arabic}
              </Text>
              <Text style={{ fontSize: 18, color: colors.ink }}>{wordDetail.detail.word.transliteration}</Text>
              <Text style={{ color: colors.muted }}>{wordDetail.detail.word.morphology_description}</Text>
              <SegmentPills segments={wordDetail.segments} />
            </View>
          )}
        </BottomSheetScrollView>
      </BottomSheet>
    );
  },
);
```

- [ ] **Step 3: Implement reader screen**

Create `apps/mobile/src/components/ReaderScreen.tsx`:

```tsx
import BottomSheet from '@gorhom/bottom-sheet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { createExpoSqliteClient } from '@quran-corpus/mobile-data';
import { getM0SurahReader, getM0WordDetail, type MobileWordDetail, type SurahReaderData } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { contentLanguages, type ContentLanguageCode } from '@/i18n/languages';
import { colors } from '@/theme/tokens';
import { WordDetailSheet } from './WordDetailSheet';

export function ReaderScreen() {
  const [language, setLanguage] = useState<ContentLanguageCode>('en');
  const [data, setData] = useState<SurahReaderData | null>(null);
  const [wordDetail, setWordDetail] = useState<MobileWordDetail | null>(null);
  const sheetRef = useRef<BottomSheet>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const db = await openCorpusDb();
      const client = createExpoSqliteClient(db);
      const reader = await getM0SurahReader(client, language);
      if (!cancelled) setData(reader);
    }
    load().catch(console.error);
    return () => { cancelled = true; };
  }, [language]);

  const selectedLanguage = useMemo(
    () => contentLanguages.find((item) => item.code === language)!,
    [language],
  );

  async function selectWord(wordId: number) {
    const db = await openCorpusDb();
    const client = createExpoSqliteClient(db);
    setWordDetail(await getM0WordDetail(client, wordId));
    sheetRef.current?.snapToIndex(0);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
        <Text style={{ color: colors.muted }}>Quran Corpus M0</Text>
        <Text style={{ fontFamily: 'Hafs', fontSize: 48, color: colors.ink, textAlign: 'right' }}>الفاتحة</Text>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          {contentLanguages.map((item) => (
            <Pressable
              key={item.code}
              onPress={() => setLanguage(item.code)}
              style={{
                borderRadius: 999,
                paddingHorizontal: 14,
                paddingVertical: 8,
                backgroundColor: item.code === language ? colors.accent : '#ede6d8',
              }}
            >
              <Text style={{ color: item.code === language ? 'white' : colors.ink }}>{item.nativeLabel}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={{ color: colors.muted }}>Translation: {selectedLanguage.label}</Text>

        {data?.ayahs.map(({ ayah, translation, words }) => (
          <View key={ayah.id} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 }}>
              {words.map((word) => (
                <Pressable key={word.id} onPress={() => selectWord(word.id)}>
                  <Text style={{ fontFamily: 'Hafs', fontSize: 34, color: colors.ink }}>
                    {word.text_arabic}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={{ color: colors.ink }}>{translation?.text}</Text>
          </View>
        ))}
      </ScrollView>
      <WordDetailSheet ref={sheetRef} wordDetail={wordDetail} />
    </View>
  );
}
```

- [ ] **Step 4: Wire index route**

Modify `apps/mobile/app/index.tsx`:

```tsx
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ReaderScreen } from '@/components/ReaderScreen';

export default function IndexRoute() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ReaderScreen />
    </GestureHandlerRootView>
  );
}
```

- [ ] **Step 5: Verify type-check**

Run: `pnpm --filter @quran-corpus/mobile type-check`

Expected: PASS.

- [ ] **Step 6: Run on Android**

Run: `pnpm --filter @quran-corpus/mobile android`

Expected on emulator/device:
- App opens to "Quran Corpus M0".
- Arabic title and words render using the Hafs font.
- Language chips switch English/Uzbek/Russian translations.
- Tapping `ٱلرَّحْمَٰنِ` opens the bottom sheet with morphology and segment pills.

- [ ] **Step 7: Capture manual verification notes**

Create or append to `docs/plans/phase-m0-mobile-technical-spike.md` under "M0 Verification Log" after execution:

```markdown
## M0 Verification Log

- Android device/emulator:
- Command used:
- Arabic font rendered: yes/no
- Bundled DB opened offline: yes/no
- Word sheet opened: yes/no
- Notes:
```

Expected: log contains actual device/emulator name and results.

---

### Task 8: Abdul Rashid Sufi Audio Client Contract

**Files:**
- Create: `apps/mobile/src/api/audio.ts`

**Interfaces:**
- Produces:
  - Mobile helper `getAyahAudioUrl(baseUrl, surah, ayah)`
  - Expected backend contract: `GET /api/v1/audio/ayah?reciter=abdul-rashid-sufi&surah=1&ayah=1`
  - Expected JSON response `{ reciter, surah, ayah, url, duration_ms, source, attribution }`

- [ ] **Step 1: Write failing mobile client tests**

Create or extend `apps/mobile/src/api/audio.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getAyahAudioUrl } from './audio';

describe('getAyahAudioUrl', () => {
  it('fetches Abdul Rashid Sufi audio metadata for a valid ayah', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        reciter: 'abdul-rashid-sufi',
        surah: 1,
        ayah: 1,
        url: '/api/v1/audio/file/abdul-rashid-sufi/001001.mp3',
        duration_ms: null,
        source: 'quranic-universal-audio/quranicaudio',
        attribution: 'Audio: Abdur-Rashid Sufi via Quranic Universal Audio and QuranicAudio.',
      }),
    }));

    const result = await getAyahAudioUrl('https://qurancorpus.app', 1, 1, fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://qurancorpus.app/api/v1/audio/ayah?reciter=abdul-rashid-sufi&surah=1&ayah=1'),
    );
    expect(result.reciter).toBe('abdul-rashid-sufi');
  });

  it('throws when the endpoint rejects the ayah request', async () => {
    await expect(
      getAyahAudioUrl('https://qurancorpus.app', 0, 1, vi.fn(async () => ({ ok: false, status: 400 }))),
    ).rejects.toThrow('Audio endpoint failed: 400');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @quran-corpus/mobile test -- audio.test.ts`

Expected: FAIL because client helper does not exist.

- [ ] **Step 3: Add mobile client helper**

Create `apps/mobile/src/api/audio.ts`:

```ts
export interface AyahAudioResponse {
  reciter: 'abdul-rashid-sufi';
  surah: number;
  ayah: number;
  url: string;
  duration_ms: number | null;
  source: string;
  attribution: string;
}

export async function getAyahAudioUrl(
  baseUrl: string,
  surah: number,
  ayah: number,
  fetchImpl: typeof fetch = fetch,
): Promise<AyahAudioResponse> {
  const url = new URL('/api/v1/audio/ayah', baseUrl);
  url.searchParams.set('reciter', 'abdul-rashid-sufi');
  url.searchParams.set('surah', String(surah));
  url.searchParams.set('ayah', String(ayah));

  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Audio endpoint failed: ${response.status}`);
  return (await response.json()) as AyahAudioResponse;
}
```

- [ ] **Step 4: Run mobile tests**

Run:

```bash
pnpm --filter @quran-corpus/mobile test -- audio.test.ts
pnpm --filter @quran-corpus/mobile type-check
```

Expected: PASS.

- [ ] **Step 5: Checkpoint**

Run:

```bash
git diff -- apps/mobile/src/api/audio.ts apps/mobile/src/api/audio.test.ts
```

Expected: mobile audio client contract only.

Backend note: this mobile repo does not implement the thin audio endpoint. The backend/API repo must provide the contract above before real playback ships.

---

### Task 9: M0 Verification And Documentation

**Files:**
- Modify: `docs/plans/phase-m0-mobile-technical-spike.md`
- Modify: `docs/PRD-android-first-mobile-app.md` only if M0 finds a required scope correction.

**Interfaces:**
- Consumes: outputs from Tasks 1-8.
- Produces: a verification log and final M0 risk list.

- [ ] **Step 1: Run full quality checks**

Run:

```bash
pnpm build
pnpm lint
pnpm type-check
pnpm test
```

Expected: all commands exit 0.

- [ ] **Step 2: Run Android smoke**

Run: `pnpm --filter @quran-corpus/mobile android`

Expected:
- app opens on emulator/device;
- Surah 1 renders from bundled DB after network is disabled;
- English, Uzbek, Russian language chips render and switch;
- tapping a word opens bottom sheet;
- Arabic font is visible and not replaced by fallback boxes.

- [ ] **Step 3: Measure artifact sizes**

Run:

```bash
du -h apps/mobile/assets/db/quran-m0.db
pnpm --filter @quran-corpus/mobile build
du -sh apps/mobile/dist
```

Expected:
- fixture DB size is recorded;
- exported Android bundle directory size is recorded;
- M0 notes state that final full-DB AAB size must be remeasured when the real corpus DB artifact exists.

- [ ] **Step 4: Append verification log**

Append:

```markdown
## M0 Verification Log

- Date:
- Android device/emulator:
- Node version:
- pnpm version:
- `pnpm build`: pass/fail
- `pnpm lint`: pass/fail
- `pnpm type-check`: pass/fail
- `pnpm test`: pass/fail
- `pnpm --filter @quran-corpus/mobile android`: pass/fail
- Arabic font rendered: yes/no
- Bundled DB opened with network disabled: yes/no
- Word detail sheet opened: yes/no
- Fixture DB size:
- `apps/mobile/dist` size:
- Remaining M0 risks:
```

Fill every field with actual values from this run.

## M0 Verification Log

- Date: 2026-07-28
- Android device/emulator: not available in this environment
- Node version: v22.23.1
- pnpm version: 10.34.3
- `pnpm build`: pass after fix `89c3037`; first run failed because Metro did not treat `.woff2` as an asset, then passed after adding `woff2` to `apps/mobile/metro.config.js`
- `pnpm lint`: pass
- `pnpm type-check`: pass
- `pnpm test`: pass
- `pnpm --filter @quran-corpus/mobile android`: fail; `ANDROID_HOME` is unset, default `/root/Android/Sdk` does not exist, and `adb` is not on `PATH`
- Arabic font rendered: not manually verified on Android; `pnpm --filter @quran-corpus/mobile build` includes `assets/fonts/hafs.18.woff2`
- Bundled DB opened with network disabled: not manually verified on Android; `pnpm --filter @quran-corpus/mobile build` includes `assets/db/quran-m0.db`
- Word detail sheet opened: not manually verified on Android
- Fixture DB size: 176K
- `apps/mobile/dist` size: 5.3M
- Remaining M0 risks: Android device smoke remains required; bottom-sheet gestures, Hafs rendering on device, offline DB copy/open behavior, and real full-corpus AAB size must be verified on an Android emulator/device. CodeRabbit review remains required on the PR before merge. The audio endpoint still returns the intentional M0 `/api/v1/audio/file/...` stub; production resolver hardening is required before Play Store release.

- [ ] **Step 5: Self-review**

Run:

```bash
git diff --stat
git diff --check
```

Expected:
- `git diff --check` exits 0;
- diff stat matches M0 scope only.

- [ ] **Step 6: Repo review gate**

Follow `CLAUDE.md`:
- self-review diff against DRY/SOLID/OWASP;
- ask user to run `/code-review`;
- fix review findings;
- open/update PR and wait for CodeRabbit;
- fix `CHANGES_REQUESTED` and blocking errors;
- final review.

Expected: no unhandled review findings before merge.

---

## M0 Acceptance Criteria

- `apps/mobile` exists and is included in pnpm workspace/Turbo checks.
- `@quran-corpus/data/mobile` exists and avoids Node/libSQL runtime exports.
- `@quran-corpus/mobile-data` adapts Expo SQLite to the existing query shape.
- `apps/mobile/assets/db/quran-m0.db` is generated by a script, not hand-built.
- Android app opens on emulator/device.
- Arabic Hafs font renders in the native app.
- App reads Surah 1 data from bundled SQLite with network disabled.
- English, Uzbek, and Russian language options exist in scalable metadata.
- Word tap opens a bottom sheet with morphology and segment pills.
- Thin audio endpoint contract exists for Abdul Rashid Sufi.
- Full quality commands pass or the verification log records the exact failing command and blocker.

## Risks And Rollback

- **Expo package versions drift:** use `pnpm dlx expo install <package>` during implementation if Expo reports mismatched native package versions. Keep the plan's dependency names, but let Expo choose compatible exact versions.
- **`expo-sqlite` API mismatch:** if `openDatabaseSync` or `getAllAsync` signatures differ, update only `apps/mobile/src/data/openCorpusDb.ts` and `packages/mobile-data/src/expoSqliteClient.ts`; keep repository interfaces stable.
- **Metro workspace resolution failure:** rollback is deleting `apps/mobile/metro.config.js` changes and using Expo's default config, then re-add monorepo config one setting at a time.
- **Fixture DB generated with invalid SQL:** rollback is deleting `apps/mobile/assets/db/quran-m0.db`, fixing generator inserts, and rerunning `generate:m0-db`.
- **Arabic font unsupported format:** use Expo font loading with the copied `.woff2`; if Android rejects it, convert to `.ttf` in a separate, reviewed asset task and document the source font unchanged.
- **Thin audio endpoint URL stub mistaken for production:** endpoint response includes source/attribution and tests only contract shape. Production resolver belongs to a later audio-source hardening task before Play Store release.

## References

- Expo create app/default TypeScript + Expo Router template: https://docs.expo.dev/more/create-expo/
- Expo SQLite API: https://docs.expo.dev/versions/latest/sdk/sqlite/
- Expo local-first guidance: https://docs.expo.dev/guides/local-first/
- Expo assets guide: https://docs.expo.dev/develop/user-interface/assets/
- Expo app config reference: https://docs.expo.dev/versions/latest/config/app/
- Expo Router introduction: https://docs.expo.dev/router/introduction/
