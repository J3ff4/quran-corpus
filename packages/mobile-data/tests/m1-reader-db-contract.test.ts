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
  it('requires exactly one selected translator row for each M1 language', () => {
    const validApproval = `
## M1 Translation Selection

| Language | Selected translator |
| --- | --- |
| en | Saheeh International |
| uz | Muhammad Sodik Muhammad Yusuf |
| ru | Abu Adel |
`;

    expect(parseM1TranslationSelection(validApproval)).toEqual({
      en: 'Saheeh International',
      ru: 'Abu Adel',
      uz: 'Muhammad Sodik Muhammad Yusuf',
    });

    const duplicateRussianSelection = `
## M1 Translation Selection

| Language | Selected translator |
| --- | --- |
| en | Saheeh International |
| uz | Muhammad Sodik Muhammad Yusuf |
| ru | Abu Adel |
| ru | Elmir Kuliev |
`;

    expect(() => parseM1TranslationSelection(duplicateRussianSelection)).toThrow(
      'M1 translation selection must contain exactly one selected translator for en, uz, and ru.',
    );

    const missingUzbekSelection = `
## M1 Translation Selection

| Language | Selected translator |
| --- | --- |
| en | Saheeh International |
| ru | Abu Adel |
`;

    expect(() => parseM1TranslationSelection(missingUzbekSelection)).toThrow(
      'M1 translation selection must contain exactly one selected translator for en, uz, and ru.',
    );
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

  it('overwrites an existing mobile DB when it differs from the canonical source', async () => {
    const workspace = await createTempDir();
    const canonicalDb = resolve(workspace, 'quran-data/quran.db');
    const targetDb = resolve(workspace, 'app/assets/db/quran.db');
    await mkdir(resolve(workspace, 'quran-data'), { recursive: true });
    await mkdir(resolve(workspace, 'app/assets/db'), { recursive: true });
    await writeFile(canonicalDb, 'canonical db');
    await writeFile(targetDb, 'stale db');

    const result = await syncM1ReaderDbAsset({ sourceDbPath: canonicalDb, targetDbPath: targetDb });

    expect(result.copied).toBe(true);
    await expect(readFile(targetDb, 'utf8')).resolves.toBe('canonical db');
  });

});

describeWithDb('M1 reader DB artifact', () => {
  it('contains complete reader rows and selected translations', async () => {
    const summary = await validateM1ReaderDbContract(dbPath);

    expect(summary).toEqual({
      surahs: 114,
      ayahs: 6236,
      words: 77429,
      languages: ['en', 'ru', 'uz'],
      selectedTranslations: {
        en: { translator: 'Saheeh International', rows: 6236 },
        ru: { translator: 'Abu Adel', rows: 6236 },
        uz: { translator: 'Muhammad Sodik Muhammad Yusuf', rows: 6236 },
      },
    });
  });

  it('ships every alternative translator the language switcher can reach', async () => {
    // validateM1ReaderDbContract only checks the one translator per language the
    // reader defaults to. The DB carries several per language, and shipping a
    // language whose alternative is short a verse would surface as a blank ayah,
    // so assert full coverage across all of them.
    const db = createDatabase(`file:${dbPath}`);

    try {
      const perTranslator = await db.execute(`
        SELECT language_code, translator, count(*) AS n
        FROM translations
        WHERE language_code IN ('en', 'uz', 'ru')
        GROUP BY language_code, translator
      `);

      expect(perTranslator.rows.length).toBeGreaterThan(0);
      for (const row of perTranslator.rows) {
        expect({ translator: row.translator, rows: Number(row.n) }).toEqual({
          translator: row.translator,
          rows: 6236,
        });
      }
    } finally {
      db.close();
    }
  });
});
