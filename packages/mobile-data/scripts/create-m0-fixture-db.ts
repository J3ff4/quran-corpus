import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '@quran-corpus/data';

// Derived from this file's own location, not the cwd: the previous relative
// resolve() only landed on the right paths when the script happened to be
// invoked from inside packages/mobile-data, and silently pointed elsewhere
// otherwise. Same fix as create-m1-reader-db.ts.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const dbPath = resolve(repoRoot, 'apps/mobile/assets/db/quran-m0.db');
// The canonical schema, the same one packages/scraper writes against. The
// column lists below must track it; generate:m0-db fails loudly on drift.
const schemaPath = resolve(repoRoot, 'packages/data/schema.sql');

type Statement = { sql: string; args: unknown[] };

const languageColumns = ['code', 'name_native', 'name_english', 'direction'];
const surahColumns = ['id', 'name_arabic', 'name_translit', 'name_translation', 'revelation_type', 'ayah_count', 'order_number'];
const ayahColumns = ['id', 'surah_id', 'ayah_number', 'text_uthmani', 'text_simple', 'juz', 'page', 'audio_url'];
const translationColumns = ['ayah_id', 'language_code', 'translator', 'text'];
const rootColumns = ['id', 'root_buckwalter', 'root_arabic', 'occurrence_count', 'sort_order'];
const rootFormColumns = ['root_id', 'sort_order', 'pos_label', 'form_arabic', 'form_translit', 'gloss', 'occurrence_count'];
const wordColumns = [
  'id',
  'ayah_id',
  'position',
  'text_arabic',
  'transliteration',
  'root',
  'lemma',
  'root_buckwalter',
  'lemma_buckwalter',
  'pos_tag',
  'morphology_json',
  'morphology_description',
  'grammar_arabic',
  'grammar_note',
  'audio_url',
];
const segmentColumns = [
  'word_id',
  'segment_index',
  'segment_type',
  'pos_tag',
  'form_arabic',
  'form_buckwalter',
  'features_json',
  'lemma',
  'root',
];

function insert(table: string, columns: string[], args: unknown[]): Statement {
  return {
    sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    args,
  };
}

async function removeIfPresent(path: string) {
  await rm(path, { force: true });
}

async function main() {
  await mkdir(dirname(dbPath), { recursive: true });
  await removeIfPresent(dbPath);
  await removeIfPresent(`${dbPath}-wal`);
  await removeIfPresent(`${dbPath}-shm`);
  await writeFile(dbPath, '');

  const db = createDatabase(`file:${dbPath}`);
  const schema = await readFile(schemaPath, 'utf8');

  try {
    await db.executeMultiple(schema);

    await db.batch(
      [
        insert('languages', languageColumns, ['en', 'English', 'English', 'ltr']),
        insert('languages', languageColumns, ['uz', "O'zbek", 'Uzbek', 'ltr']),
        insert('languages', languageColumns, ['ru', 'Русский', 'Russian', 'ltr']),
        insert('surahs', surahColumns, [1, 'الفاتحة', 'Al-Fatihah', 'The Opener', 'meccan', 7, 5]),
        insert('ayahs', ayahColumns, [
          1,
          1,
          1,
          'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
          'بسم الله الرحمن الرحيم',
          1,
          1,
          null,
        ]),
        insert('ayahs', ayahColumns, [
          2,
          1,
          2,
          'ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ',
          'الحمد لله رب العالمين',
          1,
          1,
          null,
        ]),
        insert('translations', translationColumns, [
          1,
          'en',
          'M0 fixture',
          'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
        ]),
        insert('translations', translationColumns, [1, 'uz', 'M0 fixture', 'Mehribon va rahmli Alloh nomi bilan.']),
        insert('translations', translationColumns, [1, 'ru', 'M0 fixture', 'Во имя Аллаха, Милостивого, Милующего.']),
        insert('translations', translationColumns, [2, 'en', 'M0 fixture', 'All praise is for Allah, Lord of all worlds.']),
        insert('translations', translationColumns, [2, 'uz', 'M0 fixture', 'Hamd olamlarning Robbi Allohgadir.']),
        insert('translations', translationColumns, [2, 'ru', 'M0 fixture', 'Хвала Аллаху, Господу миров.']),
        insert('roots', rootColumns, [1, 'rHm', 'ر ح م', 339, 1]),
        insert('root_forms', rootFormColumns, [1, 1, 'Noun', 'رَحْمَٰن', 'rahman', 'merciful', 57]),
        insert('words', wordColumns, [
          1,
          1,
          1,
          'بِسْمِ',
          "bis'mi",
          null,
          'اسم',
          null,
          'som',
          'N',
          null,
          'prefixed preposition bi + genitive masculine noun',
          'جار ومجرور',
          null,
          null,
        ]),
        insert('words', wordColumns, [
          2,
          1,
          2,
          'ٱللَّهِ',
          'l-lahi',
          null,
          'الله',
          null,
          'All~ah',
          'PN',
          null,
          'Allah, genitive proper noun',
          'لفظ الجلالة مجرور',
          null,
          null,
        ]),
        insert('words', wordColumns, [
          3,
          1,
          3,
          'ٱلرَّحْمَٰنِ',
          'l-rahmani',
          'ر ح م',
          'رحمن',
          'rHm',
          'raHoma`n',
          'ADJ',
          null,
          'genitive masculine adjective',
          'نعت مجرور',
          null,
          null,
        ]),
        insert('words', wordColumns, [
          4,
          2,
          1,
          'ٱلْحَمْدُ',
          'al-hamdu',
          null,
          'حمد',
          null,
          'Hamod',
          'N',
          null,
          'nominative masculine noun with definite article',
          'مبتدأ مرفوع',
          null,
          null,
        ]),
        insert('words', wordColumns, [
          5,
          2,
          2,
          'لِلَّهِ',
          'lillahi',
          null,
          'الله',
          null,
          'All~ah',
          'PN',
          null,
          'preposition li + genitive proper noun',
          'جار ومجرور',
          null,
          null,
        ]),
        insert('words', wordColumns, [
          6,
          2,
          3,
          'رَبِّ',
          'rabbi',
          null,
          'رب',
          null,
          'rab~',
          'N',
          null,
          'genitive masculine noun',
          'مضاف إليه مجرور',
          null,
          null,
        ]),
        insert('words', wordColumns, [
          7,
          2,
          4,
          'ٱلْعَٰلَمِينَ',
          'al-alamina',
          null,
          'عالم',
          null,
          'Ea`lamiyn',
          'N',
          null,
          'genitive masculine plural noun',
          'مضاف إليه مجرور',
          null,
          null,
        ]),
        insert('word_segments', segmentColumns, [3, 1, 'prefix', 'DET', 'ٱل', 'Al', '{}', null, null]),
        insert('word_segments', segmentColumns, [
          3,
          2,
          'stem',
          'ADJ',
          'رَّحْمَٰنِ',
          'raHoma`ni',
          '{"case":"genitive"}',
          'رحمن',
          'ر ح م',
        ]),
      ],
      'write',
    );

    // schema.sql:2 is `PRAGMA journal_mode = WAL`, so anything built from the
    // canonical schema is born in WAL mode -- three files on disk, of which a
    // bundled asset carries exactly one. This fixture is committed and loaded
    // as an asset, so it has the same one-file constraint as the shipped corpus
    // DB (see sealDbForBundling). Left until after every write, because leaving
    // WAL mode checkpoints. Done on this connection rather than by reopening:
    // libsql holds the WAL lock past close(), so a reopen here hits SQLITE_BUSY.
    await db.execute('PRAGMA journal_mode = DELETE');
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
