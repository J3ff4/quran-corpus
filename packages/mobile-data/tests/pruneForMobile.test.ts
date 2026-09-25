import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createDatabase } from '@quran-corpus/data';
import { selectedTranslators } from '../src/translators.js';
import { pruneOpenDb } from '../scripts/pruneForMobile.js';
import { removeJournalSidecars, sealOpenDb } from '../scripts/sealDb.js';

const schemaPath = resolve(
  dirname(fileURLToPath(import.meta.url)), '../../data/schema.sql',
);

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'prune-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

const SETS: [string, string][] = [
  ['en', 'Saheeh International'],
  ['ru', 'Abu Adel'],
  ['ru', 'Elmir Kuliev'],
  ['ru', 'Rowwad Translation Center'],
  ['uz', 'Tasnim'],
  ['uz', 'Alauddin Mansour'],
  ['uz-Cyrl', 'Tasnim'],
];

async function seed(path: string) {
  const db = createDatabase(`file:${path}`);
  await db.executeMultiple(await readFile(schemaPath, 'utf8'));
  for (const code of ['en', 'ru', 'uz', 'uz-Cyrl']) {
    await db.execute({ sql: 'INSERT INTO languages VALUES (?,?,?,?)', args: [code, code, code, 'ltr'] });
  }
  await db.execute("INSERT INTO surahs VALUES (1,'الفاتحة','Al-Fatihah','The Opener','meccan',7,5)");
  await db.execute("INSERT INTO ayahs (id, surah_id, ayah_number, text_uthmani) VALUES (1,1,1,'بسم الله')");
  for (const [lang, who] of SETS) {
    // trg_translations_ai indexes this into search_fts for us -- which is the
    // same trigger pair the prune relies on for the delete side.
    await db.execute({
      sql: 'INSERT INTO translations (ayah_id, language_code, translator, text) VALUES (1,?,?,?)',
      args: [lang, who, `body of ${who}`],
    });
  }
  return db;
}

it('keeps every translator the reader can select and drops every other one', async () => {
  const db = await seed(join(dir, 'p.db'));

  const result = await pruneOpenDb(db);

  const kept = await db.execute(
    'SELECT language_code, translator FROM translations ORDER BY 1, 2',
  );
  db.close();

  expect(kept.rows.map((r) => `${r.language_code}/${r.translator}`)).toEqual([
    'en/Saheeh International',
    'ru/Abu Adel',
    'uz/Tasnim',
    'uz-Cyrl/Tasnim',
  ]);
  expect(result.translationsDeleted).toBe(3);
});

it('lets the delete trigger take the search rows with them', async () => {
  const db = await seed(join(dir, 'q.db'));

  await pruneOpenDb(db);

  const orphan = await db.execute(
    "SELECT count(*) AS n FROM search_fts WHERE search_fts MATCH 'Kuliev'",
  );
  const survivor = await db.execute(
    "SELECT count(*) AS n FROM search_fts WHERE search_fts MATCH 'Saheeh'",
  );
  db.close();

  // A search hit pointing at a translation that is no longer in the database
  // renders as a result the reader taps and gets nothing from.
  expect(orphan.rows[0]?.n).toBe(0);
  expect(survivor.rows[0]?.n).toBe(1);
});

it('compacts the search index the delete trigger gutted', async () => {
  // Comparative, because nothing about the post-state alone proves a merge
  // ran: on a fixture this small the FILE does not shrink at all (page
  // granularity -- at 300 ayahs the optimized copy is briefly *larger*), so a
  // size assertion here would pass with the optimize deleted. Two identical
  // fixtures, one pruned through pruneOpenDb and one through the bare DELETE
  // it wraps, and the segment count between them is the whole signal.
  const optimized = await seed(join(dir, 'opt.db'));
  await pruneOpenDb(optimized);
  const after = await optimized.execute('SELECT count(*) AS n FROM search_fts_data');
  optimized.close();

  const plain = await seed(join(dir, 'plain.db'));
  const keep = Object.entries(selectedTranslators)
    .map(() => '(language_code = ? AND translator = ?)')
    .join(' OR ');
  await plain.execute({
    sql: `DELETE FROM translations WHERE NOT (${keep})`,
    args: Object.entries(selectedTranslators).flat(),
  });
  const before = await plain.execute('SELECT count(*) AS n FROM search_fts_data');
  plain.close();

  // An fts5 delete writes a tombstone into a new segment rather than removing
  // the term, and VACUUM cannot see inside a segment. Measured on the real
  // asset: 7.74 MB of the bundle.
  expect(Number(after.rows[0]?.n)).toBeLessThan(Number(before.rows[0]?.n));
});

it('prunes and seals on one connection, the way the generator does', async () => {
  // The generator's exact sequence, and the shape that broke it: schema.sql
  // leaves the file in WAL, libsql keeps that lock past close(), so pruning by
  // path and then sealing by path throws SQLITE_BUSY at `journal_mode =
  // DELETE` -- after the delete has already run. It cost a full 6-minute
  // regeneration to find, because nothing smaller than the real asset was
  // running both steps in order.
  const path = join(dir, 'pipeline.db');
  // The seeding connection IS the pipeline's connection: libsql holds the WAL
  // lock past close(), so reopening here would fail on the seal for a reason
  // the real generator does not have -- there the copy arrives via copyFile,
  // with nothing holding it.
  const db = await seed(path);

  const pruned = await pruneOpenDb(db);
  await sealOpenDb(db);
  db.close();
  await removeJournalSidecars(path);

  expect(pruned.translationsDeleted).toBe(3);
  // Sealed, i.e. no -wal sidecar expected. The APK carries no sidecar.
  const header = await readFile(path);
  expect([header[18], header[19]]).toEqual([1, 1]);
});
