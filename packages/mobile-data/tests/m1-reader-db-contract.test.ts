import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase } from '@quran-corpus/data';
import {
  parseM1TranslationSelection,
  resolveM1ReaderDbSource,
  syncM1ReaderDbAsset,
  validateM1ReaderDbContract,
} from '../scripts/create-m1-reader-db';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const dbPath = resolve(repoRoot, 'apps/mobile/assets/db/quran.db');
// The bundled asset is generated (pnpm generate:m1-db) from a ~134 MB corpus DB
// that is deliberately not in git, so a fresh clone does not have it. These
// cases assert the contract of that artifact; with no artifact there is nothing
// to assert, and failing would make `pnpm test` red for everyone who has not
// built it yet. CI provisions the DB and runs them for real.
const describeWithDb = existsSync(dbPath) ? describe : describe.skip;
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(resolve(tmpdir(), 'm1-reader-db-'));
  tempDirs.push(dir);
  return dir;
}

describe('M1 reader DB contract', () => {
  const incomplete =
    'M1 translation selection must contain exactly one selected translator for en, ru, uz, uz-Cyrl.';

  it('requires exactly one selected translator row for each M1 language', () => {
    const validApproval = `
## M1 Translation Selection

| Language | Selected translator |
| --- | --- |
| en | Saheeh International |
| uz | Tasnim |
| uz-Cyrl | Tasnim |
| ru | Abu Adel |
`;

    expect(parseM1TranslationSelection(validApproval)).toEqual({
      en: 'Saheeh International',
      ru: 'Abu Adel',
      uz: 'Tasnim',
      'uz-Cyrl': 'Tasnim',
    });

    const duplicateRussianSelection = `
## M1 Translation Selection

| Language | Selected translator |
| --- | --- |
| en | Saheeh International |
| uz | Tasnim |
| uz-Cyrl | Tasnim |
| ru | Abu Adel |
| ru | Elmir Kuliev |
`;

    expect(() => parseM1TranslationSelection(duplicateRussianSelection)).toThrow(incomplete);

    const missingUzbekSelection = `
## M1 Translation Selection

| Language | Selected translator |
| --- | --- |
| en | Saheeh International |
| ru | Abu Adel |
`;

    expect(() => parseM1TranslationSelection(missingUzbekSelection)).toThrow(incomplete);
  });

  it('rejects an approval that names Latin Uzbek but not Cyrillic Uzbek', () => {
    // The Cyrillic script is a separate `language_code` with its own licence
    // row, and the parser used to skip any code outside a hardcoded en/ru/uz
    // list -- so this table would have been accepted, and the reader would
    // ship a Cyrillic translation nobody signed off on.
    const latinOnly = `
## M1 Translation Selection

| Language | Selected translator |
| --- | --- |
| en | Saheeh International |
| uz | Tasnim |
| ru | Abu Adel |
`;

    expect(() => parseM1TranslationSelection(latinOnly)).toThrow(incomplete);
  });

  it('rejects an approval that binds the two Uzbek scripts to different translators', () => {
    // The whole point of listing both codes: if the scripts ever named
    // different translators, flipping the script toggle would swap the
    // scholar rather than the alphabet. Only the shared table decides that,
    // and the approval doc has to agree with it.
    const splitTranslators = `
## M1 Translation Selection

| Language | Selected translator |
| --- | --- |
| en | Saheeh International |
| uz | Tasnim |
| uz-Cyrl | Muhammad Sodik Muhammad Yusuf |
| ru | Abu Adel |
`;

    expect(() => parseM1TranslationSelection(splitTranslators)).toThrow(incomplete);
  });

  it('uses sibling quran-data/quran.db as the default canonical source', async () => {
    const workspace = await createTempDir();
    const repoRoot = resolve(workspace, 'quran-corpus-android-app');
    const canonicalDb = resolve(workspace, 'quran-data/quran.db');
    await mkdir(resolve(workspace, 'quran-data'), { recursive: true });
    await mkdir(repoRoot, { recursive: true });
    await writeFile(canonicalDb, 'canonical db');

    await expect(resolveM1ReaderDbSource({ repoRoot })).resolves.toBe(canonicalDb);
  });

  it('resolves canonical quran-data/quran.db from the primary checkout when running in a worktree', async () => {
    const workspace = await createTempDir();
    const primaryRoot = resolve(workspace, 'projects/quran-corpus-android-app');
    const worktreeRoot = resolve(workspace, 'worktrees/quran-corpus-android-app-m1');
    const canonicalDb = resolve(workspace, 'projects/quran-data/quran.db');

    await mkdir(resolve(primaryRoot, '.git/worktrees/m1'), { recursive: true });
    await mkdir(worktreeRoot, { recursive: true });
    await mkdir(resolve(workspace, 'projects/quran-data'), { recursive: true });
    await writeFile(resolve(worktreeRoot, '.git'), `gitdir: ${resolve(primaryRoot, '.git/worktrees/m1')}\n`);
    await writeFile(canonicalDb, 'canonical db');

    await expect(resolveM1ReaderDbSource({ repoRoot: worktreeRoot })).resolves.toBe(canonicalDb);
  });

  it('overwrites a stale mobile DB and seals the copy out of WAL mode', async () => {
    const workspace = await createTempDir();
    const canonicalDb = resolve(workspace, 'quran-data/quran.db');
    const targetDb = resolve(workspace, 'app/assets/db/quran.db');
    await mkdir(resolve(workspace, 'quran-data'), { recursive: true });
    await mkdir(resolve(workspace, 'app/assets/db'), { recursive: true });
    await writeFile(targetDb, 'stale db');

    const source = createDatabase(`file:${canonicalDb}`);
    await source.execute('PRAGMA journal_mode = WAL');
    await source.execute('CREATE TABLE marker (n INTEGER)');
    await source.execute('INSERT INTO marker (n) VALUES (7)');
    // syncM1ReaderDbAsset prunes the copy before sealing it, so the fixture
    // needs the table it prunes. No search_fts here: trg_translations_ad only
    // exists in schema.sql, and this case is about the seal, not the prune.
    await source.execute(
      'CREATE TABLE translations (id INTEGER PRIMARY KEY, ayah_id INTEGER, language_code TEXT, translator TEXT, text TEXT)',
    );
    source.close();
    // Guards the premise of the case: with a source that is not in WAL mode
    // there is nothing to seal and the assertions below would pass vacuously.
    expect((await readFile(canonicalDb))[18]).toBe(2);

    await syncM1ReaderDbAsset({ sourceDbPath: canonicalDb, targetDbPath: targetDb });

    // Header bytes 18 and 19 are the file format write/read versions. 2 means a
    // reader must find a -wal sidecar alongside the file, and only the main file
    // is bundled into the APK -- so a 2 here is an app that cannot open its own
    // database on device.
    const header = await readFile(targetDb);
    expect([header[18], header[19]]).toEqual([1, 1]);
    expect(existsSync(`${targetDb}-wal`)).toBe(false);
    expect(existsSync(`${targetDb}-shm`)).toBe(false);

    const target = createDatabase(`file:${targetDb}`);
    const rows = (await target.execute('SELECT n FROM marker')).rows;
    target.close();
    expect(Number(rows[0]?.n)).toBe(7);
  });

});

describeWithDb('M1 reader DB artifact', () => {
  it('is a single self-contained file, not a WAL-mode database', async () => {
    // The one assertion that reflects how the file is actually consumed: Metro
    // bundles apps/mobile/assets/db/quran.db and nothing beside it, so a
    // WAL-mode header sends SQLite looking for a sidecar that is not in the APK
    // and the corpus fails to open on device.
    const header = await readFile(dbPath);
    expect([header[18], header[19]]).toEqual([1, 1]);
    expect(existsSync(`${dbPath}-wal`)).toBe(false);
    expect(existsSync(`${dbPath}-shm`)).toBe(false);
  });

  it('contains complete reader rows and selected translations', async () => {
    const summary = await validateM1ReaderDbContract(dbPath);

    expect(summary).toEqual({
      surahs: 114,
      ayahs: 6236,
      words: 77429,
      languages: ['en', 'ru', 'uz'],
      // 6236 x the four selected sets, and nothing else. See below.
      translationsTotal: 24944,
      selectedTranslations: {
        en: { translator: 'Saheeh International', rows: 6236 },
        ru: { translator: 'Abu Adel', rows: 6236 },
        uz: { translator: 'Tasnim', rows: 6236 },
        // The reader's Cyrillic Uzbek translation. Absent from this contract
        // until the script toggle reached the verse translation, so a bundle
        // without it used to pass here and fail only on a device.
        'uz-Cyrl': { translator: 'Tasnim', rows: 6236 },
      },
    });
  });

  it('carries no translator the reader has no code path to reach', async () => {
    // This used to assert the opposite -- that every ALTERNATIVE translator
    // ships complete -- which was right while the bundle was a whole-file copy
    // of the corpus. The prune deleted exactly those sets, so the old
    // assertion could only pass by iterating the four the case above already
    // checks: a duplicate wearing a misleading name.
    //
    // The pair list, not a count: a count of 24944 is also what nine sets
    // pruned down to four wrong ones would give, and the reader renders a
    // translator it did not ask for as text in the wrong language.
    const db = createDatabase(`file:${dbPath}`);

    try {
      const perTranslator = await db.execute(`
        SELECT language_code, translator, count(*) AS n
        FROM translations
        GROUP BY language_code, translator
        ORDER BY 1, 2
      `);

      expect(perTranslator.rows.map((row) => `${row.language_code}/${row.translator}`)).toEqual([
        'en/Saheeh International',
        'ru/Abu Adel',
        'uz/Tasnim',
        'uz-Cyrl/Tasnim',
      ]);
      // And each is whole. The total alone does not give this: four sets
      // summing to 24944 can still be one short and one long, which ships as a
      // blank ayah on the language the switcher lands on.
      expect(perTranslator.rows.map((row) => Number(row.n))).toEqual([6236, 6236, 6236, 6236]);
    } finally {
      db.close();
    }
  });
});
