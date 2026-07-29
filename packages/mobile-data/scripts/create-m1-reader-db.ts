import { access, copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../../data/src/db.js';

const repoRoot = resolve('../..');
const approvalPath = resolve(repoRoot, 'docs/data-sources-m1.md');
const targetDbPath = resolve(repoRoot, 'apps/mobile/assets/db/quran.db');

const selectedTranslators = {
  en: 'Saheeh International',
  ru: 'Abu Adel',
  uz: 'Muhammad Sodik Muhammad Yusuf',
} as const;
const incompleteSelectionMessage =
  'M1 translation selection must contain exactly one selected translator for en, uz, and ru.';

export interface TranslationContractSummary {
  translator: string;
  rows: number;
}

export interface M1ReaderDbContractSummary {
  surahs: number;
  ayahs: number;
  words: number;
  languages: string[];
  selectedTranslations: Record<keyof typeof selectedTranslators, TranslationContractSummary>;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function numberValue(value: unknown): number {
  return Number(value ?? 0);
}

export function parseM1TranslationSelection(approval: string): Record<keyof typeof selectedTranslators, string> {
  const selections = new Map<keyof typeof selectedTranslators, string>();
  const duplicates = new Set<keyof typeof selectedTranslators>();

  for (const line of approval.split(/\r?\n/)) {
    const columns = line
      .trim()
      .split('|')
      .map((column) => column.trim())
      .filter(Boolean);

    if (columns.length !== 2) continue;

    const [languageCode, translator] = columns;
    if (languageCode !== 'en' && languageCode !== 'ru' && languageCode !== 'uz') continue;

    if (selections.has(languageCode)) duplicates.add(languageCode);
    selections.set(languageCode, translator);
  }

  if (duplicates.size > 0) throw new Error(incompleteSelectionMessage);

  for (const [languageCode, translator] of Object.entries(selectedTranslators)) {
    if (selections.get(languageCode as keyof typeof selectedTranslators) !== translator) {
      throw new Error(incompleteSelectionMessage);
    }
  }

  return {
    en: selections.get('en') ?? '',
    ru: selections.get('ru') ?? '',
    uz: selections.get('uz') ?? '',
  };
}

export async function validateM1ReaderDbContract(dbPath = targetDbPath): Promise<M1ReaderDbContractSummary> {
  const db = createDatabase(`file:${dbPath}`);

  try {
    const [surahs, ayahs, words, languages, translations] = await Promise.all([
      db.execute('SELECT count(*) AS n FROM surahs'),
      db.execute('SELECT count(*) AS n FROM ayahs'),
      db.execute('SELECT count(*) AS n FROM words'),
      db.execute("SELECT code FROM languages WHERE code IN ('en', 'uz', 'ru') ORDER BY code"),
      db.execute({
        sql: `
          SELECT language_code, translator, count(*) AS n
          FROM translations
          WHERE (
            language_code = 'en' AND translator = ?
          ) OR (
            language_code = 'ru' AND translator = ?
          ) OR (
            language_code = 'uz' AND translator = ?
          )
          GROUP BY language_code, translator
          ORDER BY language_code
        `,
        args: [selectedTranslators.en, selectedTranslators.ru, selectedTranslators.uz],
      }),
    ]);

    const selectedTranslations = Object.fromEntries(
      Object.entries(selectedTranslators).map(([languageCode, translator]) => {
        const row = translations.rows.find(
          (candidate) => candidate.language_code === languageCode && candidate.translator === translator,
        );

        return [
          languageCode,
          {
            translator,
            rows: numberValue(row?.n),
          },
        ];
      }),
    ) as M1ReaderDbContractSummary['selectedTranslations'];

    const summary: M1ReaderDbContractSummary = {
      surahs: numberValue(surahs.rows[0]?.n),
      ayahs: numberValue(ayahs.rows[0]?.n),
      words: numberValue(words.rows[0]?.n),
      languages: languages.rows.map((row) => String(row.code)),
      selectedTranslations,
    };

    if (summary.surahs !== 114) throw new Error(`Expected 114 surahs, found ${summary.surahs}`);
    if (summary.ayahs !== 6236) throw new Error(`Expected 6236 ayahs, found ${summary.ayahs}`);
    if (summary.words <= 0) throw new Error('Expected word rows for M1 reader DB');
    if (summary.languages.join(',') !== 'en,ru,uz') {
      throw new Error(`Expected content languages en,ru,uz, found ${summary.languages.join(',')}`);
    }

    for (const [languageCode, translation] of Object.entries(summary.selectedTranslations)) {
      if (translation.rows !== 6236) {
        throw new Error(
          `Expected 6236 ${languageCode} rows for ${translation.translator}, found ${translation.rows}`,
        );
      }
    }

    return summary;
  } finally {
    db.close();
  }
}

export async function ensureM1ReaderDb() {
  const approval = await readFile(approvalPath, 'utf8');
  parseM1TranslationSelection(approval);

  if (!(await pathExists(targetDbPath))) {
    const sourceDbPath = process.env.QURAN_CORPUS_SOURCE_DB;
    if (!sourceDbPath) {
      throw new Error('Missing apps/mobile/assets/db/quran.db. Set QURAN_CORPUS_SOURCE_DB to copy the generated PWA corpus DB.');
    }

    await mkdir(dirname(targetDbPath), { recursive: true });
    await copyFile(sourceDbPath, targetDbPath);
  }

  return validateM1ReaderDbContract(targetDbPath);
}

async function main() {
  const summary = await ensureM1ReaderDb();
  console.log(`M1 reader DB ready: ${summary.surahs} surahs, ${summary.ayahs} ayahs, ${summary.words} words`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
