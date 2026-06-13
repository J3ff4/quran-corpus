# Phase 01: Monorepo Scaffold + Data Layer + Scraper Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the full monorepo structure, shared config, typed SQLite data-access layer, Python scraper scaffold, and a bare-bones Next.js PWA shell — everything needed before any feature work begins.

**Architecture:** pnpm workspaces + Turborepo monorepo. `packages/config` provides shared TS/lint/Tailwind/Prettier config. `packages/data` owns the canonical schema (schema.sql at package root), a `@libsql/client`-based DAL, and Vitest tests. `packages/scraper` is a standalone Python package (uv, Playwright, Pydantic) that reads the same `schema.sql` to write the same SQLite file. `apps/web` is a Next.js 15 App Router shell that imports from `packages/data`. The `.db` file is never committed.

**Tech Stack:** pnpm 9+, Turborepo 2+, Node 20+, TypeScript 5.5+, Next.js 15 (App Router), Tailwind CSS 3, @libsql/client 0.14+, Vitest 2+, Python 3.12+, uv 0.4+, Playwright (Python), BeautifulSoup4, Pydantic v2, pytest 8+

---

## File Map

```
/
├── package.json                         # pnpm workspace root + turbo scripts
├── pnpm-workspace.yaml
├── turbo.json
├── .gitignore
├── .nvmrc                               # pins Node 20
├── .prettierrc.js                       # delegates to packages/config/prettier
├── apps/
│   └── web/
│       ├── package.json
│       ├── tsconfig.json                # extends packages/config/tsconfig/nextjs
│       ├── next.config.ts               # security headers
│       ├── tailwind.config.ts
│       ├── postcss.config.mjs
│       ├── public/
│       │   └── manifest.json            # PWA manifest
│       └── src/
│           ├── app/
│           │   ├── layout.tsx
│           │   ├── page.tsx             # redirects to /surah
│           │   └── globals.css
│           └── lib/
│               └── db.ts                # singleton db for web (reads DATABASE_URL env)
├── packages/
│   ├── config/
│   │   ├── package.json
│   │   ├── tsconfig/base.json
│   │   ├── tsconfig/nextjs.json
│   │   ├── eslint/index.js
│   │   ├── tailwind/preset.ts
│   │   └── prettier/index.js
│   ├── data/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   ├── schema.sql                   # canonical DDL — shared with Python scraper
│   │   ├── src/
│   │   │   ├── index.ts                 # barrel export
│   │   │   ├── types.ts                 # all domain types
│   │   │   ├── db.ts                    # createDatabase factory
│   │   │   ├── migrate.ts               # migration runner (reads ../schema.sql)
│   │   │   └── queries/
│   │   │       ├── surahs.ts
│   │   │       ├── ayahs.ts
│   │   │       ├── words.ts
│   │   │       └── translations.ts
│   │   └── tests/
│   │       ├── types.test.ts
│   │       ├── migrate.test.ts
│   │       ├── surahs.test.ts
│   │       ├── ayahs.test.ts
│   │       └── translations.test.ts
│   └── scraper/
│       ├── pyproject.toml
│       ├── scraper/
│       │   ├── __init__.py
│       │   ├── models.py                # Pydantic models mirroring types.ts
│       │   ├── checkpoint.py            # resumable progress state
│       │   ├── db.py                    # ScraperDatabase — reads packages/data/schema.sql
│       │   ├── cli.py                   # Click CLI entry point
│       │   └── sources/
│       │       ├── __init__.py
│       │       ├── corpus_quran.py      # stub — implemented Phase 2
│       │       ├── tanzil.py            # stub — implemented Phase 2
│       │       └── quranenc.py          # stub — implemented Phase 2
│       └── tests/
│           ├── __init__.py
│           ├── test_models.py
│           └── test_db.py
└── docs/plans/phase-01-scaffold.md
```

---

## Task 1: Root Monorepo Infrastructure

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `.gitignore`
- Create: `.nvmrc`

- [ ] **Step 1: Verify pnpm and Node versions**

```bash
node --version   # should be 20+
pnpm --version   # should be 9+
```

If pnpm missing: `npm install -g pnpm@latest`

- [ ] **Step 2: Create package.json**

```json
{
  "name": "quran-corpus-pwa",
  "private": true,
  "version": "0.0.1",
  "engines": {
    "node": ">=20",
    "pnpm": ">=9"
  },
  "scripts": {
    "build": "turbo build",
    "dev": "turbo dev --parallel",
    "lint": "turbo lint",
    "type-check": "turbo type-check",
    "test": "turbo test",
    "format": "prettier --write \"**/*.{ts,tsx,js,mjs,json,css,md}\" --ignore-path .gitignore"
  },
  "devDependencies": {
    "@quran-corpus/config": "workspace:*",
    "prettier": "^3.3.3",
    "turbo": "^2.3.0"
  }
}
```

- [ ] **Step 3: Create pnpm-workspace.yaml**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

- [ ] **Step 4: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".env*"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^lint"]
    },
    "type-check": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    }
  }
}
```

- [ ] **Step 5: Create .gitignore**

```gitignore
# Dependencies
node_modules/
.pnpm-store/

# Build outputs
.next/
dist/
out/

# Database files — data artifacts stay out of git
*.db
*.db-shm
*.db-wal
raw-scrape/
checkpoint.json

# Environment
.env
.env.local
.env.*.local

# Python
__pycache__/
*.pyc
*.pyo
.venv/
*.egg-info/
.pytest_cache/
.ruff_cache/
.mypy_cache/

# OS
.DS_Store
Thumbs.db

# Turbo
.turbo/

# Editor
.vscode/settings.json
.idea/
```

- [ ] **Step 6: Create .nvmrc**

```
20
```

- [ ] **Step 7: Create required directories**

```bash
mkdir -p apps/web/src/app apps/web/src/lib apps/web/public/icons
mkdir -p packages/config/tsconfig packages/config/eslint packages/config/tailwind packages/config/prettier
mkdir -p packages/data/src/queries packages/data/tests
mkdir -p packages/scraper/scraper/sources packages/scraper/tests
```

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json .gitignore .nvmrc
git commit -m "chore: initialize pnpm + turborepo monorepo root"
```

---

## Task 2: packages/config — Shared Tooling

**Files:**
- Create: `packages/config/package.json`
- Create: `packages/config/tsconfig/base.json`
- Create: `packages/config/tsconfig/nextjs.json`
- Create: `packages/config/prettier/index.js`
- Create: `packages/config/eslint/index.js`
- Create: `packages/config/tailwind/preset.ts`

- [ ] **Step 1: Create packages/config/package.json**

```json
{
  "name": "@quran-corpus/config",
  "version": "0.0.1",
  "private": true,
  "exports": {
    "./tsconfig/base": "./tsconfig/base.json",
    "./tsconfig/nextjs": "./tsconfig/nextjs.json",
    "./eslint": "./eslint/index.js",
    "./tailwind/preset": "./tailwind/preset.ts",
    "./prettier": "./prettier/index.js"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.0.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: Create packages/config/tsconfig/base.json**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 3: Create packages/config/tsconfig/nextjs.json**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "./base.json",
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "ESNext"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

- [ ] **Step 4: Create packages/config/prettier/index.js**

```js
/** @type {import('prettier').Config} */
const config = {
  semi: true,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: 'all',
  printWidth: 100,
  plugins: ['prettier-plugin-tailwindcss'],
};

module.exports = config;
```

- [ ] **Step 5: Create packages/config/eslint/index.js**

```js
/** @type {import('eslint').Linter.Config[]} */
const config = [
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
];

module.exports = config;
```

- [ ] **Step 6: Create packages/config/tailwind/preset.ts**

Custom warm paper / deep night color system per PRD §4.2.

```ts
import type { Config } from 'tailwindcss';

const preset: Partial<Config> = {
  theme: {
    extend: {
      fontFamily: {
        arabic: ['var(--font-arabic)', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      colors: {
        paper: {
          50: '#faf8f3',
          100: '#f3efe6',
          200: '#e8e0d0',
          300: '#d4c9b0',
          400: '#b8a88a',
          500: '#9e8c6e',
          600: '#7d6d52',
          700: '#5e5040',
          800: '#3e3429',
          900: '#1f1a14',
        },
        night: {
          50: '#2a2a2a',
          100: '#242424',
          200: '#1e1e1e',
          300: '#181818',
          400: '#141414',
          500: '#111111',
          600: '#0e0e0e',
          700: '#0a0a0a',
          800: '#080808',
          900: '#050505',
        },
      },
    },
  },
};

export default preset;
```

- [ ] **Step 7: Install packages/config dependencies**

```bash
cd packages/config && pnpm install
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/config/
git commit -m "chore(config): add shared tsconfig, eslint, tailwind preset, prettier config"
```

---

## Task 3: packages/data — Types and Schema

**Files:**
- Create: `packages/data/package.json`
- Create: `packages/data/tsconfig.json`
- Create: `packages/data/vitest.config.ts`
- Create: `packages/data/src/types.ts`
- Create: `packages/data/schema.sql`  ← at package root, not in src/

- [ ] **Step 1: Create packages/data/package.json**

```json
{
  "name": "@quran-corpus/data",
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
    "@libsql/client": "^0.14.0"
  },
  "devDependencies": {
    "@quran-corpus/config": "workspace:*",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create packages/data/tsconfig.json**

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

- [ ] **Step 3: Create packages/data/vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
  },
});
```

- [ ] **Step 4: Write the failing type test**

Create `packages/data/tests/types.test.ts`:
```ts
import { describe, it, expectTypeOf } from 'vitest';
import type { Surah, Ayah, Word, Language, Translation, WordGloss } from '../src/types.js';

describe('types', () => {
  it('Surah has correct shape', () => {
    expectTypeOf<Surah>().toHaveProperty('id').toBeNumber();
    expectTypeOf<Surah>().toHaveProperty('revelation_type').toEqualTypeOf<'meccan' | 'medinan'>();
    expectTypeOf<Surah>().toHaveProperty('ayah_count').toBeNumber();
  });

  it('Ayah nullable fields are typed correctly', () => {
    expectTypeOf<Ayah>().toHaveProperty('text_simple').toEqualTypeOf<string | null>();
    expectTypeOf<Ayah>().toHaveProperty('audio_url').toEqualTypeOf<string | null>();
  });

  it('Language direction is constrained', () => {
    expectTypeOf<Language>().toHaveProperty('direction').toEqualTypeOf<'ltr' | 'rtl'>();
  });

  it('Word nullable fields are typed correctly', () => {
    expectTypeOf<Word>().toHaveProperty('root').toEqualTypeOf<string | null>();
    expectTypeOf<Word>().toHaveProperty('morphology_json').toEqualTypeOf<string | null>();
  });
});
```

- [ ] **Step 5: Install packages/data dependencies**

```bash
cd packages/data && pnpm install
```

- [ ] **Step 6: Run test to verify it fails**

```bash
cd packages/data && pnpm test tests/types.test.ts
```
Expected: FAIL — `Cannot find module '../src/types.js'`

- [ ] **Step 7: Create packages/data/src/types.ts**

```ts
export interface Surah {
  id: number;
  name_arabic: string;
  name_translit: string;
  name_translation: string;
  revelation_type: 'meccan' | 'medinan';
  ayah_count: number;
  order_number: number;
}

export interface Ayah {
  id: number;
  surah_id: number;
  ayah_number: number;
  text_uthmani: string;
  text_simple: string | null;
  juz: number | null;
  page: number | null;
  audio_url: string | null;
}

export interface Word {
  id: number;
  ayah_id: number;
  position: number;
  text_arabic: string;
  transliteration: string | null;
  root: string | null;
  lemma: string | null;
  pos_tag: string | null;
  morphology_json: string | null;
}

export interface Language {
  code: string;
  name_native: string;
  name_english: string;
  direction: 'ltr' | 'rtl';
}

export interface Translation {
  id: number;
  ayah_id: number;
  language_code: string;
  translator: string;
  text: string;
}

export interface WordGloss {
  id: number;
  word_id: number;
  language_code: string;
  gloss_text: string;
}
```

- [ ] **Step 8: Create packages/data/schema.sql**

Lives at the package root (not in src/) so both migrate.ts and the Python scraper can resolve it without dist/ path confusion.

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS surahs (
  id               INTEGER PRIMARY KEY,
  name_arabic      TEXT    NOT NULL,
  name_translit    TEXT    NOT NULL,
  name_translation TEXT    NOT NULL,
  revelation_type  TEXT    NOT NULL CHECK(revelation_type IN ('meccan', 'medinan')),
  ayah_count       INTEGER NOT NULL,
  order_number     INTEGER NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS ayahs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  surah_id     INTEGER NOT NULL REFERENCES surahs(id) ON DELETE CASCADE,
  ayah_number  INTEGER NOT NULL,
  text_uthmani TEXT    NOT NULL,
  text_simple  TEXT,
  juz          INTEGER CHECK(juz BETWEEN 1 AND 30),
  page         INTEGER,
  audio_url    TEXT,
  UNIQUE(surah_id, ayah_number)
);

CREATE TABLE IF NOT EXISTS words (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ayah_id         INTEGER NOT NULL REFERENCES ayahs(id) ON DELETE CASCADE,
  position        INTEGER NOT NULL,
  text_arabic     TEXT    NOT NULL,
  transliteration TEXT,
  root            TEXT,
  lemma           TEXT,
  pos_tag         TEXT,
  morphology_json TEXT,
  UNIQUE(ayah_id, position)
);

CREATE TABLE IF NOT EXISTS languages (
  code         TEXT PRIMARY KEY,
  name_native  TEXT NOT NULL,
  name_english TEXT NOT NULL,
  direction    TEXT NOT NULL CHECK(direction IN ('ltr', 'rtl'))
);

CREATE TABLE IF NOT EXISTS translations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ayah_id       INTEGER NOT NULL REFERENCES ayahs(id) ON DELETE CASCADE,
  language_code TEXT    NOT NULL REFERENCES languages(code),
  translator    TEXT    NOT NULL,
  text          TEXT    NOT NULL,
  UNIQUE(ayah_id, language_code, translator)
);

CREATE TABLE IF NOT EXISTS word_glosses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id       INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  language_code TEXT    NOT NULL REFERENCES languages(code),
  gloss_text    TEXT    NOT NULL,
  UNIQUE(word_id, language_code)
);

CREATE INDEX IF NOT EXISTS idx_ayahs_surah         ON ayahs(surah_id);
CREATE INDEX IF NOT EXISTS idx_words_ayah          ON words(ayah_id);
CREATE INDEX IF NOT EXISTS idx_translations_ayah   ON translations(ayah_id, language_code);
CREATE INDEX IF NOT EXISTS idx_word_glosses_word   ON word_glosses(word_id, language_code);
```

- [ ] **Step 9: Run type tests to verify they pass**

```bash
cd packages/data && pnpm test tests/types.test.ts
```
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add packages/data/
git commit -m "feat(data): add domain types and SQL schema"
```

---

## Task 4: packages/data — DB Connection and Migration Runner

**Files:**
- Create: `packages/data/src/db.ts`
- Create: `packages/data/src/migrate.ts`
- Create: `packages/data/tests/migrate.test.ts`

- [ ] **Step 1: Write failing migration test**

Create `packages/data/tests/migrate.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
import type { Client } from '@libsql/client';

let db: Client;

beforeAll(async () => {
  db = createDatabase('file::memory:');
  await runMigrations(db);
});

afterAll(() => db.close());

describe('runMigrations', () => {
  it('creates all six tables', async () => {
    const result = await db.execute(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    );
    const names = result.rows.map((r) => r['name'] as string);
    expect(names).toEqual(
      expect.arrayContaining([
        'ayahs',
        'languages',
        'surahs',
        'translations',
        'word_glosses',
        'words',
      ]),
    );
  });

  it('creates indexes', async () => {
    const result = await db.execute(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'",
    );
    expect(result.rows.length).toBeGreaterThanOrEqual(4);
  });

  it('is idempotent — running twice does not error', async () => {
    await expect(runMigrations(db)).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/data && pnpm test tests/migrate.test.ts
```
Expected: FAIL — `Cannot find module '../src/db.js'`

- [ ] **Step 3: Create packages/data/src/db.ts**

```ts
import { createClient, type Client } from '@libsql/client';

export function createDatabase(url = 'file:quran.db'): Client {
  return createClient({ url });
}

export type { Client };
```

- [ ] **Step 4: Create packages/data/src/migrate.ts**

`schema.sql` lives at `packages/data/schema.sql` (one level up from `src/` and one level up from `dist/`), so the same `../schema.sql` relative URL resolves correctly from both.

`@libsql/client` does not support multi-statement strings, so split on `;` and execute each statement individually. Skip blank lines and comment-only lines.

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Client } from '@libsql/client';

export async function runMigrations(db: Client): Promise<void> {
  const schemaUrl = new URL('../schema.sql', import.meta.url);
  const sql = readFileSync(fileURLToPath(schemaUrl), 'utf-8');

  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  for (const statement of statements) {
    await db.execute(statement);
  }
}
```

- [ ] **Step 5: Run migration tests to verify they pass**

```bash
cd packages/data && pnpm test tests/migrate.test.ts
```
Expected: PASS — all 3 tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/data/src/db.ts packages/data/src/migrate.ts packages/data/tests/migrate.test.ts
git commit -m "feat(data): add db connection factory and migration runner"
```

---

## Task 5: packages/data — Surah Queries

**Files:**
- Create: `packages/data/src/queries/surahs.ts`
- Create: `packages/data/tests/surahs.test.ts`

- [ ] **Step 1: Write failing surah query tests**

Create `packages/data/tests/surahs.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase, type Client } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
import { getAllSurahs, getSurahById } from '../src/queries/surahs.js';

let db: Client;

beforeAll(async () => {
  db = createDatabase('file::memory:');
  await runMigrations(db);
  await db.execute({
    sql: `INSERT INTO surahs (id, name_arabic, name_translit, name_translation, revelation_type, ayah_count, order_number)
          VALUES (1, 'الفاتحة', 'Al-Fatihah', 'The Opening', 'meccan', 7, 1),
                 (2, 'البقرة', 'Al-Baqarah', 'The Cow', 'medinan', 286, 2)`,
    args: [],
  });
});

afterAll(() => db.close());

describe('getAllSurahs', () => {
  it('returns all surahs ordered by id', async () => {
    const surahs = await getAllSurahs(db);
    expect(surahs).toHaveLength(2);
    expect(surahs[0]?.id).toBe(1);
    expect(surahs[1]?.id).toBe(2);
  });

  it('returns correctly shaped Surah objects', async () => {
    const surahs = await getAllSurahs(db);
    expect(surahs[0]).toMatchObject({
      id: 1,
      name_arabic: 'الفاتحة',
      name_translit: 'Al-Fatihah',
      revelation_type: 'meccan',
      ayah_count: 7,
    });
  });
});

describe('getSurahById', () => {
  it('returns the correct surah', async () => {
    const surah = await getSurahById(db, 2);
    expect(surah?.name_translit).toBe('Al-Baqarah');
  });

  it('returns null for non-existent id', async () => {
    const surah = await getSurahById(db, 999);
    expect(surah).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/data && pnpm test tests/surahs.test.ts
```
Expected: FAIL — `Cannot find module '../src/queries/surahs.js'`

- [ ] **Step 3: Create packages/data/src/queries/surahs.ts**

`@libsql/client` Row has both array-indexed and named access. Cast to `Record<string, unknown>` for named access.

```ts
import type { Client, Row } from '@libsql/client';
import type { Surah } from '../types.js';

function rowToSurah(row: Row): Surah {
  return {
    id: row['id'] as number,
    name_arabic: row['name_arabic'] as string,
    name_translit: row['name_translit'] as string,
    name_translation: row['name_translation'] as string,
    revelation_type: row['revelation_type'] as 'meccan' | 'medinan',
    ayah_count: row['ayah_count'] as number,
    order_number: row['order_number'] as number,
  };
}

export async function getAllSurahs(db: Client): Promise<Surah[]> {
  const result = await db.execute('SELECT * FROM surahs ORDER BY id');
  return result.rows.map(rowToSurah);
}

export async function getSurahById(db: Client, id: number): Promise<Surah | null> {
  const result = await db.execute({ sql: 'SELECT * FROM surahs WHERE id = ?', args: [id] });
  const row = result.rows[0];
  return row != null ? rowToSurah(row) : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/data && pnpm test tests/surahs.test.ts
```
Expected: PASS — all 4 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/data/src/queries/surahs.ts packages/data/tests/surahs.test.ts
git commit -m "feat(data): add surah queries"
```

---

## Task 6: packages/data — Ayah and Word Queries

**Files:**
- Create: `packages/data/src/queries/words.ts`
- Create: `packages/data/src/queries/ayahs.ts`
- Create: `packages/data/tests/ayahs.test.ts`

- [ ] **Step 1: Write failing ayah/word query tests**

Create `packages/data/tests/ayahs.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase, type Client } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
import { getAyahsBySurah, getAyahWithWords } from '../src/queries/ayahs.js';

let db: Client;
let ayahId: number;

beforeAll(async () => {
  db = createDatabase('file::memory:');
  await runMigrations(db);

  await db.execute({
    sql: `INSERT INTO surahs (id, name_arabic, name_translit, name_translation, revelation_type, ayah_count, order_number)
          VALUES (1, 'الفاتحة', 'Al-Fatihah', 'The Opening', 'meccan', 7, 1)`,
    args: [],
  });

  const r = await db.execute({
    sql: `INSERT INTO ayahs (surah_id, ayah_number, text_uthmani, juz, page)
          VALUES (1, 1, 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ', 1, 1) RETURNING id`,
    args: [],
  });
  ayahId = r.rows[0]?.['id'] as number;

  await db.execute({
    sql: `INSERT INTO words (ayah_id, position, text_arabic, transliteration, root, pos_tag)
          VALUES (?, 1, 'بِسْمِ', 'bismi', 'س م و', 'P'),
                 (?, 2, 'ٱللَّهِ', 'l-lahi', NULL, 'PN'),
                 (?, 3, 'ٱلرَّحْمَـٰنِ', 'l-rahmani', 'ر ح م', 'ADJ')`,
    args: [ayahId, ayahId, ayahId],
  });
});

afterAll(() => db.close());

describe('getAyahsBySurah', () => {
  it('returns all ayahs for a surah', async () => {
    const ayahs = await getAyahsBySurah(db, 1);
    expect(ayahs).toHaveLength(1);
    expect(ayahs[0]?.ayah_number).toBe(1);
  });

  it('returns empty array for unknown surah', async () => {
    const ayahs = await getAyahsBySurah(db, 999);
    expect(ayahs).toHaveLength(0);
  });
});

describe('getAyahWithWords', () => {
  it('returns ayah with its words', async () => {
    const result = await getAyahWithWords(db, ayahId);
    expect(result).not.toBeNull();
    expect(result?.ayah.ayah_number).toBe(1);
    expect(result?.words).toHaveLength(3);
  });

  it('returns words sorted by position', async () => {
    const result = await getAyahWithWords(db, ayahId);
    const positions = result?.words.map((w) => w.position);
    expect(positions).toEqual([1, 2, 3]);
  });

  it('returns null for unknown ayah', async () => {
    const result = await getAyahWithWords(db, 999);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/data && pnpm test tests/ayahs.test.ts
```
Expected: FAIL — `Cannot find module '../src/queries/ayahs.js'`

- [ ] **Step 3: Create packages/data/src/queries/words.ts**

```ts
import type { Client, Row } from '@libsql/client';
import type { Word } from '../types.js';

function rowToWord(row: Row): Word {
  return {
    id: row['id'] as number,
    ayah_id: row['ayah_id'] as number,
    position: row['position'] as number,
    text_arabic: row['text_arabic'] as string,
    transliteration: (row['transliteration'] as string | null) ?? null,
    root: (row['root'] as string | null) ?? null,
    lemma: (row['lemma'] as string | null) ?? null,
    pos_tag: (row['pos_tag'] as string | null) ?? null,
    morphology_json: (row['morphology_json'] as string | null) ?? null,
  };
}

export async function getWordsByAyah(db: Client, ayahId: number): Promise<Word[]> {
  const result = await db.execute({
    sql: 'SELECT * FROM words WHERE ayah_id = ? ORDER BY position',
    args: [ayahId],
  });
  return result.rows.map(rowToWord);
}
```

- [ ] **Step 4: Create packages/data/src/queries/ayahs.ts**

```ts
import type { Client, Row } from '@libsql/client';
import type { Ayah, Word } from '../types.js';
import { getWordsByAyah } from './words.js';

function rowToAyah(row: Row): Ayah {
  return {
    id: row['id'] as number,
    surah_id: row['surah_id'] as number,
    ayah_number: row['ayah_number'] as number,
    text_uthmani: row['text_uthmani'] as string,
    text_simple: (row['text_simple'] as string | null) ?? null,
    juz: (row['juz'] as number | null) ?? null,
    page: (row['page'] as number | null) ?? null,
    audio_url: (row['audio_url'] as string | null) ?? null,
  };
}

export async function getAyahsBySurah(db: Client, surahId: number): Promise<Ayah[]> {
  const result = await db.execute({
    sql: 'SELECT * FROM ayahs WHERE surah_id = ? ORDER BY ayah_number',
    args: [surahId],
  });
  return result.rows.map(rowToAyah);
}

export async function getAyahWithWords(
  db: Client,
  ayahId: number,
): Promise<{ ayah: Ayah; words: Word[] } | null> {
  const result = await db.execute({
    sql: 'SELECT * FROM ayahs WHERE id = ?',
    args: [ayahId],
  });
  const row = result.rows[0];
  if (row == null) return null;
  const ayah = rowToAyah(row);
  const words = await getWordsByAyah(db, ayahId);
  return { ayah, words };
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd packages/data && pnpm test tests/ayahs.test.ts
```
Expected: PASS — all 5 tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/data/src/queries/ayahs.ts packages/data/src/queries/words.ts packages/data/tests/ayahs.test.ts
git commit -m "feat(data): add ayah and word queries"
```

---

## Task 7: packages/data — Translation Queries and Barrel Export

**Files:**
- Create: `packages/data/src/queries/translations.ts`
- Create: `packages/data/src/index.ts`
- Create: `packages/data/tests/translations.test.ts`

- [ ] **Step 1: Write failing translation query tests**

Create `packages/data/tests/translations.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDatabase, type Client } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
import { getTranslationsByAyah, getTranslation } from '../src/queries/translations.js';

let db: Client;
let ayahId: number;

beforeAll(async () => {
  db = createDatabase('file::memory:');
  await runMigrations(db);

  await db.execute({
    sql: `INSERT INTO surahs (id, name_arabic, name_translit, name_translation, revelation_type, ayah_count, order_number)
          VALUES (1, 'الفاتحة', 'Al-Fatihah', 'The Opening', 'meccan', 7, 1)`,
    args: [],
  });
  const r = await db.execute({
    sql: `INSERT INTO ayahs (surah_id, ayah_number, text_uthmani) VALUES (1, 1, 'بِسْمِ ٱللَّهِ') RETURNING id`,
    args: [],
  });
  ayahId = r.rows[0]?.['id'] as number;

  await db.execute({
    sql: `INSERT INTO languages (code, name_native, name_english, direction) VALUES
          ('en', 'English', 'English', 'ltr'),
          ('uz', 'O''zbek', 'Uzbek', 'ltr'),
          ('ru', 'Русский', 'Russian', 'ltr')`,
    args: [],
  });
  await db.execute({
    sql: `INSERT INTO translations (ayah_id, language_code, translator, text) VALUES
          (?, 'en', 'Sahih International', 'In the name of Allah, the Entirely Merciful.'),
          (?, 'uz', 'Uzbek Translation', 'Mehribon va Rahmli Allohning nomi bilan.')`,
    args: [ayahId, ayahId],
  });
});

afterAll(() => db.close());

describe('getTranslationsByAyah', () => {
  it('returns all translations for an ayah', async () => {
    const translations = await getTranslationsByAyah(db, ayahId);
    expect(translations).toHaveLength(2);
  });

  it('returns translations with correct shape', async () => {
    const translations = await getTranslationsByAyah(db, ayahId);
    expect(translations[0]).toMatchObject({
      ayah_id: ayahId,
      language_code: 'en',
      translator: 'Sahih International',
    });
  });
});

describe('getTranslation', () => {
  it('returns a specific translation by ayah and language', async () => {
    const t = await getTranslation(db, ayahId, 'uz');
    expect(t?.language_code).toBe('uz');
    expect(t?.text).toContain('Mehribon');
  });

  it('returns null for missing language', async () => {
    const t = await getTranslation(db, ayahId, 'ru');
    expect(t).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/data && pnpm test tests/translations.test.ts
```
Expected: FAIL — `Cannot find module '../src/queries/translations.js'`

- [ ] **Step 3: Create packages/data/src/queries/translations.ts**

```ts
import type { Client, Row } from '@libsql/client';
import type { Translation } from '../types.js';

function rowToTranslation(row: Row): Translation {
  return {
    id: row['id'] as number,
    ayah_id: row['ayah_id'] as number,
    language_code: row['language_code'] as string,
    translator: row['translator'] as string,
    text: row['text'] as string,
  };
}

export async function getTranslationsByAyah(db: Client, ayahId: number): Promise<Translation[]> {
  const result = await db.execute({
    sql: 'SELECT * FROM translations WHERE ayah_id = ? ORDER BY language_code',
    args: [ayahId],
  });
  return result.rows.map(rowToTranslation);
}

export async function getTranslation(
  db: Client,
  ayahId: number,
  languageCode: string,
): Promise<Translation | null> {
  const result = await db.execute({
    sql: 'SELECT * FROM translations WHERE ayah_id = ? AND language_code = ? LIMIT 1',
    args: [ayahId, languageCode],
  });
  const row = result.rows[0];
  return row != null ? rowToTranslation(row) : null;
}
```

- [ ] **Step 4: Create packages/data/src/index.ts**

```ts
export { createDatabase } from './db.js';
export { runMigrations } from './migrate.js';
export { getAllSurahs, getSurahById } from './queries/surahs.js';
export { getAyahsBySurah, getAyahWithWords } from './queries/ayahs.js';
export { getWordsByAyah } from './queries/words.js';
export { getTranslationsByAyah, getTranslation } from './queries/translations.js';
export type { Surah, Ayah, Word, Language, Translation, WordGloss } from './types.js';
export type { Client } from './db.js';
```

- [ ] **Step 5: Run all packages/data tests**

```bash
cd packages/data && pnpm test
```
Expected: PASS — all tests across all test files pass

- [ ] **Step 6: Build packages/data to verify TypeScript compiles**

```bash
cd packages/data && pnpm build
```
Expected: `dist/` directory created with `.js` and `.d.ts` files, no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/data/src/queries/translations.ts packages/data/src/index.ts packages/data/tests/translations.test.ts
git commit -m "feat(data): add translation queries and barrel export"
```

---

## Task 8: packages/scraper — Python Scaffold

**Files:**
- Create: `packages/scraper/pyproject.toml`
- Create: `packages/scraper/scraper/__init__.py`
- Create: `packages/scraper/scraper/models.py`
- Create: `packages/scraper/scraper/checkpoint.py`
- Create: `packages/scraper/scraper/db.py`
- Create: `packages/scraper/scraper/sources/__init__.py`
- Create: `packages/scraper/scraper/sources/corpus_quran.py`
- Create: `packages/scraper/scraper/sources/tanzil.py`
- Create: `packages/scraper/scraper/sources/quranenc.py`
- Create: `packages/scraper/scraper/cli.py`
- Create: `packages/scraper/tests/__init__.py`
- Create: `packages/scraper/tests/test_models.py`
- Create: `packages/scraper/tests/test_db.py`

- [ ] **Step 1: Verify uv is available**

```bash
uv --version   # should be 0.4+
```

If missing: `curl -LsSf https://astral.sh/uv/install.sh | sh && source $HOME/.cargo/env`

- [ ] **Step 2: Create packages/scraper/pyproject.toml**

```toml
[project]
name = "quran-corpus-scraper"
version = "0.1.0"
description = "Scraper and data importer for the Quranic corpus"
requires-python = ">=3.12"
dependencies = [
  "playwright>=1.48.0",
  "beautifulsoup4>=4.12.0",
  "pydantic>=2.9.0",
  "httpx>=0.27.0",
  "tqdm>=4.67.0",
  "click>=8.1.0",
  "lxml>=5.3.0",
]

[project.scripts]
scraper = "scraper.cli:main"

[tool.uv]
dev-dependencies = [
  "pytest>=8.3.0",
  "pytest-asyncio>=0.24.0",
  "ruff>=0.7.0",
  "mypy>=1.13.0",
]

[tool.ruff.lint]
select = ["E", "F", "W", "I", "N", "UP", "B", "S"]
ignore = ["S101"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
```

- [ ] **Step 3: Install Python dependencies**

```bash
cd packages/scraper && uv sync
```
Expected: `.venv/` created with all deps installed.

- [ ] **Step 4: Write failing model tests**

Create `packages/scraper/tests/__init__.py` (empty file).

Create `packages/scraper/tests/test_models.py`:
```python
import pytest
from pydantic import ValidationError

from scraper.models import AyahModel, SurahModel, TranslationModel, WordModel


def test_surah_model_valid():
    s = SurahModel(
        id=1,
        name_arabic="الفاتحة",
        name_translit="Al-Fatihah",
        name_translation="The Opening",
        revelation_type="meccan",
        ayah_count=7,
        order_number=1,
    )
    assert s.revelation_type == "meccan"
    assert s.ayah_count == 7


def test_surah_model_rejects_invalid_revelation_type():
    with pytest.raises(ValidationError):
        SurahModel(
            id=1,
            name_arabic="x",
            name_translit="x",
            name_translation="x",
            revelation_type="unknown",
            ayah_count=1,
            order_number=1,
        )


def test_word_model_nullable_fields_default_to_none():
    w = WordModel(id=1, ayah_id=1, position=1, text_arabic="بِسْمِ")
    assert w.root is None
    assert w.pos_tag is None
    assert w.morphology_json is None


def test_translation_model_valid():
    t = TranslationModel(
        id=1,
        ayah_id=1,
        language_code="en",
        translator="Sahih International",
        text="In the name of Allah",
    )
    assert t.language_code == "en"
```

- [ ] **Step 5: Run test to verify it fails**

```bash
cd packages/scraper && uv run pytest tests/test_models.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'scraper'`

- [ ] **Step 6: Create packages/scraper/scraper/__init__.py**

```python
```

- [ ] **Step 7: Create packages/scraper/scraper/models.py**

```python
from typing import Literal

from pydantic import BaseModel


class SurahModel(BaseModel):
    id: int
    name_arabic: str
    name_translit: str
    name_translation: str
    revelation_type: Literal["meccan", "medinan"]
    ayah_count: int
    order_number: int


class AyahModel(BaseModel):
    id: int | None = None
    surah_id: int
    ayah_number: int
    text_uthmani: str
    text_simple: str | None = None
    juz: int | None = None
    page: int | None = None
    audio_url: str | None = None


class WordModel(BaseModel):
    id: int | None = None
    ayah_id: int
    position: int
    text_arabic: str
    transliteration: str | None = None
    root: str | None = None
    lemma: str | None = None
    pos_tag: str | None = None
    morphology_json: str | None = None


class TranslationModel(BaseModel):
    id: int | None = None
    ayah_id: int
    language_code: str
    translator: str
    text: str


class WordGlossModel(BaseModel):
    id: int | None = None
    word_id: int
    language_code: str
    gloss_text: str
```

- [ ] **Step 8: Run model tests to verify they pass**

```bash
cd packages/scraper && uv run pytest tests/test_models.py -v
```
Expected: PASS — all 4 tests pass

- [ ] **Step 9: Write failing db writer tests**

Create `packages/scraper/tests/test_db.py`:
```python
import os
import sqlite3
import tempfile

from scraper.db import ScraperDatabase
from scraper.models import SurahModel


def test_create_schema_creates_all_tables():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        path = f.name
    try:
        db = ScraperDatabase(path)
        db.close()
        conn = sqlite3.connect(path)
        tables = {
            r[0]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        assert tables == {"surahs", "ayahs", "words", "languages", "translations", "word_glosses"}
        conn.close()
    finally:
        os.unlink(path)


def test_upsert_surah_inserts_row():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        path = f.name
    try:
        db = ScraperDatabase(path)
        surah = SurahModel(
            id=1,
            name_arabic="الفاتحة",
            name_translit="Al-Fatihah",
            name_translation="The Opening",
            revelation_type="meccan",
            ayah_count=7,
            order_number=1,
        )
        db.upsert_surah(surah)
        db.close()
        conn = sqlite3.connect(path)
        row = conn.execute("SELECT id, name_translit FROM surahs WHERE id=1").fetchone()
        assert row == (1, "Al-Fatihah")
        conn.close()
    finally:
        os.unlink(path)


def test_upsert_surah_is_idempotent():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        path = f.name
    try:
        db = ScraperDatabase(path)
        surah = SurahModel(
            id=1,
            name_arabic="الفاتحة",
            name_translit="Al-Fatihah",
            name_translation="The Opening",
            revelation_type="meccan",
            ayah_count=7,
            order_number=1,
        )
        db.upsert_surah(surah)
        db.upsert_surah(surah)
        db.close()
        conn = sqlite3.connect(path)
        count = conn.execute("SELECT COUNT(*) FROM surahs").fetchone()[0]
        assert count == 1
        conn.close()
    finally:
        os.unlink(path)
```

- [ ] **Step 10: Run test to verify it fails**

```bash
cd packages/scraper && uv run pytest tests/test_db.py -v
```
Expected: FAIL — `No module named 'scraper.db'`

- [ ] **Step 11: Create packages/scraper/scraper/db.py**

Reads `packages/data/schema.sql` at the repo level. Path: `__file__` is `packages/scraper/scraper/db.py`, so `parents[2]` is `packages/`, then `/ "data" / "schema.sql"`.

```python
import sqlite3
from pathlib import Path

from .models import AyahModel, SurahModel, TranslationModel, WordGlossModel, WordModel

# schema.sql lives at packages/data/schema.sql — single source of truth for DDL
_SCHEMA_PATH = Path(__file__).parents[2] / "data" / "schema.sql"


class ScraperDatabase:
    def __init__(self, db_path: str) -> None:
        self._conn = sqlite3.connect(db_path)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._conn.execute("PRAGMA journal_mode = WAL")
        self._apply_schema()

    def _apply_schema(self) -> None:
        sql = _SCHEMA_PATH.read_text()
        for stmt in sql.split(";"):
            stmt = stmt.strip()
            if stmt and not stmt.upper().startswith("PRAGMA"):
                self._conn.execute(stmt)
        self._conn.commit()

    def upsert_surah(self, surah: SurahModel) -> None:
        self._conn.execute(
            """INSERT INTO surahs
               (id, name_arabic, name_translit, name_translation, revelation_type, ayah_count, order_number)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 name_arabic      = excluded.name_arabic,
                 name_translit    = excluded.name_translit,
                 name_translation = excluded.name_translation,
                 revelation_type  = excluded.revelation_type,
                 ayah_count       = excluded.ayah_count,
                 order_number     = excluded.order_number""",
            (
                surah.id,
                surah.name_arabic,
                surah.name_translit,
                surah.name_translation,
                surah.revelation_type,
                surah.ayah_count,
                surah.order_number,
            ),
        )
        self._conn.commit()

    def upsert_ayah(self, ayah: AyahModel) -> int:
        cursor = self._conn.execute(
            """INSERT INTO ayahs
               (surah_id, ayah_number, text_uthmani, text_simple, juz, page, audio_url)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(surah_id, ayah_number) DO UPDATE SET
                 text_uthmani = excluded.text_uthmani,
                 text_simple  = excluded.text_simple,
                 juz          = excluded.juz,
                 page         = excluded.page,
                 audio_url    = excluded.audio_url
               RETURNING id""",
            (
                ayah.surah_id,
                ayah.ayah_number,
                ayah.text_uthmani,
                ayah.text_simple,
                ayah.juz,
                ayah.page,
                ayah.audio_url,
            ),
        )
        self._conn.commit()
        row = cursor.fetchone()
        return int(row[0])

    def upsert_word(self, word: WordModel) -> int:
        cursor = self._conn.execute(
            """INSERT INTO words
               (ayah_id, position, text_arabic, transliteration, root, lemma, pos_tag, morphology_json)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(ayah_id, position) DO UPDATE SET
                 text_arabic     = excluded.text_arabic,
                 transliteration = excluded.transliteration,
                 root            = excluded.root,
                 lemma           = excluded.lemma,
                 pos_tag         = excluded.pos_tag,
                 morphology_json = excluded.morphology_json
               RETURNING id""",
            (
                word.ayah_id,
                word.position,
                word.text_arabic,
                word.transliteration,
                word.root,
                word.lemma,
                word.pos_tag,
                word.morphology_json,
            ),
        )
        self._conn.commit()
        row = cursor.fetchone()
        return int(row[0])

    def upsert_translation(self, translation: TranslationModel) -> None:
        self._conn.execute(
            """INSERT INTO translations (ayah_id, language_code, translator, text)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(ayah_id, language_code, translator) DO UPDATE SET
                 text = excluded.text""",
            (translation.ayah_id, translation.language_code, translation.translator, translation.text),
        )
        self._conn.commit()

    def upsert_word_gloss(self, gloss: WordGlossModel) -> None:
        self._conn.execute(
            """INSERT INTO word_glosses (word_id, language_code, gloss_text)
               VALUES (?, ?, ?)
               ON CONFLICT(word_id, language_code) DO UPDATE SET
                 gloss_text = excluded.gloss_text""",
            (gloss.word_id, gloss.language_code, gloss.gloss_text),
        )
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()
```

- [ ] **Step 12: Run db tests to verify they pass**

```bash
cd packages/scraper && uv run pytest tests/test_db.py -v
```
Expected: PASS — all 3 tests pass

- [ ] **Step 13: Create source stubs and checkpoint module**

Create `packages/scraper/scraper/sources/__init__.py`:
```python
```

Create `packages/scraper/scraper/checkpoint.py`:
```python
import json
from pathlib import Path


class Checkpoint:
    """Persists scraping progress so a run can be resumed without re-scraping completed surahs."""

    def __init__(self, path: str = "checkpoint.json") -> None:
        self._path = Path(path)
        self._state: dict[str, bool] = self._load()

    def _load(self) -> dict[str, bool]:
        if self._path.exists():
            return json.loads(self._path.read_text())
        return {}

    def is_done(self, key: str) -> bool:
        return bool(self._state.get(key))

    def mark_done(self, key: str) -> None:
        self._state[key] = True
        self._path.write_text(json.dumps(self._state, indent=2))

    def reset(self) -> None:
        self._state = {}
        if self._path.exists():
            self._path.unlink()
```

Create `packages/scraper/scraper/sources/corpus_quran.py`:
```python
"""Scraper for corpus.quran.com — word-by-word morphology data.

Rate-limited to 1 req / 1.5s per robots.txt policy. Resumable via Checkpoint.
Full implementation in Phase 2.
"""
from ..checkpoint import Checkpoint
from ..db import ScraperDatabase

RATE_LIMIT_SECONDS = 1.5
BASE_URL = "https://corpus.quran.com"


async def scrape_surah(surah_id: int, db: ScraperDatabase, checkpoint: Checkpoint) -> None:
    """Scrape all ayahs for a surah. No-op if already marked done in checkpoint."""
    key = f"corpus_surah_{surah_id}"
    if checkpoint.is_done(key):
        return
    # Phase 2: implement Playwright-based per-ayah scraping
    raise NotImplementedError("corpus.quran.com scraping implemented in Phase 2")
```

Create `packages/scraper/scraper/sources/tanzil.py`:
```python
"""Importer for Tanzil.net Quran text and translations (XML format).

Download the dataset from tanzil.net once; do not re-scrape. Full implementation in Phase 2.
"""
from pathlib import Path

from ..db import ScraperDatabase


def import_tanzil_text(xml_path: Path, db: ScraperDatabase) -> None:
    """Parse Tanzil Uthmani XML and upsert into ayahs table."""
    raise NotImplementedError("Tanzil import implemented in Phase 2")
```

Create `packages/scraper/scraper/sources/quranenc.py`:
```python
"""Importer for QuranEnc.com translations (JSON format).

Supports Uzbek, Russian, and other QuranEnc languages. Full implementation in Phase 2.
"""
from pathlib import Path

from ..db import ScraperDatabase


def import_quranenc_translation(
    json_path: Path, language_code: str, translator: str, db: ScraperDatabase
) -> None:
    """Parse a QuranEnc JSON export and upsert into translations table."""
    raise NotImplementedError("QuranEnc import implemented in Phase 2")
```

Create `packages/scraper/scraper/cli.py`:
```python
import click

from .checkpoint import Checkpoint
from .db import ScraperDatabase


@click.group()
def main() -> None:
    """Quran corpus scraper and data importer."""


@main.command()
@click.option("--db", default="quran.db", show_default=True, help="SQLite output path")
@click.option("--checkpoint", default="checkpoint.json", show_default=True)
@click.option("--surah", type=int, default=None, help="Scrape single surah (1-114)")
def scrape(db: str, checkpoint: str, surah: int | None) -> None:
    """Scrape corpus.quran.com morphology data (rate-limited, resumable)."""
    database = ScraperDatabase(db)
    cp = Checkpoint(checkpoint)
    surah_range = [surah] if surah else list(range(1, 115))
    click.echo(f"Target surahs: {surah_range}")
    click.echo("Phase 2: full scraping implementation pending.")
    database.close()


@main.command("import-tanzil")
@click.argument("xml_path")
@click.option("--db", default="quran.db", show_default=True)
def import_tanzil(xml_path: str, db: str) -> None:
    """Import a Tanzil XML file into the database."""
    from pathlib import Path

    from .sources.tanzil import import_tanzil_text

    database = ScraperDatabase(db)
    import_tanzil_text(Path(xml_path), database)
    database.close()


@main.command("import-quranenc")
@click.argument("json_path")
@click.argument("language_code")
@click.argument("translator")
@click.option("--db", default="quran.db", show_default=True)
def import_quranenc(json_path: str, language_code: str, translator: str, db: str) -> None:
    """Import a QuranEnc JSON translation file into the database."""
    from pathlib import Path

    from .sources.quranenc import import_quranenc_translation

    database = ScraperDatabase(db)
    import_quranenc_translation(Path(json_path), language_code, translator, database)
    database.close()
```

- [ ] **Step 14: Run all scraper tests**

```bash
cd packages/scraper && uv run pytest -v
```
Expected: PASS — all 7 tests pass

- [ ] **Step 15: Verify CLI entry point**

```bash
cd packages/scraper && uv run scraper --help
```
Expected output:
```
Usage: scraper [OPTIONS] COMMAND [ARGS]...
  Quran corpus scraper and data importer.
Commands:
  import-quranenc  Import a QuranEnc JSON translation file into the database.
  import-tanzil    Import a Tanzil XML file into the database.
  scrape           Scrape corpus.quran.com morphology data...
```

- [ ] **Step 16: Commit**

```bash
git add packages/scraper/
git commit -m "feat(scraper): Python scaffold — Pydantic models, SQLite writer, CLI, checkpoint"
```

---

## Task 9: apps/web — Next.js PWA Shell

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/lib/db.ts`
- Create: `apps/web/public/manifest.json`

- [ ] **Step 1: Create apps/web/package.json**

```json
{
  "name": "@quran-corpus/web",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@quran-corpus/data": "workspace:*",
    "framer-motion": "^11.0.0",
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@quran-corpus/config": "workspace:*",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "prettier": "^3.3.3",
    "prettier-plugin-tailwindcss": "^0.6.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: Create apps/web/tsconfig.json**

```json
{
  "extends": "@quran-corpus/config/tsconfig/nextjs",
  "compilerOptions": {
    "outDir": "./.next/types",
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create apps/web/next.config.ts**

```ts
import type { NextConfig } from 'next';

const config: NextConfig = {
  experimental: {
    typedRoutes: true,
  },
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      ],
    },
  ],
};

export default config;
```

- [ ] **Step 4: Create apps/web/tailwind.config.ts**

```ts
import type { Config } from 'tailwindcss';
import preset from '@quran-corpus/config/tailwind/preset';

const config: Config = {
  presets: [preset as Config],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 5: Create apps/web/postcss.config.mjs**

```js
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
```

- [ ] **Step 6: Create apps/web/src/app/globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --font-sans: 'Geist', system-ui, sans-serif;
  --font-arabic: 'Amiri', 'Noto Naskh Arabic', serif;
}

[dir='rtl'] {
  font-family: var(--font-arabic);
}
```

- [ ] **Step 7: Create apps/web/src/app/layout.tsx**

```tsx
import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Quran Corpus',
  description: 'Word-by-word Quranic morphology, grammar, and translations',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Quran Corpus',
  },
};

export const viewport: Viewport = {
  themeColor: '#1f1a14',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-paper-50 text-paper-900 antialiased dark:bg-night-300 dark:text-paper-100">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Create apps/web/src/app/page.tsx**

```tsx
import { redirect } from 'next/navigation';

export default function HomePage() {
  redirect('/surah');
}
```

- [ ] **Step 9: Create apps/web/src/lib/db.ts**

```ts
import { createDatabase, runMigrations } from '@quran-corpus/data';
import type { Client } from '@quran-corpus/data';

let _db: Client | null = null;

export async function getDatabase(): Promise<Client> {
  if (_db == null) {
    const url = process.env['DATABASE_URL'] ?? 'file:quran.db';
    _db = createDatabase(url);
    await runMigrations(_db);
  }
  return _db;
}
```

- [ ] **Step 10: Create apps/web/public/manifest.json**

```json
{
  "name": "Quran Corpus",
  "short_name": "Quran",
  "description": "Word-by-word Quranic morphology, grammar, and translations",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#faf8f3",
  "theme_color": "#1f1a14",
  "orientation": "portrait",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable any"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable any"
    }
  ]
}
```

- [ ] **Step 11: Install apps/web dependencies**

```bash
cd apps/web && pnpm install
```

Expected: no errors.

- [ ] **Step 12: Type-check the web app**

```bash
cd apps/web && pnpm type-check
```
Expected: No type errors.

- [ ] **Step 13: Commit**

```bash
git add apps/web/
git commit -m "feat(web): Next.js 15 App Router PWA shell with security headers and Tailwind"
```

---

## Task 10: Root Integration and Full Pipeline Verification

**Files:**
- Create: `.prettierrc.js`

- [ ] **Step 1: Create root .prettierrc.js**

```js
module.exports = require('@quran-corpus/config/prettier');
```

- [ ] **Step 2: Install all workspace dependencies from root**

```bash
pnpm install
```
Expected: All packages linked, lockfile updated, no errors.

- [ ] **Step 3: Run full turbo build**

```bash
pnpm build
```
Expected: `packages/data` compiles to `dist/`, `apps/web` Next.js build completes. No errors.

- [ ] **Step 4: Run full test suite**

```bash
pnpm test
```
Expected: All Vitest tests in `packages/data` pass.

```bash
cd packages/scraper && uv run pytest -v
```
Expected: All 7 pytest tests pass.

- [ ] **Step 5: Run type-check across all TS packages**

```bash
pnpm type-check
```
Expected: Zero type errors.

- [ ] **Step 6: Run lint across all TS packages**

```bash
pnpm lint
```
Expected: Zero lint errors.

- [ ] **Step 7: Verify Next.js dev server starts**

```bash
cd apps/web && pnpm dev
```
Expected: Server starts on http://localhost:3000 without error. Visiting `/` redirects to `/surah` (404 is expected — the route is not yet implemented).

Stop the server with Ctrl+C.

- [ ] **Step 8: Confirm no .db file was committed**

```bash
git status
```
Expected: `.db` files are not listed (covered by .gitignore).

- [ ] **Step 9: Commit**

```bash
git add .prettierrc.js
git commit -m "chore: root prettier config and full workspace integration"
```

---

## Acceptance Criteria

- [ ] `pnpm install` from repo root succeeds
- [ ] `pnpm build` succeeds: `packages/data/dist/` populated, `apps/web` Next.js build complete
- [ ] `pnpm test` passes: all Vitest tests in `packages/data` green
- [ ] `cd packages/scraper && uv run pytest -v` passes: all 7 tests green
- [ ] `pnpm type-check` reports zero type errors
- [ ] `pnpm lint` reports zero lint errors
- [ ] `uv run scraper --help` shows the CLI with three sub-commands
- [ ] `cd apps/web && pnpm dev` starts without error; navigating to `/` redirects to `/surah`
- [ ] No `*.db` files appear in `git status`
- [ ] Security headers present in `next.config.ts`: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`

---

## Risks and Rollbacks

| Risk | Mitigation |
|------|-----------|
| `@libsql/client` `file::memory:` URL not supported in installed version | Pin `^0.14.0`; if tests fail with connection error, try `":memory:"` as the URL instead |
| `packages/data/schema.sql` path resolution fails after `pnpm build` | Path in `migrate.ts` uses `new URL('../schema.sql', import.meta.url)` — one level up from both `src/` and `dist/`. If resolution fails, verify schema.sql is at `packages/data/schema.sql` (not `src/`) |
| Python `sqlite3` stdlib older than 3.35 (no `RETURNING` support) | `RETURNING id` requires SQLite ≥ 3.35 (Python 3.12 ships ≥ 3.39 — safe). If on older Python: replace `RETURNING id` with `cursor.lastrowid` in `ScraperDatabase.upsert_ayah` and `upsert_word` |
| `@quran-corpus/config/tailwind/preset` import fails in `tailwind.config.ts` | Tailwind 3 config files run in Node.js — ensure `packages/config/package.json` exports the `tailwind/preset` path correctly |
| `prettier-plugin-tailwindcss` version mismatch with Prettier 3 | Both are pinned to compatible ranges; run `pnpm why prettier prettier-plugin-tailwindcss` if formatting errors appear |
| Python `uv` not installed | Add one-liner install to package README (out of scope for this task) |
