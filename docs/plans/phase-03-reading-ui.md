# Phase 03 — Core Reading UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a fully functional reading experience: surah index → surah reader with Arabic text displayed word-by-word → morphology popover on word tap, with English translation shown below each ayah.

**Architecture:** Next.js 15 App Router Server Components fetch all data for a surah in 4 bulk queries (surahs, ayahs, words, translations) and pass serialised props to a single `"use client"` `ReaderView` component that owns word-selection state. The popover is a Framer Motion bottom-sheet that works on both mobile and desktop. Language is controlled by a `?lang=` URL param, resolved server-side — no client state needed for i18n.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS (paper/night colour tokens), Framer Motion 11, `@quran-corpus/data` (libSQL queries), Vitest 2 + @testing-library/react (component tests)

---

## File map

```
packages/data/src/queries/
  words.ts                     MODIFY — add getWordsBySurah
  translations.ts              MODIFY — add getTranslationsBySurahAndLang
packages/data/tests/
  words.test.ts                MODIFY — add tests for getWordsBySurah
  translations.test.ts         MODIFY — add tests for getTranslationsBySurahAndLang
packages/data/src/index.ts     MODIFY — re-export new functions

apps/web/
  package.json                 MODIFY — add vitest + testing-library
  vitest.config.ts             CREATE
  src/test/setup.ts            CREATE
  src/app/surah/
    page.tsx                   CREATE — surah list (Server Component)
    [id]/
      page.tsx                 CREATE — surah reader (Server Component)
  src/components/
    surah-list/
      SurahCard.tsx            CREATE — single surah card
    reader/
      ReaderView.tsx           CREATE — Client Component, owns word-select state
      SurahHeader.tsx          CREATE — surah name + metadata strip
      AyahView.tsx             CREATE — one ayah: words + translation
      WordToken.tsx            CREATE — single clickable Arabic word
      WordPopover.tsx          CREATE — Framer Motion bottom sheet
      LanguageBar.tsx          CREATE — language tab links (URL-based)
  src/test/
    setup.ts                   CREATE
    SurahCard.test.tsx         CREATE
    WordToken.test.tsx         CREATE
    WordPopover.test.tsx       CREATE
    AyahView.test.tsx          CREATE
```

---

## Task 1: Bulk data queries in packages/data

**Files:**
- Modify: `packages/data/src/queries/words.ts`
- Modify: `packages/data/src/queries/translations.ts`
- Modify: `packages/data/src/index.ts`
- Modify: `packages/data/tests/words.test.ts`
- Modify: `packages/data/tests/translations.test.ts`

Work in `/home/dev/projects-dev/quran-corpus-pwa/packages/data`.

- [ ] **Step 1: Add getWordsBySurah to words.ts**

Append to `src/queries/words.ts`:

```typescript
export async function getWordsBySurah(db: Client, surahId: number): Promise<Word[]> {
  const result = await db.execute({
    sql: `SELECT w.*
          FROM words w
          JOIN ayahs a ON a.id = w.ayah_id
          WHERE a.surah_id = ?
          ORDER BY a.ayah_number, w.position`,
    args: [surahId],
  });
  return result.rows.map(rowToWord);
}
```

- [ ] **Step 2: Add getTranslationsBySurahAndLang to translations.ts**

Append to `src/queries/translations.ts`:

```typescript
export async function getTranslationsBySurahAndLang(
  db: Client,
  surahId: number,
  languageCode: string,
): Promise<Translation[]> {
  const result = await db.execute({
    sql: `SELECT t.*
          FROM translations t
          JOIN ayahs a ON a.id = t.ayah_id
          WHERE a.surah_id = ? AND t.language_code = ?
          ORDER BY a.ayah_number`,
    args: [surahId, languageCode],
  });
  return result.rows.map(rowToTranslation);
}
```

- [ ] **Step 3: Re-export both functions from src/index.ts**

Add to `src/index.ts`:

```typescript
export { getWordsBySurah } from './queries/words.js';
export { getTranslationsBySurahAndLang } from './queries/translations.js';
```

- [ ] **Step 4: Write failing tests**

Add to `tests/words.test.ts` (at the end, after existing imports and setup):

```typescript
import { getWordsBySurah } from '../src/queries/words.js';

// Add to beforeAll (after existing INSERT INTO words):
// (no extra setup needed — existing test data has surah_id=1, ayah_id bound to it)

describe('getWordsBySurah', () => {
  it('returns all words for all ayahs in a surah', async () => {
    const words = await getWordsBySurah(db, 1);
    expect(words).toHaveLength(3); // 3 words seeded for surah 1 ayah 1
  });

  it('returns words ordered by ayah then position', async () => {
    const words = await getWordsBySurah(db, 1);
    expect(words.map((w) => w.position)).toEqual([1, 2, 3]);
  });

  it('returns empty array for unknown surah', async () => {
    const words = await getWordsBySurah(db, 999);
    expect(words).toHaveLength(0);
  });

  it('returned words have ayah_id field', async () => {
    const words = await getWordsBySurah(db, 1);
    expect(words[0]?.ayah_id).toBe(ayahId);
  });
});
```

Add to `tests/translations.test.ts`:

First read the existing test to see the structure, then add:

```typescript
import { getTranslationsBySurahAndLang } from '../src/queries/translations.js';

// Add to existing beforeAll (after inserting translation):
// Existing test already inserts: translations for ayahId with language_code='en'

describe('getTranslationsBySurahAndLang', () => {
  it('returns translations for a surah in given language', async () => {
    const translations = await getTranslationsBySurahAndLang(db, 1, 'en');
    expect(translations).toHaveLength(1);
    expect(translations[0]?.language_code).toBe('en');
  });

  it('returns empty array when language has no translations', async () => {
    const translations = await getTranslationsBySurahAndLang(db, 1, 'uz');
    expect(translations).toHaveLength(0);
  });

  it('returns empty array for unknown surah', async () => {
    const translations = await getTranslationsBySurahAndLang(db, 999, 'en');
    expect(translations).toHaveLength(0);
  });
});
```

- [ ] **Step 5: Run tests — expect failures**

```bash
pnpm --filter @quran-corpus/data test
```

Expected: import errors or test failures for the new describe blocks.

- [ ] **Step 6: Verify tests pass after implementation**

```bash
pnpm --filter @quran-corpus/data test
```

Expected: all tests pass (22+ tests).

- [ ] **Step 7: Build the package**

```bash
pnpm --filter @quran-corpus/data build
```

Expected: `dist/` updated with no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/data/src/queries/words.ts packages/data/src/queries/translations.ts packages/data/src/index.ts packages/data/tests/words.test.ts packages/data/tests/translations.test.ts
git commit -m "feat(data): add getWordsBySurah and getTranslationsBySurahAndLang bulk queries"
```

---

## Task 2: Vitest + React Testing Library setup in apps/web

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/src/test/setup.ts`

Work in `/home/dev/projects-dev/quran-corpus-pwa/apps/web`.

- [ ] **Step 1: Install test dependencies**

```bash
pnpm --filter @quran-corpus/web add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

Expected: packages installed, package.json devDependencies updated.

- [ ] **Step 2: Create vitest.config.ts**

Create `apps/web/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

- [ ] **Step 3: Create test setup file**

Create `apps/web/src/test/setup.ts`:

```typescript
import '@testing-library/jest-dom';
```

- [ ] **Step 4: Add test script to package.json**

Edit `apps/web/package.json` scripts section:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint src --ext .ts,.tsx",
  "type-check": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 5: Verify setup works with a smoke test**

Create `apps/web/src/test/smoke.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

function Hello() {
  return <span>hello</span>;
}

describe('vitest setup', () => {
  it('renders a react component', () => {
    render(<Hello />);
    expect(screen.getByText('hello')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run smoke test**

```bash
pnpm --filter @quran-corpus/web test
```

Expected: 1 test passes.

- [ ] **Step 7: Delete smoke test and commit**

```bash
rm apps/web/src/test/smoke.test.tsx
git add apps/web/package.json apps/web/vitest.config.ts apps/web/src/test/setup.ts
git commit -m "chore(web): add Vitest + React Testing Library"
```

---

## Task 3: SurahCard component + surah list page

**Files:**
- Create: `apps/web/src/components/surah-list/SurahCard.tsx`
- Create: `apps/web/src/app/surah/page.tsx`
- Create: `apps/web/src/test/SurahCard.test.tsx`

Work in `/home/dev/projects-dev/quran-corpus-pwa/apps/web`.

- [ ] **Step 1: Write failing test**

Create `src/test/SurahCard.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SurahCard } from '../components/surah-list/SurahCard';
import type { Surah } from '@quran-corpus/data';

const surah: Surah = {
  id: 1,
  name_arabic: 'الفاتحة',
  name_translit: 'Al-Fatihah',
  name_translation: 'The Opening',
  revelation_type: 'meccan',
  ayah_count: 7,
  order_number: 1,
};

describe('SurahCard', () => {
  it('renders surah number', () => {
    render(<SurahCard surah={surah} />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders Arabic name', () => {
    render(<SurahCard surah={surah} />);
    expect(screen.getByText('الفاتحة')).toBeInTheDocument();
  });

  it('renders transliterated name', () => {
    render(<SurahCard surah={surah} />);
    expect(screen.getByText('Al-Fatihah')).toBeInTheDocument();
  });

  it('renders ayah count', () => {
    render(<SurahCard surah={surah} />);
    expect(screen.getByText('7 ayahs')).toBeInTheDocument();
  });

  it('renders revelation type', () => {
    render(<SurahCard surah={surah} />);
    expect(screen.getByText('Meccan')).toBeInTheDocument();
  });

  it('wraps in a link to /surah/1', () => {
    render(<SurahCard surah={surah} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/surah/1');
  });
});
```

- [ ] **Step 2: Run test — expect failures**

```bash
pnpm --filter @quran-corpus/web test
```

Expected: `Cannot find module '../components/surah-list/SurahCard'`

- [ ] **Step 3: Create SurahCard component**

Create `src/components/surah-list/SurahCard.tsx`:

```tsx
import Link from 'next/link';
import type { Surah } from '@quran-corpus/data';

interface SurahCardProps {
  surah: Surah;
}

export function SurahCard({ surah }: SurahCardProps) {
  return (
    <Link href={`/surah/${surah.id}`}>
      <div className="group flex items-center gap-4 rounded-xl bg-paper-100 px-4 py-3 transition-colors hover:bg-paper-200 dark:bg-night-200 dark:hover:bg-night-100">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paper-300 text-sm font-medium text-paper-700 dark:bg-night-50 dark:text-paper-300">
          {surah.id}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-paper-500 dark:text-paper-400">
              {surah.name_translit}
            </p>
            <p className="mt-0.5 text-xs text-paper-400 dark:text-paper-500">
              {surah.revelation_type.charAt(0).toUpperCase() + surah.revelation_type.slice(1)} ·{' '}
              {surah.ayah_count} ayahs
            </p>
          </div>
          <p className="font-arabic text-2xl text-paper-900 dark:text-paper-100">
            {surah.name_arabic}
          </p>
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 4: Run test — expect passes**

```bash
pnpm --filter @quran-corpus/web test
```

Expected: 6/6 SurahCard tests pass.

- [ ] **Step 5: Create surah list page**

Create `src/app/surah/page.tsx`:

```tsx
import { getDatabase } from '../../lib/db';
import { getAllSurahs } from '@quran-corpus/data';
import { SurahCard } from '../../components/surah-list/SurahCard';

export const metadata = { title: 'Surahs — Quran Corpus' };

export default async function SurahListPage() {
  const db = await getDatabase();
  const surahs = await getAllSurahs(db);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-paper-900 dark:text-paper-100">
        Quran
      </h1>
      {surahs.length === 0 ? (
        <p className="text-paper-500">
          No surahs found. Run{' '}
          <code className="rounded bg-paper-200 px-1 py-0.5 text-sm dark:bg-night-100">
            uv run scraper seed
          </code>{' '}
          to seed the database.
        </p>
      ) : (
        <ul className="space-y-2">
          {surahs.map((surah) => (
            <li key={surah.id}>
              <SurahCard surah={surah} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 6: Type-check**

```bash
pnpm --filter @quran-corpus/web type-check
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/surah-list/SurahCard.tsx apps/web/src/app/surah/page.tsx apps/web/src/test/SurahCard.test.tsx
git commit -m "feat(web): add surah list page and SurahCard component"
```

---

## Task 4: Reader page + SurahHeader

**Files:**
- Create: `apps/web/src/app/surah/[id]/page.tsx`
- Create: `apps/web/src/components/reader/SurahHeader.tsx`
- Create: `apps/web/src/components/reader/ReaderView.tsx`

Work in `/home/dev/projects-dev/quran-corpus-pwa/apps/web`.

Note: `ReaderView` is a Client Component (`"use client"`) — it owns `selectedWord` state, receives pre-fetched data as props from the Server Component page.

- [ ] **Step 1: Create SurahHeader**

Create `src/components/reader/SurahHeader.tsx`:

```tsx
import Link from 'next/link';
import type { Surah } from '@quran-corpus/data';

interface SurahHeaderProps {
  surah: Surah;
  lang: string;
}

export function SurahHeader({ surah, lang }: SurahHeaderProps) {
  return (
    <header className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Link
          href="/surah"
          className="text-paper-500 hover:text-paper-700 text-sm transition-colors"
        >
          ← Surahs
        </Link>
      </div>
      <div className="text-center">
        <p className="font-arabic text-4xl text-paper-900 dark:text-paper-100 mb-1">
          {surah.name_arabic}
        </p>
        <p className="text-paper-500 text-lg">{surah.name_translit}</p>
        <p className="text-paper-400 text-sm mt-1">
          {surah.name_translation} · {surah.revelation_type.charAt(0).toUpperCase() + surah.revelation_type.slice(1)} ·{' '}
          {surah.ayah_count} ayahs
        </p>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Create ReaderView (Client Component stub)**

Create `src/components/reader/ReaderView.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { Ayah, Word, Translation } from '@quran-corpus/data';
import { AyahView } from './AyahView';
import { WordPopover } from './WordPopover';

interface ReaderViewProps {
  ayahs: Ayah[];
  wordsByAyah: Record<number, Word[]>;
  translationsByAyah: Record<number, Translation>;
  lang: string;
}

export function ReaderView({ ayahs, wordsByAyah, translationsByAyah }: ReaderViewProps) {
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);

  return (
    <div>
      {ayahs.map((ayah) => (
        <AyahView
          key={ayah.id}
          ayah={ayah}
          words={wordsByAyah[ayah.id] ?? []}
          translation={translationsByAyah[ayah.id]}
          onWordClick={setSelectedWord}
        />
      ))}
      <WordPopover word={selectedWord} onClose={() => setSelectedWord(null)} />
    </div>
  );
}
```

- [ ] **Step 3: Create reader page (Server Component)**

Create `src/app/surah/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { getDatabase } from '../../../lib/db';
import {
  getSurahById,
  getAyahsBySurah,
  getWordsBySurah,
  getTranslationsBySurahAndLang,
} from '@quran-corpus/data';
import type { Word, Translation } from '@quran-corpus/data';
import { SurahHeader } from '../../../components/reader/SurahHeader';
import { ReaderView } from '../../../components/reader/ReaderView';
import { LanguageBar } from '../../../components/reader/LanguageBar';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}

export default async function SurahPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { lang = 'en' } = await searchParams;
  const surahId = parseInt(id, 10);

  if (isNaN(surahId) || surahId < 1 || surahId > 114) notFound();

  const db = await getDatabase();
  const [surah, ayahs, words, translations] = await Promise.all([
    getSurahById(db, surahId),
    getAyahsBySurah(db, surahId),
    getWordsBySurah(db, surahId),
    getTranslationsBySurahAndLang(db, surahId, lang),
  ]);

  if (!surah) notFound();

  // Group words by ayah_id
  const wordsByAyah: Record<number, Word[]> = {};
  for (const word of words) {
    (wordsByAyah[word.ayah_id] ??= []).push(word);
  }

  // Index translations by ayah_id (one per ayah for this lang)
  const translationsByAyah: Record<number, Translation> = {};
  for (const t of translations) {
    translationsByAyah[t.ayah_id] = t;
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <SurahHeader surah={surah} lang={lang} />
      <LanguageBar surahId={surahId} activeLang={lang} />
      <ReaderView
        ayahs={ayahs}
        wordsByAyah={wordsByAyah}
        translationsByAyah={translationsByAyah}
        lang={lang}
      />
    </main>
  );
}
```

- [ ] **Step 4: Create LanguageBar stub (needed for page to compile)**

Create `src/components/reader/LanguageBar.tsx`:

```tsx
import Link from 'next/link';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'uz', label: 'Uzbek' },
  { code: 'ru', label: 'Russian' },
];

interface LanguageBarProps {
  surahId: number;
  activeLang: string;
}

export function LanguageBar({ surahId, activeLang }: LanguageBarProps) {
  return (
    <div className="mb-6 flex gap-2">
      {LANGUAGES.map(({ code, label }) => (
        <Link
          key={code}
          href={`/surah/${surahId}?lang=${code}`}
          className={
            activeLang === code
              ? 'rounded-full bg-paper-900 px-3 py-1 text-xs text-paper-50 dark:bg-paper-100 dark:text-paper-900'
              : 'rounded-full bg-paper-200 px-3 py-1 text-xs text-paper-600 transition-colors hover:bg-paper-300 dark:bg-night-100 dark:text-paper-400'
          }
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Create AyahView stub and WordPopover stub (so ReaderView compiles)**

Create `src/components/reader/AyahView.tsx` (stub — full implementation in Task 5):

```tsx
import type { Ayah, Word, Translation } from '@quran-corpus/data';

interface AyahViewProps {
  ayah: Ayah;
  words: Word[];
  translation?: Translation;
  onWordClick: (word: Word) => void;
}

export function AyahView({ ayah, words, translation, onWordClick }: AyahViewProps) {
  return (
    <div className="mb-10">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-paper-200 text-xs text-paper-600 dark:bg-night-100 dark:text-paper-400">
          {ayah.ayah_number}
        </span>
      </div>
      <div dir="rtl" className="flex flex-wrap gap-x-1 gap-y-2 font-arabic text-3xl leading-loose">
        {words.length > 0
          ? words.map((word) => (
              <button
                key={word.id}
                onClick={() => onWordClick(word)}
                className="cursor-pointer rounded px-0.5 hover:bg-paper-200 dark:hover:bg-night-100"
              >
                {word.text_arabic}
              </button>
            ))
          : ayah.text_uthmani}
      </div>
      {translation && (
        <p className="mt-3 text-base leading-relaxed text-paper-600 dark:text-paper-400">
          {translation.text}
        </p>
      )}
    </div>
  );
}
```

Create `src/components/reader/WordPopover.tsx` (stub — full implementation in Task 6):

```tsx
'use client';

import type { Word } from '@quran-corpus/data';

interface WordPopoverProps {
  word: Word | null;
  onClose: () => void;
}

export function WordPopover({ word, onClose }: WordPopoverProps) {
  if (!word) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-paper-50 p-6 shadow-xl dark:bg-night-200"
    >
      <button onClick={onClose} className="absolute right-4 top-4 text-paper-400" aria-label="Close">
        ✕
      </button>
      <p className="font-arabic text-5xl text-right mb-2">{word.text_arabic}</p>
      {word.transliteration && (
        <p className="text-paper-500 text-lg">{word.transliteration}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Type-check**

```bash
pnpm --filter @quran-corpus/web type-check
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/surah/ apps/web/src/components/reader/
git commit -m "feat(web): add surah reader page with server-side data fetching"
```

---

## Task 5: AyahView + WordToken components with tests

**Files:**
- Modify: `apps/web/src/components/reader/AyahView.tsx` (replace stub with full impl)
- Create: `apps/web/src/components/reader/WordToken.tsx`
- Create: `apps/web/src/test/AyahView.test.tsx`
- Create: `apps/web/src/test/WordToken.test.tsx`

Work in `/home/dev/projects-dev/quran-corpus-pwa/apps/web`.

- [ ] **Step 1: Write failing WordToken tests**

Create `src/test/WordToken.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WordToken } from '../components/reader/WordToken';
import type { Word } from '@quran-corpus/data';

const word: Word = {
  id: 1,
  ayah_id: 1,
  position: 1,
  text_arabic: 'بِسْمِ',
  transliteration: 'bismi',
  root: null,
  lemma: null,
  pos_tag: 'P',
  morphology_json: '["P","N"]',
};

describe('WordToken', () => {
  it('renders the Arabic text', () => {
    render(<WordToken word={word} onClick={vi.fn()} />);
    expect(screen.getByText('بِسْمِ')).toBeInTheDocument();
  });

  it('calls onClick with word when clicked', () => {
    const onClick = vi.fn();
    render(<WordToken word={word} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledWith(word);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders as a button', () => {
    render(<WordToken word={word} onClick={vi.fn()} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — expect failures**

```bash
pnpm --filter @quran-corpus/web test
```

Expected: `Cannot find module '../components/reader/WordToken'`

- [ ] **Step 3: Create WordToken component**

Create `src/components/reader/WordToken.tsx`:

```tsx
import type { Word } from '@quran-corpus/data';

interface WordTokenProps {
  word: Word;
  onClick: (word: Word) => void;
}

export function WordToken({ word, onClick }: WordTokenProps) {
  return (
    <button
      onClick={() => onClick(word)}
      className="cursor-pointer rounded px-0.5 leading-loose transition-colors hover:bg-paper-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-paper-500 dark:hover:bg-night-100"
    >
      {word.text_arabic}
    </button>
  );
}
```

- [ ] **Step 4: Write failing AyahView tests**

Create `src/test/AyahView.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AyahView } from '../components/reader/AyahView';
import type { Ayah, Word, Translation } from '@quran-corpus/data';

const ayah: Ayah = {
  id: 1,
  surah_id: 1,
  ayah_number: 1,
  text_uthmani: 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ',
  text_simple: null,
  juz: 1,
  page: 1,
  audio_url: null,
};

const words: Word[] = [
  { id: 1, ayah_id: 1, position: 1, text_arabic: 'بِسْمِ', transliteration: 'bismi', root: null, lemma: null, pos_tag: 'P', morphology_json: null },
  { id: 2, ayah_id: 1, position: 2, text_arabic: 'ٱللَّهِ', transliteration: 'l-lahi', root: null, lemma: null, pos_tag: 'PN', morphology_json: null },
];

const translation: Translation = {
  id: 1,
  ayah_id: 1,
  language_code: 'en',
  translator: 'Sahih International',
  text: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
};

describe('AyahView', () => {
  it('renders ayah number badge', () => {
    render(<AyahView ayah={ayah} words={[]} onWordClick={vi.fn()} />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders word tokens when words are provided', () => {
    render(<AyahView ayah={ayah} words={words} onWordClick={vi.fn()} />);
    expect(screen.getByText('بِسْمِ')).toBeInTheDocument();
    expect(screen.getByText('ٱللَّهِ')).toBeInTheDocument();
  });

  it('falls back to text_uthmani block when no words', () => {
    render(<AyahView ayah={ayah} words={[]} onWordClick={vi.fn()} />);
    expect(screen.getByText(ayah.text_uthmani)).toBeInTheDocument();
  });

  it('calls onWordClick when a word token is clicked', () => {
    const onWordClick = vi.fn();
    render(<AyahView ayah={ayah} words={words} onWordClick={onWordClick} />);
    fireEvent.click(screen.getByText('بِسْمِ'));
    expect(onWordClick).toHaveBeenCalledWith(words[0]);
  });

  it('renders translation when provided', () => {
    render(<AyahView ayah={ayah} words={[]} translation={translation} onWordClick={vi.fn()} />);
    expect(screen.getByText(translation.text)).toBeInTheDocument();
  });

  it('renders nothing for translation when not provided', () => {
    render(<AyahView ayah={ayah} words={[]} onWordClick={vi.fn()} />);
    expect(screen.queryByText(translation.text)).toBeNull();
  });
});
```

- [ ] **Step 5: Replace AyahView stub with full implementation**

Replace `src/components/reader/AyahView.tsx`:

```tsx
import type { Ayah, Word, Translation } from '@quran-corpus/data';
import { WordToken } from './WordToken';

interface AyahViewProps {
  ayah: Ayah;
  words: Word[];
  translation?: Translation;
  onWordClick: (word: Word) => void;
}

export function AyahView({ ayah, words, translation, onWordClick }: AyahViewProps) {
  return (
    <article className="mb-10">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-paper-200 text-xs text-paper-600 dark:bg-night-100 dark:text-paper-400">
          {ayah.ayah_number}
        </span>
      </div>

      <div dir="rtl" className="flex flex-wrap gap-x-1 gap-y-2 font-arabic text-3xl leading-loose">
        {words.length > 0 ? (
          words.map((word) => (
            <WordToken key={word.id} word={word} onClick={onWordClick} />
          ))
        ) : (
          <span className="text-paper-900 dark:text-paper-100">{ayah.text_uthmani}</span>
        )}
      </div>

      {translation && (
        <p className="mt-4 text-base leading-relaxed text-paper-600 dark:text-paper-400">
          {translation.text}
        </p>
      )}
    </article>
  );
}
```

- [ ] **Step 6: Run all tests — expect passes**

```bash
pnpm --filter @quran-corpus/web test
```

Expected: all tests pass (WordToken: 3, AyahView: 6, SurahCard: 6 = 15+ passing).

- [ ] **Step 7: Type-check**

```bash
pnpm --filter @quran-corpus/web type-check
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/reader/WordToken.tsx apps/web/src/components/reader/AyahView.tsx apps/web/src/test/WordToken.test.tsx apps/web/src/test/AyahView.test.tsx
git commit -m "feat(web): add AyahView and WordToken components"
```

---

## Task 6: WordPopover — Framer Motion bottom sheet

**Files:**
- Modify: `apps/web/src/components/reader/WordPopover.tsx` (replace stub with full impl)
- Create: `apps/web/src/test/WordPopover.test.tsx`

Work in `/home/dev/projects-dev/quran-corpus-pwa/apps/web`.

The popover is a bottom sheet: backdrop dims the page, sheet slides up from bottom. Framer Motion's `AnimatePresence` handles mount/unmount animation.

- [ ] **Step 1: Write failing tests**

Create `src/test/WordPopover.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WordPopover } from '../components/reader/WordPopover';
import type { Word } from '@quran-corpus/data';

const word: Word = {
  id: 1,
  ayah_id: 1,
  position: 1,
  text_arabic: 'بِسْمِ',
  transliteration: 'bismi',
  root: 'س م و',
  lemma: null,
  pos_tag: 'P',
  morphology_json: '["P","N"]',
};

describe('WordPopover', () => {
  it('renders nothing when word is null', () => {
    const { container } = render(<WordPopover word={null} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders Arabic word text when open', () => {
    render(<WordPopover word={word} onClose={vi.fn()} />);
    expect(screen.getByText('بِسْمِ')).toBeInTheDocument();
  });

  it('renders transliteration', () => {
    render(<WordPopover word={word} onClose={vi.fn()} />);
    expect(screen.getByText('bismi')).toBeInTheDocument();
  });

  it('renders POS tag', () => {
    render(<WordPopover word={word} onClose={vi.fn()} />);
    expect(screen.getByText('P')).toBeInTheDocument();
  });

  it('renders root when present', () => {
    render(<WordPopover word={word} onClose={vi.fn()} />);
    expect(screen.getByText('س م و')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<WordPopover word={word} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<WordPopover word={word} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('popover-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders dialog role', () => {
    render(<WordPopover word={word} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — expect failures**

```bash
pnpm --filter @quran-corpus/web test
```

Expected: tests fail (stub doesn't have backdrop or morphology display).

- [ ] **Step 3: Replace stub with full WordPopover implementation**

Replace `src/components/reader/WordPopover.tsx`:

```tsx
'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { Word } from '@quran-corpus/data';

interface WordPopoverProps {
  word: Word | null;
  onClose: () => void;
}

function parseMorphology(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

export function WordPopover({ word, onClose }: WordPopoverProps) {
  const segments = parseMorphology(word?.morphology_json ?? null);

  return (
    <AnimatePresence>
      {word && (
        <>
          <motion.div
            data-testid="popover-backdrop"
            className="fixed inset-0 z-40 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-paper-50 px-6 pb-8 pt-6 shadow-2xl dark:bg-night-200"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            {/* Drag handle */}
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-paper-300 dark:bg-night-50" />

            <button
              onClick={onClose}
              className="absolute right-5 top-5 flex h-7 w-7 items-center justify-center rounded-full bg-paper-200 text-paper-500 transition-colors hover:bg-paper-300 dark:bg-night-100 dark:text-paper-400"
              aria-label="Close"
            >
              ✕
            </button>

            {/* Arabic word */}
            <p className="mb-1 font-arabic text-5xl text-right text-paper-900 dark:text-paper-100">
              {word.text_arabic}
            </p>

            {/* Transliteration */}
            {word.transliteration && (
              <p className="mb-4 text-lg text-paper-500">{word.transliteration}</p>
            )}

            {/* Metadata row */}
            <div className="flex flex-wrap gap-2 mb-4">
              {word.pos_tag && (
                <span className="rounded-full bg-paper-200 px-3 py-0.5 text-sm font-medium text-paper-700 dark:bg-night-100 dark:text-paper-300">
                  {word.pos_tag}
                </span>
              )}
              {word.root && (
                <span className="font-arabic rounded-full bg-paper-200 px-3 py-0.5 text-sm text-paper-700 dark:bg-night-100 dark:text-paper-300">
                  {word.root}
                </span>
              )}
            </div>

            {/* Morphology segments */}
            {segments.length > 1 && (
              <div className="flex gap-2 flex-wrap">
                {segments.map((seg, i) => (
                  <span
                    key={i}
                    className="rounded bg-paper-100 px-2 py-0.5 text-xs text-paper-600 dark:bg-night-100 dark:text-paper-400"
                  >
                    {seg}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 4: Run tests — expect passes**

```bash
pnpm --filter @quran-corpus/web test
```

Expected: all tests pass (8 WordPopover + 15 earlier = 23+ passing).

- [ ] **Step 5: Type-check**

```bash
pnpm --filter @quran-corpus/web type-check
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/reader/WordPopover.tsx apps/web/src/test/WordPopover.test.tsx
git commit -m "feat(web): add WordPopover Framer Motion bottom sheet"
```

---

## Task 7: Wire globals.css, PWA manifest, and dev smoke test

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/public/manifest.json` (verify)
- Modify: `apps/web/src/app/layout.tsx` (add Inter font for Latin text)

Work in `/home/dev/projects-dev/quran-corpus-pwa/apps/web`.

- [ ] **Step 1: Update globals.css with scroll and selection styles**

Replace `src/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-arabic: 'Amiri', 'Noto Naskh Arabic', serif;
}

[dir='rtl'] {
  font-family: var(--font-arabic);
}

/* Smooth scrolling for ayah navigation */
html {
  scroll-behavior: smooth;
}

/* Arabic text selection colour */
::selection {
  background-color: rgb(180 160 120 / 0.3);
}
```

- [ ] **Step 2: Add Inter font to layout.tsx**

Replace `src/app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from 'next';
import { Amiri, Inter } from 'next/font/google';
import './globals.css';

const amiri = Amiri({
  weight: ['400', '700'],
  subsets: ['arabic', 'latin'],
  variable: '--font-arabic',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

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
    <html lang="en" className={`${amiri.variable} ${inter.variable}`}>
      <body className="bg-paper-50 font-sans text-paper-900 antialiased dark:bg-night-300 dark:text-paper-100">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Start dev server and verify the golden path**

```bash
# First, seed the database (from packages/scraper):
cd ../../packages/scraper && uv run scraper seed --db ../../apps/web/quran.db && cd ../../apps/web

# Start dev server:
pnpm --filter @quran-corpus/web dev
```

Open `http://localhost:3000` — should redirect to `http://localhost:3000/surah`.

Expected:
- `/surah` shows the list of 114 surahs (Arabic names + transliterations)
- `/surah/1` shows Al-Fatiha with Arabic names but NO word tokens (words table empty — scraper not run yet)
- Language bar shows English / Uzbek / Russian tabs
- No JavaScript errors in console

- [ ] **Step 4: Type-check**

```bash
pnpm --filter @quran-corpus/web type-check
```

Expected: no errors.

- [ ] **Step 5: Run full test suite**

```bash
pnpm --filter @quran-corpus/web test
```

Expected: all component tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/globals.css apps/web/src/app/layout.tsx
git commit -m "feat(web): add Inter font, scroll styles, PWA layout polish"
```

---

## Task 8: Final integration — type-check, tests, and push

Work from the monorepo root `/home/dev/projects-dev/quran-corpus-pwa`.

- [ ] **Step 1: Run all tests across the monorepo**

```bash
pnpm --filter @quran-corpus/data test
pnpm --filter @quran-corpus/web test
```

Expected: all tests pass (data: 22+, web: 23+).

- [ ] **Step 2: Type-check all packages**

```bash
pnpm --filter @quran-corpus/data type-check
pnpm --filter @quran-corpus/web type-check
```

Expected: no errors.

- [ ] **Step 3: Lint**

```bash
pnpm --filter @quran-corpus/web lint
```

Expected: no errors.

- [ ] **Step 4: Push**

```bash
git push origin main
```

---

## Self-review

**Spec coverage check:**

| Requirement (from PRD/CLAUDE.md) | Task that covers it |
|---|---|
| Surah list page | Task 3 |
| Reader page with Arabic text | Tasks 4, 5 |
| Word-by-word display (clickable) | Task 5 (WordToken) |
| Word morphology popover | Task 6 (WordPopover) |
| Translation display | Task 5 (AyahView) |
| Language switching via URL | Task 4 (LanguageBar) |
| Component tests for popover | Task 6 |
| Amiri Arabic font | Task 7 (layout.tsx) |
| WCAG AA — button roles, aria-label, focus-visible | Tasks 5, 6 |
| Framer Motion animations | Task 6 |
| Graceful empty-DB state | Tasks 3 (empty state), 5 (text_uthmani fallback) |
| Batch queries (no N+1) | Task 1 |

**No placeholders found** — all tasks contain complete code.

**Type consistency confirmed:** `Word`, `Ayah`, `Translation`, `Surah` used consistently from `@quran-corpus/data` throughout. `onWordClick: (word: Word) => void` signature consistent between `AyahView → WordToken → WordToken.onClick`.
