# M1 Real Offline Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the M0 spike screen with an Android-first reader MVP that opens the bundled PWA corpus offline, lets users browse surahs, read Arabic with English/Uzbek/Russian translations, save local bookmarks/history/settings, view credits, and stream ayah audio through the app-owned Abdul Rashid Sufi endpoint.

**Architecture:** Keep `@quran-corpus/data/mobile` as the source of read-only corpus semantics and keep `@quran-corpus/mobile-data` as the SQLite driver adapter. Add a small writable local-user database for bookmarks, reading history, and settings so corpus data stays immutable and replaceable by app releases. Structure the Expo app around route-level screens, focused repositories, typed app settings, and privacy-safe instrumentation wrappers.

**Tech Stack:** React Native + Expo SDK, Expo Router, TypeScript, `expo-sqlite`, `expo-asset`, `expo-font`, `expo-av` or the current Expo audio package available in the installed SDK, Vitest for repositories/helpers, React Native component tests where practical, Sentry React Native/Expo, PostHog React Native with autocapture/session replay disabled.

## Global Constraints

- Android first, scalable to iOS.
- Platform is React Native + Expo.
- First launch must work offline for core corpus reader features via bundled DB.
- UI and content languages are English, Uzbek, and Russian, with scalable locale/content architecture.
- M1 reader scope includes surah list, surah reader, English/Uzbek/Russian translation display, bookmarks, reading history, theme, About/Credits, basic ayah audio streaming through the thin endpoint, and privacy-safe crash/analytics instrumentation.
- M1 does not ship treebank, cloud sync, accounts, offline audio downloads, public API, dictionary UI, full morphology UI, or full offline search UI.
- User data is local-only for v1.
- Corpus DB is immutable bundled data in v1; app releases replace it.
- No in-place corpus DB migrations on device for corpus data in v1.
- Audio streams through our own thin endpoint backed by QUA/QuranicAudio metadata; no direct QuranClip dependency.
- V1 reciter is Abdul Rashid Sufi.
- Crash reporting provider: Sentry for React Native/Expo.
- Product analytics provider: PostHog React Native with autocapture/session replay off by default; capture only explicit privacy-safe events.
- Do not capture Quran text, search text, personal notes, or raw user input in analytics.
- Use CodeRabbit as automated review gate; Greptile is not used.
- Keep `packages/data` as the source of corpus query semantics; do not copy corpus query logic into screen components.
- Follow the repo review loop in `CLAUDE.md`: Implement -> Self Review -> code review -> lint/type/test -> CodeRabbit Review -> Final Review.

---

## Execution Stop Conditions

The PWA project already has the data import path and a generated local DB:

- Importers live in `/root/projects-codex/quran-corpus-pwa/packages/scraper/scraper/sources/`.
- Arabic ayah text importer: `tanzil.py`, from Tanzil Uthmani XML.
- Translation importers: `quranenc.py`, from QuranEnc flat JSON, and `qul.py`, from Tarteel AI Quranic Universal Library simple JSON.
- Corpus morphology importer: `corpus_import.py`, from Quranic Arabic Corpus morphology text.
- Generated local DB found during planning: `/home/claude/quran-data/quran.db`, size about 134 MB.
- Local M1 development uses the existing ignored DB asset at `apps/mobile/assets/db/quran.db`, already copied from the generated PWA corpus DB.
- DB inspection on 2026-07-28 showed 114 surahs, 6,236 ayahs, 77,429 words, 43,652 translation rows, and languages `ar`, `en`, `uz`, `ru`.
- Translation rows found in that DB:
  - English: Saheeh International, 6,236 rows.
  - Uzbek: Alauddin Mansour, 6,236 rows.
  - Uzbek: Muhammad Sodik Muhammad Yusuf, 6,236 rows.
  - Russian: Abu Adel, 6,236 rows.
  - Russian: Elmir Kuliev, 6,236 rows.
  - Russian: Ministry of Awqaf, Egypt, 6,236 rows.
  - Russian: Rowwad Translation Center, 6,236 rows.

The implementer must stop before Task 2 if `docs/data-sources-m1.md` does not record exactly one selected M1 translator for each content language:

- English: Saheeh International.
- Uzbek: Muhammad Sodik Muhammad Yusuf.
- Russian: Abu Adel.

The implementer must stop before Play Store release work if these inputs are not recorded in `docs/data-sources-m1.md`:

- English translation source, license, attribution text, and database language code.
- Uzbek translation source, license, attribution text, and database language code.
- Russian translation source, license, attribution text, and database language code.
- Arabic text source and attribution text.
- Hafs font source, license, and attribution text.
- Audio endpoint base URL for Android development builds.
- Sentry DSN handling decision: `EXPO_PUBLIC_SENTRY_DSN` allowed as public config, or disabled for local builds.
- PostHog project key and host handling decision: public config allowed, or disabled for local builds.

Use this exact source-record format when a source exists but release approval is not yet complete:

```markdown
| Dataset | Source | License | Attribution | Code | Approved by | Approval date |
| --- | --- | --- | --- | --- | --- | --- |
| English translation | Existing PWA DB: Saheeh International | Needs release sign-off | Needs release sign-off | en | Not approved | Not approved |
```

Do not substitute a new public dataset to keep execution moving. Reuse the PWA importers/generated DB unless product explicitly changes the data source.

## File Structure

- Create `docs/data-sources-m1.md`
  Product/legal approval record for existing PWA text, translations, font, audio, crash reporting, and analytics.

- Modify `packages/mobile-data/scripts/create-m0-fixture-db.ts`
  Generalize the fixture generator into a repeatable M1 DB build script, or keep it as M0 and add a new M1 script.

- Create `packages/mobile-data/scripts/create-m1-reader-db.ts`
  Validates the existing ignored `apps/mobile/assets/db/quran.db` copied from the PWA-generated corpus DB, or copies from `QURAN_CORPUS_SOURCE_DB` if the local asset is absent.

- Create `packages/mobile-data/tests/m1-reader-db-contract.test.ts`
  Verifies M1 DB has all surahs, ayahs, translations for `en`, `uz`, `ru`, and reader-critical indexes.

- Modify `apps/mobile/src/data/openCorpusDb.ts`
  Open `quran.db`, expose corpus version metadata, and preserve the M0 fixture only for tests if still useful.

- Modify `apps/mobile/src/data/corpusRepository.ts`
  Replace M0-only functions with `getSurahList()`, `getSurahReader(surahId, languageCode)`, and `getAyahReaderLocation(surahId, ayahNumber, languageCode)`.

- Modify `apps/mobile/src/data/corpusRepository.test.ts`
  Test the generic reader repository behavior with a fake mobile client.

- Create `apps/mobile/src/data/userDb.ts`
  Creates/opens the writable user database and runs idempotent local schema setup.

- Create `apps/mobile/src/data/userRepository.ts`
  Bookmark, reading-history, and settings persistence functions.

- Create `apps/mobile/src/data/userRepository.test.ts`
  Fake or in-memory tests for local-only user persistence behavior.

- Create `apps/mobile/src/data/userRepository.testHelpers.ts`
  In-memory fake user DB client for repository tests.

- Create `apps/mobile/src/i18n/uiStrings.ts`
  UI string catalog for English, Uzbek, and Russian.

- Modify `apps/mobile/src/i18n/languages.ts`
  Separate UI locale and content translation language metadata.

- Create `apps/mobile/src/settings/settingsStore.tsx`
  React hook/provider for theme, UI locale, content language, font size, and analytics opt-in state.

- Create `apps/mobile/src/telemetry/telemetry.ts`
  Privacy-safe wrapper around Sentry/PostHog with no-op behavior when config is absent.

- Create `apps/mobile/src/audio/ayahAudio.ts`
  Thin endpoint client and playback state helpers.

- Modify `apps/mobile/src/api/audio.ts`
  Keep only the HTTP contract helper, and move UI/playback state out of `api`.

- Create `apps/mobile/app/(tabs)/_layout.tsx`
  Android bottom tab navigation for Home, Surahs, Bookmarks, Settings.

- Create `apps/mobile/app/(tabs)/index.tsx`
  Continue-reading home screen.

- Create `apps/mobile/app/(tabs)/surahs.tsx`
  Surah list screen.

- Create `apps/mobile/app/(tabs)/bookmarks.tsx`
  Local bookmarks screen.

- Create `apps/mobile/app/(tabs)/settings.tsx`
  Settings/About/Credits entry screen.

- Create `apps/mobile/app/surah/[surahId].tsx`
  Reader route with language selector, bookmark controls, and ayah audio controls.

- Create `apps/mobile/app/about.tsx`
  Offline credits/licenses/about screen.

- Modify `apps/mobile/app/_layout.tsx`
  Load fonts, open DBs, bootstrap settings/telemetry, and render route stack.

- Replace `apps/mobile/app/index.tsx`
  Move the M0 single screen into route-based tabs.

- Create `apps/mobile/src/components/SurahList.tsx`
  Virtualized list of all surahs.

- Create `apps/mobile/src/components/SurahReader.tsx`
  Virtualized ayah reader component.

- Create `apps/mobile/src/components/AyahCard.tsx`
  Ayah text, translation, bookmark, share, and audio button row.

- Create `apps/mobile/src/components/LanguageSelector.tsx`
  Reusable segmented control for content language.

- Create `apps/mobile/src/components/ThemeToggle.tsx`
  Native toggle for light/dark/system theme.

- Create `apps/mobile/src/components/EmptyState.tsx`
  Shared empty state for bookmarks/history.

- Modify `apps/mobile/src/theme/tokens.ts`
  Add light/dark tokens, typography sizes, touch target sizes, and status colors.

- Modify `apps/mobile/app.json`
  Add Android package metadata, scheme, runtime config placeholders, and plugin config needed by telemetry/audio packages.

---

### Task 1: Product And Source Approval Record

**Files:**
- Create: `docs/data-sources-m1.md`

**Interfaces:**
- Consumes: product/legal decisions from the owner.
- Produces: `docs/data-sources-m1.md` approval table that Task 2 must read before building the DB.

- [ ] **Step 1: Create the approval record**

Create `docs/data-sources-m1.md`:

```markdown
# M1 Data Sources And Runtime Config

> M1 execution may use the existing PWA-generated DB for development. Play Store release work must not ship a source whose license or attribution is marked `Needs release sign-off` or `Not approved`.

## Corpus And Translation Sources

| Dataset | Source | License | Attribution | Code | Approved by | Approval date |
| --- | --- | --- | --- | --- | --- | --- |
| Arabic Quran text | Existing PWA importer: Tanzil Uthmani XML via `packages/scraper/scraper/sources/tanzil.py`; generated DB `/home/claude/quran-data/quran.db` | Needs release sign-off | Needs release sign-off | ar | Not approved | Not approved |
| English translation | Existing PWA DB: Saheeh International, likely QuranEnc/QUL import path | Needs release sign-off | Needs release sign-off | en | Not approved | Not approved |
| Uzbek translation | Existing PWA DB: Muhammad Sodik Muhammad Yusuf | Needs release sign-off | Needs release sign-off | uz | Not approved | Not approved |
| Russian translation | Existing PWA DB: Abu Adel | Needs release sign-off | Needs release sign-off | ru | Not approved | Not approved |
| Hafs font | Existing mobile asset: `apps/mobile/assets/fonts/hafs.18.woff2` | Needs release sign-off | Needs release sign-off | hafs | Not approved | Not approved |
| Abdul Rashid Sufi audio metadata | Not approved | Not approved | Not approved | abdul-rashid-sufi | Not approved | Not approved |

## Runtime Services

| Service | Config key | Value source | Privacy constraint | Enabled in local dev |
| --- | --- | --- | --- | --- |
| Audio endpoint | EXPO_PUBLIC_AUDIO_API_BASE_URL | Not approved | No user identifiers in URL | No |
| Sentry | EXPO_PUBLIC_SENTRY_DSN | Not approved | No Quran text or raw user input | No |
| PostHog | EXPO_PUBLIC_POSTHOG_KEY, EXPO_PUBLIC_POSTHOG_HOST | Not approved | Autocapture and session replay disabled | No |

## M1 Translation Selection

| Language | Selected translator |
| --- | --- |
| en | Saheeh International |
| uz | Muhammad Sodik Muhammad Yusuf |
| ru | Abu Adel |
```

- [ ] **Step 2: Verify release sign-off is still visible**

Run: `grep -nE "Needs release sign-off|Not approved" docs/data-sources-m1.md`

Expected: PASS-like output showing unresolved release/sign-off rows clearly marked, with M1 translators selected.

- [ ] **Step 3: Commit**

```bash
git add docs/data-sources-m1.md
git commit -m "docs: record M1 source approval gates"
```

### Task 2: M1 Corpus DB Builder Contract

**Files:**
- Create: `packages/mobile-data/scripts/create-m1-reader-db.ts`
- Create: `packages/mobile-data/tests/m1-reader-db-contract.test.ts`
- Modify: `packages/mobile-data/package.json`
- Modify: `package.json`

**Interfaces:**
- Consumes: existing ignored local DB `apps/mobile/assets/db/quran.db`, optional fallback `QURAN_CORPUS_SOURCE_DB`, and selected M1 translators named in `docs/data-sources-m1.md`.
- Produces/validates: `apps/mobile/assets/db/quran.db` with complete reader data for all 114 surahs, 6,236 ayahs, and at least one complete translation set for each of `en`, `uz`, and `ru`. Later reader tasks must filter to the selected M1 translator per language.

- [ ] **Step 1: Write the failing DB contract test**

Create `packages/mobile-data/tests/m1-reader-db-contract.test.ts`:

```ts
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createDatabase } from '../../data/src/db';

const dbPath = '../../apps/mobile/assets/db/quran.db';

describe('M1 reader DB contract', () => {
  it('contains complete reader rows and translations', async () => {
    expect(existsSync(dbPath)).toBe(true);
    const db = createDatabase(`file:${dbPath}`);

    try {
      const surahs = await db.execute('SELECT count(*) AS n FROM surahs');
      const ayahs = await db.execute('SELECT count(*) AS n FROM ayahs');
      const words = await db.execute('SELECT count(*) AS n FROM words');
      const languages = await db.execute("SELECT code FROM languages WHERE code IN ('en', 'uz', 'ru') ORDER BY code");
      const translations = await db.execute(`
        SELECT language_code, count(*) AS n
        FROM translations
        WHERE language_code IN ('en', 'uz', 'ru')
        GROUP BY language_code
        ORDER BY language_code
      `);

      expect(surahs.rows[0]?.n).toBe(114);
      expect(ayahs.rows[0]?.n).toBe(6236);
      expect(Number(words.rows[0]?.n)).toBeGreaterThan(0);
      expect(languages.rows.map((row) => row.code)).toEqual(['en', 'ru', 'uz']);
      expect(translations.rows.map((row) => row.language_code)).toEqual(['en', 'ru', 'uz']);
      for (const row of translations.rows) {
        expect(Number(row.n)).toBeGreaterThanOrEqual(6236);
      }
    } finally {
      db.close();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails before the DB builder exists**

Run: `pnpm --filter @quran-corpus/mobile-data test -- m1-reader-db-contract.test.ts`

Expected: FAIL if `apps/mobile/assets/db/quran.db` is absent or invalid. In this workspace, the ignored local DB already exists and may satisfy the contract before the builder is added.

- [ ] **Step 3: Add scripts**

Modify `packages/mobile-data/package.json` scripts:

```json
{
  "generate:m1-db": "tsx scripts/create-m1-reader-db.ts"
}
```

Modify root `package.json` scripts:

```json
{
  "generate:m1-db": "pnpm --filter @quran-corpus/mobile-data generate:m1-db"
}
```

- [ ] **Step 4: Add guarded builder implementation**

Create `packages/mobile-data/scripts/create-m1-reader-db.ts`:

```ts
import { access, copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createDatabase } from '../../data/src/db';

const repoRoot = resolve('../..');
const sourceDbPath = process.env.QURAN_CORPUS_SOURCE_DB;
const targetDbPath = resolve(repoRoot, 'apps/mobile/assets/db/quran.db');

const selectedTranslators = {
  en: 'Saheeh International',
  uz: 'Muhammad Sodik Muhammad Yusuf',
  ru: 'Abu Adel',
} as const;

function parseM1TranslationSelection(approval: string) {
  const selections = new Map<string, string>();
  const duplicates = new Set<string>();

  for (const line of approval.split(/\r?\n/)) {
    const columns = line.trim().split('|').map((column) => column.trim()).filter(Boolean);
    if (columns.length !== 2) continue;
    const [languageCode, translator] = columns;
    if (!(languageCode in selectedTranslators)) continue;
    if (selections.has(languageCode)) duplicates.add(languageCode);
    selections.set(languageCode, translator);
  }

  if (duplicates.size > 0) throw new Error('M1 translation selection is incomplete');
  for (const [languageCode, translator] of Object.entries(selectedTranslators)) {
    if (selections.get(languageCode) !== translator) {
      throw new Error('M1 translation selection is incomplete');
    }
  }
}

async function validateM1ReaderDbContract(dbPath: string) {
  const db = createDatabase(`file:${dbPath}`);
  try {
    // Validate 114 surahs, 6,236 ayahs, word rows, languages, and 6,236 rows for each selected translator.
  } finally {
    db.close();
  }
}

async function main() {
  const approval = await readFile(resolve(repoRoot, 'docs/data-sources-m1.md'), 'utf8');
  parseM1TranslationSelection(approval);

  try {
    await access(targetDbPath);
  } catch {
    if (!sourceDbPath) {
      throw new Error('Missing apps/mobile/assets/db/quran.db. Set QURAN_CORPUS_SOURCE_DB to copy the generated PWA corpus DB.');
    }
    await mkdir(dirname(targetDbPath), { recursive: true });
    await copyFile(sourceDbPath, targetDbPath);
  }

  await validateM1ReaderDbContract(targetDbPath);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 5: Run generator and confirm approval gate**

Run: `pnpm generate:m1-db`

Expected if translator selection is missing, duplicated, or does not match exactly one `en`, `uz`, and `ru` selected translator row: FAIL with `M1 translation selection is incomplete`.

Expected after translator selection: reuses existing `apps/mobile/assets/db/quran.db`, or creates it from `QURAN_CORPUS_SOURCE_DB` if absent.

- [ ] **Step 6: Commit**

```bash
git add package.json packages/mobile-data/package.json packages/mobile-data/scripts/create-m1-reader-db.ts packages/mobile-data/tests/m1-reader-db-contract.test.ts
git commit -m "test: define M1 reader database contract"
```

### Task 3: Generic Corpus Reader Repository

**Files:**
- Modify: `apps/mobile/src/data/corpusRepository.ts`
- Modify: `apps/mobile/src/data/corpusRepository.test.ts`

**Interfaces:**
- Consumes: `MobileDataClient`, `getAllSurahs`, `getSurahById`, `getAyahsBySurah`, `getWordsBySurah`, `getTranslationsBySurahAndLang`.
- Produces:
  - `getSurahList(client): Promise<SurahListItem[]>`
  - `getSurahReader(client, surahId, languageCode): Promise<SurahReaderData>`
  - `getAyahReaderLocation(client, surahId, ayahNumber, languageCode): Promise<ReaderAyah | null>`

- [ ] **Step 1: Write failing repository tests**

Replace M0-specific test names in `apps/mobile/src/data/corpusRepository.test.ts` with:

```ts
describe('getSurahList', () => {
  it('returns ordered surah list items', async () => {
    const list = await getSurahList(createFakeClient());
    expect(list).toEqual([
      { id: 1, nameArabic: 'الفاتحة', nameTranslit: 'Al-Fatihah', nameTranslation: 'The Opener', ayahCount: 7 },
      { id: 2, nameArabic: 'البقرة', nameTranslit: 'Al-Baqarah', nameTranslation: 'The Cow', ayahCount: 286 },
    ]);
  });
});

describe('getSurahReader', () => {
  it('groups ayahs, words, and selected language translations for any surah', async () => {
    const reader = await getSurahReader(createFakeClient(), 2, 'ru');

    expect(reader.surah.id).toBe(2);
    expect(reader.ayahs).toHaveLength(2);
    expect(reader.ayahs[0]?.translation?.language_code).toBe('ru');
    expect(reader.ayahs[0]?.translation?.translator).toBe('Abu Adel');
    expect(reader.ayahs[0]?.words.map((word) => word.position)).toEqual([1, 2]);
  });
});

describe('getAyahReaderLocation', () => {
  it('returns one ayah in reader shape by surah and ayah number', async () => {
    const ayah = await getAyahReaderLocation(createFakeClient(), 2, 1, 'ru');
    expect(ayah?.ayah.ayah_number).toBe(1);
    expect(ayah?.words).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @quran-corpus/mobile test -- corpusRepository.test.ts`

Expected: FAIL because `getSurahList`, `getSurahReader`, and `getAyahReaderLocation` do not exist.

- [ ] **Step 3: Implement generic repository functions**

Update `apps/mobile/src/data/corpusRepository.ts`:

```ts
export interface SurahListItem {
  id: number;
  nameArabic: string;
  nameTranslit: string;
  nameTranslation: string;
  ayahCount: number;
}

export interface SurahReaderData {
  surah: Surah;
  ayahs: ReaderAyah[];
}

const selectedTranslators: Record<ContentLanguageCode, string> = {
  en: 'Saheeh International',
  uz: 'Muhammad Sodik Muhammad Yusuf',
  ru: 'Abu Adel',
};

function groupWordsByAyah(words: Word[]): Map<number, Word[]> {
  const grouped = new Map<number, Word[]>();
  for (const word of words) {
    const existing = grouped.get(word.ayah_id) ?? [];
    existing.push(word);
    grouped.set(word.ayah_id, existing);
  }
  return grouped;
}

function selectedTranslationByAyah(
  translations: Translation[],
  languageCode: ContentLanguageCode,
): Map<number, Translation> {
  const selectedTranslator = selectedTranslators[languageCode];
  const grouped = new Map<number, Translation>();
  for (const translation of translations) {
    if (translation.translator === selectedTranslator) {
      grouped.set(translation.ayah_id, translation);
    }
  }
  return grouped;
}

export async function getSurahList(client: MobileDataClient): Promise<SurahListItem[]> {
  const db = client as never;
  const surahs = await getAllSurahs(db);
  return surahs.map((surah) => ({
    id: surah.id,
    nameArabic: surah.name_arabic,
    nameTranslit: surah.name_translit,
    nameTranslation: surah.name_translation,
    ayahCount: surah.ayah_count,
  }));
}

export async function getSurahReader(
  client: MobileDataClient,
  surahId: number,
  languageCode: ContentLanguageCode,
): Promise<SurahReaderData> {
  const db = client as never;
  const [surah, ayahs, words, translations] = await Promise.all([
    getSurahById(db, surahId),
    getAyahsBySurah(db, surahId),
    getWordsBySurah(db, surahId),
    getTranslationsBySurahAndLang(db, surahId, languageCode),
  ]);

  if (!surah) throw new Error(`Surah not found: ${surahId}`);

  const wordsByAyah = groupWordsByAyah(words);
  const translationsByAyah = selectedTranslationByAyah(translations, languageCode);

  return {
    surah,
    ayahs: ayahs.map((ayah) => ({
      ayah,
      translation: translationsByAyah.get(ayah.id) ?? null,
      words: wordsByAyah.get(ayah.id) ?? [],
    })),
  };
}

export async function getAyahReaderLocation(
  client: MobileDataClient,
  surahId: number,
  ayahNumber: number,
  languageCode: ContentLanguageCode,
): Promise<ReaderAyah | null> {
  const reader = await getSurahReader(client, surahId, languageCode);
  return reader.ayahs.find((item) => item.ayah.ayah_number === ayahNumber) ?? null;
}
```

- [ ] **Step 4: Remove M0-only exports after screens stop using them**

After Task 8 updates route screens, remove `getM0SurahReader` and `getM0WordDetail` imports from mobile components.

- [ ] **Step 5: Run repository tests**

Run: `pnpm --filter @quran-corpus/mobile test -- corpusRepository.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/data/corpusRepository.ts apps/mobile/src/data/corpusRepository.test.ts
git commit -m "feat(mobile): add generic reader repository"
```

### Task 4: Local User Database

**Files:**
- Create: `apps/mobile/src/data/userDb.ts`
- Create: `apps/mobile/src/data/userRepository.ts`
- Create: `apps/mobile/src/data/userRepository.test.ts`
- Create: `apps/mobile/src/data/userRepository.testHelpers.ts`

**Interfaces:**
- Produces:
  - `openUserDb(): Promise<ExpoSqliteLike>`
  - `setBookmark(client, surahId, ayahNumber, bookmarked): Promise<void>`
  - `getBookmarks(client): Promise<Bookmark[]>`
  - `recordReadingPosition(client, surahId, ayahNumber): Promise<void>`
  - `getLastReadingPosition(client): Promise<ReadingPosition | null>`
  - `saveSetting(client, key, value): Promise<void>`
  - `getSetting(client, key): Promise<string | null>`

- [ ] **Step 1: Write failing user repository tests**

Create `apps/mobile/src/data/userRepository.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createMemoryUserClient } from './userRepository.testHelpers';
import {
  getBookmarks,
  getLastReadingPosition,
  getSetting,
  recordReadingPosition,
  saveSetting,
  setBookmark,
} from './userRepository';

describe('userRepository', () => {
  it('stores bookmarks locally by surah and ayah', async () => {
    const client = createMemoryUserClient();
    await setBookmark(client, 2, 255, true);
    await setBookmark(client, 1, 1, true);
    await setBookmark(client, 2, 255, false);

    expect(await getBookmarks(client)).toEqual([{ surahId: 1, ayahNumber: 1 }]);
  });

  it('stores the latest reading position', async () => {
    const client = createMemoryUserClient();
    await recordReadingPosition(client, 1, 7);
    await recordReadingPosition(client, 2, 10);

    expect(await getLastReadingPosition(client)).toEqual({ surahId: 2, ayahNumber: 10 });
  });

  it('stores string settings by key', async () => {
    const client = createMemoryUserClient();
    await saveSetting(client, 'contentLanguage', 'ru');

    expect(await getSetting(client, 'contentLanguage')).toBe('ru');
    expect(await getSetting(client, 'theme')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @quran-corpus/mobile test -- userRepository.test.ts`

Expected: FAIL because user repository files do not exist.

- [ ] **Step 3: Implement local schema bootstrap**

Create `apps/mobile/src/data/userDb.ts`:

```ts
import * as SQLite from 'expo-sqlite';

const USER_DB_NAME = 'quran-corpus-user.db';

export async function openUserDb() {
  const db = await SQLite.openDatabaseAsync(USER_DB_NAME);
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      surah_id INTEGER NOT NULL,
      ayah_number INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (surah_id, ayah_number)
    );
    CREATE TABLE IF NOT EXISTS reading_history (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      surah_id INTEGER NOT NULL,
      ayah_number INTEGER NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return db;
}
```

- [ ] **Step 4: Implement the test helper**

Create `apps/mobile/src/data/userRepository.testHelpers.ts`:

```ts
import type { MobileDataClient, MobileRow, SqlValue } from '@quran-corpus/mobile-data';

interface BookmarkRow {
  surah_id: number;
  ayah_number: number;
}

interface HistoryRow {
  surah_id: number;
  ayah_number: number;
}

export function createMemoryUserClient(): MobileDataClient {
  const bookmarks = new Map<string, BookmarkRow>();
  let history: HistoryRow | null = null;
  const settings = new Map<string, string>();

  return {
    async execute(statement) {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      const args = typeof statement === 'string' ? [] : (statement.args ?? []);

      if (sql.startsWith('INSERT INTO bookmarks')) {
        const [surahId, ayahNumber] = args as SqlValue[];
        bookmarks.set(`${surahId}:${ayahNumber}`, { surah_id: Number(surahId), ayah_number: Number(ayahNumber) });
        return { rows: [] };
      }

      if (sql.startsWith('DELETE FROM bookmarks')) {
        const [surahId, ayahNumber] = args as SqlValue[];
        bookmarks.delete(`${surahId}:${ayahNumber}`);
        return { rows: [] };
      }

      if (sql.includes('FROM bookmarks')) {
        return { rows: [...bookmarks.values()].sort((a, b) => a.surah_id - b.surah_id || a.ayah_number - b.ayah_number) as unknown as MobileRow[] };
      }

      if (sql.startsWith('INSERT INTO reading_history')) {
        const [surahId, ayahNumber] = args as SqlValue[];
        history = { surah_id: Number(surahId), ayah_number: Number(ayahNumber) };
        return { rows: [] };
      }

      if (sql.includes('FROM reading_history')) {
        return { rows: history ? ([history] as unknown as MobileRow[]) : [] };
      }

      if (sql.startsWith('INSERT INTO settings')) {
        const [key, value] = args as SqlValue[];
        settings.set(String(key), String(value));
        return { rows: [] };
      }

      if (sql.includes('FROM settings')) {
        const [key] = args as SqlValue[];
        const value = settings.get(String(key));
        return { rows: value == null ? [] : [{ value }] };
      }

      throw new Error(`Unhandled user repository SQL in fake client: ${sql}`);
    },
  };
}
```

- [ ] **Step 5: Implement repository functions**

Create `apps/mobile/src/data/userRepository.ts` with explicit SQL for bookmark, history, and settings operations. Keep values scalar and never store notes or user-entered Quran/search text in M1.

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @quran-corpus/mobile test -- userRepository.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/data/userDb.ts apps/mobile/src/data/userRepository.ts apps/mobile/src/data/userRepository.test.ts apps/mobile/src/data/userRepository.testHelpers.ts
git commit -m "feat(mobile): add local user data repository"
```

### Task 5: Scalable UI And Content Language Settings

**Files:**
- Modify: `apps/mobile/src/i18n/languages.ts`
- Create: `apps/mobile/src/i18n/uiStrings.ts`
- Create: `apps/mobile/src/settings/settingsStore.tsx`
- Create: `apps/mobile/src/settings/settingsStore.test.tsx`
- Modify: `apps/mobile/src/theme/tokens.ts`

**Interfaces:**
- Produces:
  - `UiLocaleCode = 'en' | 'uz' | 'ru'`
  - `ContentLanguageCode = 'en' | 'uz' | 'ru'`
  - `t(locale, key): string`
  - `useAppSettings()`

- [ ] **Step 1: Write failing tests for language metadata, strings, and settings**

Add tests in `apps/mobile/src/i18n/uiStrings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { contentLanguages, uiLocales } from './languages';
import { t } from './uiStrings';

describe('M1 i18n', () => {
  it('keeps UI locales separate from content languages', () => {
    expect(uiLocales.map((locale) => locale.code)).toEqual(['en', 'uz', 'ru']);
    expect(contentLanguages.map((language) => language.code)).toEqual(['en', 'uz', 'ru']);
  });

  it('returns translated UI labels for every shipped locale', () => {
    expect(t('en', 'tabs.surahs')).toBe('Surahs');
    expect(t('uz', 'tabs.surahs').length).toBeGreaterThan(0);
    expect(t('ru', 'tabs.surahs').length).toBeGreaterThan(0);
  });
});
```

Add tests in `apps/mobile/src/settings/settingsStore.test.tsx`:

```tsx
import { act, create } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import { AppSettingsProvider, useAppSettings, type AppSettingsContextValue } from './settingsStore';

function SettingsProbe({ onSettings }: { onSettings: (settings: AppSettingsContextValue) => void }) {
  onSettings(useAppSettings());
  return null;
}

describe('AppSettingsProvider', () => {
  it('provides M1 settings and updates them through useAppSettings', () => {
    let settings: AppSettingsContextValue | null = null;

    act(() => {
      create(
        <AppSettingsProvider>
          <SettingsProbe onSettings={(nextSettings) => { settings = nextSettings; }} />
        </AppSettingsProvider>,
      );
    });

    expect(settings?.uiLocale).toBe('en');
    expect(settings?.contentLanguage).toBe('en');
    expect(settings?.analyticsEnabled).toBe(false);

    act(() => {
      settings?.setUiLocale('ru');
      settings?.setContentLanguage('uz');
      settings?.setAnalyticsEnabled(true);
    });

    expect(settings?.uiLocale).toBe('ru');
    expect(settings?.contentLanguage).toBe('uz');
    expect(settings?.analyticsEnabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm --filter @quran-corpus/mobile test -- uiStrings.test.ts settingsStore.test.tsx`

Expected: FAIL because `uiStrings.ts`, `uiLocales`, and `settingsStore.tsx` do not exist.

- [ ] **Step 3: Implement language metadata**

Update `apps/mobile/src/i18n/languages.ts`:

```ts
export type UiLocaleCode = 'en' | 'uz' | 'ru';
export type ContentLanguageCode = 'en' | 'uz' | 'ru';

export interface LanguageMetadata<TCode extends string> {
  code: TCode;
  label: string;
  nativeLabel: string;
  direction: 'ltr' | 'rtl';
}

export const uiLocales: LanguageMetadata<UiLocaleCode>[] = [
  { code: 'en', label: 'English', nativeLabel: 'English', direction: 'ltr' },
  { code: 'uz', label: 'Uzbek', nativeLabel: "O'zbek", direction: 'ltr' },
  { code: 'ru', label: 'Russian', nativeLabel: 'Русский', direction: 'ltr' },
];

export const contentLanguages: LanguageMetadata<ContentLanguageCode>[] = [...uiLocales];
```

- [ ] **Step 4: Implement UI string catalog**

Create `apps/mobile/src/i18n/uiStrings.ts` with explicit keys used by M1 screens:

```ts
import type { UiLocaleCode } from './languages';

type UiStringKey =
  | 'tabs.home'
  | 'tabs.surahs'
  | 'tabs.bookmarks'
  | 'tabs.settings'
  | 'home.continue'
  | 'home.noHistory'
  | 'reader.translation'
  | 'reader.bookmark'
  | 'reader.removeBookmark'
  | 'reader.play'
  | 'reader.pause'
  | 'settings.language'
  | 'settings.theme'
  | 'settings.about'
  | 'about.title'
  | 'about.credits';

const strings: Record<UiLocaleCode, Record<UiStringKey, string>> = {
  en: {
    'tabs.home': 'Home',
    'tabs.surahs': 'Surahs',
    'tabs.bookmarks': 'Bookmarks',
    'tabs.settings': 'Settings',
    'home.continue': 'Continue reading',
    'home.noHistory': 'No reading history yet',
    'reader.translation': 'Translation',
    'reader.bookmark': 'Bookmark',
    'reader.removeBookmark': 'Remove bookmark',
    'reader.play': 'Play',
    'reader.pause': 'Pause',
    'settings.language': 'Language',
    'settings.theme': 'Theme',
    'settings.about': 'About and credits',
    'about.title': 'About Quran Corpus',
    'about.credits': 'Credits',
  },
  uz: {
    'tabs.home': 'Bosh sahifa',
    'tabs.surahs': 'Suralar',
    'tabs.bookmarks': 'Xatcho‘plar',
    'tabs.settings': 'Sozlamalar',
    'home.continue': 'O‘qishni davom ettirish',
    'home.noHistory': 'Hali o‘qish tarixi yo‘q',
    'reader.translation': 'Tarjima',
    'reader.bookmark': 'Xatcho‘p',
    'reader.removeBookmark': 'Xatcho‘pni olib tashlash',
    'reader.play': 'Ijro etish',
    'reader.pause': 'To‘xtatish',
    'settings.language': 'Til',
    'settings.theme': 'Mavzu',
    'settings.about': 'Ilova va manbalar',
    'about.title': 'Quran Corpus haqida',
    'about.credits': 'Manbalar',
  },
  ru: {
    'tabs.home': 'Главная',
    'tabs.surahs': 'Суры',
    'tabs.bookmarks': 'Закладки',
    'tabs.settings': 'Настройки',
    'home.continue': 'Продолжить чтение',
    'home.noHistory': 'Истории чтения пока нет',
    'reader.translation': 'Перевод',
    'reader.bookmark': 'Закладка',
    'reader.removeBookmark': 'Удалить закладку',
    'reader.play': 'Воспроизвести',
    'reader.pause': 'Пауза',
    'settings.language': 'Язык',
    'settings.theme': 'Тема',
    'settings.about': 'О приложении и источниках',
    'about.title': 'О Quran Corpus',
    'about.credits': 'Источники',
  },
};

export function t(locale: UiLocaleCode, key: UiStringKey): string {
  return strings[locale][key];
}
```

- [ ] **Step 5: Implement settings store**

Create `apps/mobile/src/settings/settingsStore.tsx`:

```tsx
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ContentLanguageCode, UiLocaleCode } from '../i18n/languages';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface AppSettings {
  uiLocale: UiLocaleCode;
  contentLanguage: ContentLanguageCode;
  theme: ThemePreference;
  fontScale: number;
  analyticsEnabled: boolean;
}

export interface AppSettingsContextValue extends AppSettings {
  setUiLocale: (locale: UiLocaleCode) => void;
  setContentLanguage: (language: ContentLanguageCode) => void;
  setTheme: (theme: ThemePreference) => void;
  setFontScale: (fontScale: number) => void;
  setAnalyticsEnabled: (enabled: boolean) => void;
}

const defaultSettings: AppSettings = {
  uiLocale: 'en',
  contentLanguage: 'en',
  theme: 'system',
  fontScale: 1,
  analyticsEnabled: false,
};

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);

  const value = useMemo<AppSettingsContextValue>(
    () => ({
      ...settings,
      setUiLocale: (uiLocale) => setSettings((current) => ({ ...current, uiLocale })),
      setContentLanguage: (contentLanguage) => setSettings((current) => ({ ...current, contentLanguage })),
      setTheme: (theme) => setSettings((current) => ({ ...current, theme })),
      setFontScale: (fontScale) => setSettings((current) => ({ ...current, fontScale })),
      setAnalyticsEnabled: (analyticsEnabled) => setSettings((current) => ({ ...current, analyticsEnabled })),
    }),
    [settings],
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings(): AppSettingsContextValue {
  const value = useContext(AppSettingsContext);
  if (!value) throw new Error('useAppSettings must be used inside AppSettingsProvider');
  return value;
}
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @quran-corpus/mobile test -- uiStrings.test.ts settingsStore.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/i18n/languages.ts apps/mobile/src/i18n/uiStrings.ts apps/mobile/src/i18n/uiStrings.test.ts apps/mobile/src/settings/settingsStore.tsx apps/mobile/src/settings/settingsStore.test.tsx apps/mobile/src/theme/tokens.ts
git commit -m "feat(mobile): add scalable language settings"
```

### Task 6: Route Shell And Surah List

**Files:**
- Create: `apps/mobile/app/(tabs)/_layout.tsx`
- Create: `apps/mobile/app/(tabs)/index.tsx`
- Create: `apps/mobile/app/(tabs)/surahs.tsx`
- Create: `apps/mobile/app/(tabs)/bookmarks.tsx`
- Create: `apps/mobile/app/(tabs)/settings.tsx`
- Create: `apps/mobile/src/components/SurahList.tsx`
- Modify: `apps/mobile/app/_layout.tsx`
- Modify: `apps/mobile/vitest.config.ts`
- Replace: `apps/mobile/app/index.tsx`

**Interfaces:**
- Consumes: `getSurahList(client)`, `openCorpusDb()`, `openUserDb()`, `useAppSettings()`.
- Produces: tabbed app shell and surah navigation to `/surah/[surahId]`.

- [ ] **Step 1: Write a component test for surah list rendering**

Create `apps/mobile/src/components/SurahList.test.tsx`:

```tsx
import { render } from '@testing-library/react-native';
import { describe, expect, it, vi } from 'vitest';
import { SurahList } from './SurahList';

describe('SurahList', () => {
  it('renders surah names and ayah counts', () => {
    const screen = render(
      <SurahList
        surahs={[
          { id: 1, nameArabic: 'الفاتحة', nameTranslit: 'Al-Fatihah', nameTranslation: 'The Opener', ayahCount: 7 },
        ]}
        onOpenSurah={vi.fn()}
      />,
    );

    expect(screen.getByText('Al-Fatihah')).toBeTruthy();
    expect(screen.getByText('7 ayahs')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Add test dependency if absent**

If `@testing-library/react-native` is not in `apps/mobile/package.json`, add it to `devDependencies`.

- [ ] **Step 3: Configure Vitest to collect TSX component tests**

Update `apps/mobile/vitest.config.ts` before using `.test.tsx` files as gates:

```ts
test: {
  environment: 'node',
  include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
},
```

- [ ] **Step 4: Run test to verify failure**

Run: `pnpm --filter @quran-corpus/mobile test -- SurahList.test.tsx`

Expected: FAIL because `SurahList` does not exist.

- [ ] **Step 5: Implement `SurahList` with `FlatList`**

Create `apps/mobile/src/components/SurahList.tsx` using `FlatList`, stable row height, `Pressable`, Arabic name on the right, transliteration/title on the left, and a minimum touch target of 48dp.

- [ ] **Step 6: Implement tab routes**

Create Expo Router tab files. `surahs.tsx` opens the corpus DB, calls `getSurahList`, and routes via:

```ts
router.push({ pathname: '/surah/[surahId]', params: { surahId: String(item.id) } });
```

- [ ] **Step 7: Run route shell checks**

Run:

```bash
pnpm --filter @quran-corpus/mobile test -- SurahList.test.tsx
pnpm --filter @quran-corpus/mobile type-check
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/app apps/mobile/src/components/SurahList.tsx apps/mobile/src/components/SurahList.test.tsx apps/mobile/vitest.config.ts apps/mobile/package.json pnpm-lock.yaml
git commit -m "feat(mobile): add reader tab shell and surah list"
```

### Task 7: Surah Reader Screen With Bookmarks And History

**Files:**
- Create: `apps/mobile/app/surah/[surahId].tsx`
- Create: `apps/mobile/src/components/SurahReader.tsx`
- Create: `apps/mobile/src/components/AyahCard.tsx`
- Create: `apps/mobile/src/components/LanguageSelector.tsx`
- Modify: `apps/mobile/src/components/ReaderScreen.tsx`

**Interfaces:**
- Consumes: `getSurahReader`, `setBookmark`, `getBookmarks`, `recordReadingPosition`, `contentLanguages`, `t`.
- Produces: virtualized reader for any surah with selected translation and local bookmark/history writes.

- [ ] **Step 1: Write `AyahCard` behavior test**

Create `apps/mobile/src/components/AyahCard.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, vi } from 'vitest';
import { AyahCard } from './AyahCard';

describe('AyahCard', () => {
  it('calls bookmark and audio handlers without exposing ayah text to callbacks', () => {
    const onToggleBookmark = vi.fn();
    const onToggleAudio = vi.fn();

    const screen = render(
      <AyahCard
        ayahNumber={1}
        arabicText="Arabic text"
        translationText="Translation text"
        bookmarked={false}
        playing={false}
        onToggleBookmark={onToggleBookmark}
        onToggleAudio={onToggleAudio}
      />,
    );

    fireEvent.press(screen.getByText('Bookmark'));
    fireEvent.press(screen.getByText('Play'));

    expect(onToggleBookmark).toHaveBeenCalledWith(1);
    expect(onToggleAudio).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @quran-corpus/mobile test -- AyahCard.test.tsx`

Expected: FAIL because `AyahCard` does not exist.

- [ ] **Step 3: Implement reader components**

Implement:

```ts
export interface AyahCardProps {
  ayahNumber: number;
  arabicText: string;
  translationText: string | null;
  bookmarked: boolean;
  playing: boolean;
  onToggleBookmark: (ayahNumber: number) => void;
  onToggleAudio: (ayahNumber: number) => void;
}
```

Use `FlatList` in `SurahReader`, not `ScrollView`, for long surahs.

- [ ] **Step 4: Implement route screen**

`apps/mobile/app/surah/[surahId].tsx` must:

- validate `surahId` as an integer from 1 to 114.
- open corpus and user DBs.
- load reader data with selected content language.
- record reading position when the screen opens and when visible ayah changes.
- toggle bookmarks locally.
- render loading/error states without crashing.

- [ ] **Step 5: Remove M0 route dependency**

Replace the old `ReaderScreen` usage from `apps/mobile/app/index.tsx`. Keep `ReaderScreen.tsx` only if converted into the generic `SurahReader`; otherwise delete it in this task.

- [ ] **Step 6: Run checks**

Run:

```bash
pnpm --filter @quran-corpus/mobile test -- AyahCard.test.tsx
pnpm --filter @quran-corpus/mobile type-check
pnpm --filter @quran-corpus/mobile lint
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/app apps/mobile/src/components apps/mobile/src/data
git commit -m "feat(mobile): add surah reader with bookmarks"
```

### Task 8: Ayah Audio Streaming Client

**Files:**
- Modify: `apps/mobile/src/api/audio.ts`
- Create: `apps/mobile/src/audio/ayahAudio.ts`
- Modify: `apps/mobile/src/components/AyahCard.tsx`
- Modify: `apps/mobile/app/surah/[surahId].tsx`

**Interfaces:**
- Consumes: `EXPO_PUBLIC_AUDIO_API_BASE_URL`, `reciter=abdul-rashid-sufi`, `surah`, `ayah`.
- Produces:
  - `getAyahAudioUrl(params): Promise<AyahAudioResponse>`
  - `useAyahAudioController()`

- [ ] **Step 1: Write audio client tests**

Create `apps/mobile/src/audio/ayahAudio.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { getAyahAudioUrl } from './ayahAudio';

describe('getAyahAudioUrl', () => {
  it('calls the thin endpoint with Abdul Rashid Sufi as default reciter', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://audio.example/001001.mp3', duration_ms: 5000, source: 'qua', attribution: 'Audio source' }),
    });

    const result = await getAyahAudioUrl(
      { baseUrl: 'https://api.example', surah: 1, ayah: 1 },
      fetchMock as never,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example/api/v1/audio/ayah?reciter=abdul-rashid-sufi&surah=1&ayah=1',
    );
    expect(result.url).toBe('https://audio.example/001001.mp3');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @quran-corpus/mobile test -- ayahAudio.test.ts`

Expected: FAIL because `ayahAudio.ts` does not exist.

- [ ] **Step 3: Implement endpoint client**

Create `apps/mobile/src/audio/ayahAudio.ts`:

```ts
export interface AyahAudioParams {
  baseUrl: string;
  surah: number;
  ayah: number;
  reciter?: 'abdul-rashid-sufi';
}

export interface AyahAudioResponse {
  url: string;
  duration_ms: number | null;
  source: string;
  attribution: string;
}

export async function getAyahAudioUrl(
  params: AyahAudioParams,
  fetchFn: typeof fetch = fetch,
): Promise<AyahAudioResponse> {
  const reciter = params.reciter ?? 'abdul-rashid-sufi';
  const url = new URL('/api/v1/audio/ayah', params.baseUrl);
  url.searchParams.set('reciter', reciter);
  url.searchParams.set('surah', String(params.surah));
  url.searchParams.set('ayah', String(params.ayah));

  const response = await fetchFn(url.toString());
  if (!response.ok) throw new Error(`Audio endpoint failed with ${response.status}`);
  return response.json();
}
```

- [ ] **Step 4: Wire playback with graceful disabled state**

In the reader route, if `EXPO_PUBLIC_AUDIO_API_BASE_URL` is absent, render the audio button disabled and do not emit telemetry. If present, fetch the URL on tap and play the stream. Reading must continue to work when audio fetch or playback fails.

- [ ] **Step 5: Run checks**

Run:

```bash
pnpm --filter @quran-corpus/mobile test -- ayahAudio.test.ts
pnpm --filter @quran-corpus/mobile type-check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/api/audio.ts apps/mobile/src/audio apps/mobile/src/components/AyahCard.tsx apps/mobile/app/surah/[surahId].tsx
git commit -m "feat(mobile): stream ayah audio through thin endpoint"
```

### Task 9: About, Credits, Telemetry, And Privacy Controls

**Files:**
- Create: `apps/mobile/src/telemetry/telemetry.ts`
- Create: `apps/mobile/src/telemetry/telemetry.test.ts`
- Create: `apps/mobile/app/about.tsx`
- Modify: `apps/mobile/app/(tabs)/settings.tsx`
- Modify: `apps/mobile/app/_layout.tsx`
- Modify: `apps/mobile/app.json`

**Interfaces:**
- Consumes: `docs/data-sources-m1.md`, public Expo config values.
- Produces:
  - `captureEvent(name, properties): void`
  - `captureException(error, context): void`
  - About/Credits screen available offline.

- [ ] **Step 1: Write telemetry privacy test**

Create `apps/mobile/src/telemetry/telemetry.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createTelemetry } from './telemetry';

describe('telemetry', () => {
  it('drops raw text fields from analytics events', () => {
    const posthog = { capture: vi.fn() };
    const telemetry = createTelemetry({ posthog: posthog as never, sentry: null });

    telemetry.captureEvent('reader_ayah_opened', {
      surah: 1,
      ayah: 1,
      text: 'must not be sent',
      query: 'must not be sent',
    });

    expect(posthog.capture).toHaveBeenCalledWith('reader_ayah_opened', { surah: 1, ayah: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @quran-corpus/mobile test -- telemetry.test.ts`

Expected: FAIL because telemetry wrapper does not exist.

- [ ] **Step 3: Implement telemetry wrapper**

Create `apps/mobile/src/telemetry/telemetry.ts` with a denylist for property keys:

```ts
const deniedPropertyKeys = new Set(['text', 'query', 'note', 'arabicText', 'translationText', 'rawInput']);
```

The wrapper must no-op when Sentry/PostHog config is absent.

- [ ] **Step 4: Implement About/Credits screen**

`apps/mobile/app/about.tsx` reads static attribution content derived from `docs/data-sources-m1.md`. If the approval record still says `Not approved`, the screen must display `Source approval incomplete` and the release task must fail.

- [ ] **Step 5: Wire settings route**

Settings must include:

- UI locale selector.
- Content translation selector.
- Theme selector: System, Light, Dark.
- Analytics opt-in toggle defaulting to off until product enables it.
- About/Credits link.

- [ ] **Step 6: Run checks**

Run:

```bash
pnpm --filter @quran-corpus/mobile test -- telemetry.test.ts
pnpm --filter @quran-corpus/mobile type-check
pnpm --filter @quran-corpus/mobile lint
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/telemetry apps/mobile/app/about.tsx apps/mobile/app/_layout.tsx apps/mobile/app/(tabs)/settings.tsx apps/mobile/app.json
git commit -m "feat(mobile): add credits and privacy-safe telemetry"
```

### Task 10: M1 Verification And Android Smoke Build

**Files:**
- Modify: `README.md`
- Modify: `docs/PRD-android-first-mobile-app.md`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: documented M1 verification commands and smoke-test checklist.

- [ ] **Step 1: Add M1 smoke-test checklist**

Add to `README.md`:

```markdown
## M1 Android Smoke Test

1. Run `pnpm install`.
2. Run `pnpm generate:m1-db` after `docs/data-sources-m1.md` is fully approved.
3. Run `pnpm test`.
4. Run `pnpm type-check`.
5. Run `pnpm lint`.
6. Run `pnpm build`.
7. Start an Android emulator or connect a physical Android device.
8. Run `pnpm android`.
9. Turn off network and confirm Surahs opens and a surah reader displays Arabic plus the selected translation.
10. Add a bookmark, close the app, reopen it, and confirm the bookmark remains.
11. Open Settings, switch UI locale and content language, and confirm reader labels/content update separately.
12. Turn network on, set `EXPO_PUBLIC_AUDIO_API_BASE_URL`, and confirm ayah audio streams through the thin endpoint.
13. Turn network off again and confirm reader still works while audio is unavailable.
```

- [ ] **Step 2: Update PRD milestone status**

In `docs/PRD-android-first-mobile-app.md`, mark M0 as complete only if the smoke test has passed on a real Android device or emulator. Mark M1 as in progress once Task 1 starts.

- [ ] **Step 3: Run full repo verification**

Run:

```bash
pnpm test
pnpm type-check
pnpm lint
pnpm build
git status --short --branch
```

Expected:

- tests pass.
- type-check passes.
- lint passes.
- Android export/build command passes.
- git status shows only intended M1 changes before commit.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/PRD-android-first-mobile-app.md
git commit -m "docs: add M1 verification checklist"
```

---

## Self-Review Checklist

- Spec coverage: M1 PRD scope is covered by tasks for surah list, reader, translations, bookmarks, history, theme/settings, credits, audio, telemetry, and smoke verification.
- Deferred scope is explicit: treebank, cloud sync, offline audio, dictionary UI, morphology UI, full search UI, and iOS release are outside M1.
- Source/legal uncertainty is not hidden: Task 1 and Task 2 block DB generation until approved sources and runtime config are recorded.
- Type consistency: repository functions use `getSurahList`, `getSurahReader`, and `getAyahReaderLocation` consistently across tasks.
- Privacy: telemetry tests reject raw text/search/note fields before implementation.
- Performance: long reader screen uses `FlatList`, not `ScrollView`.
- Offline: corpus reader uses bundled `quran.db`; audio is optional and network-only.
