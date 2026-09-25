import { createDatabase } from '@quran-corpus/data';
import { selectedTranslators } from '../src/translators.js';

type PrunableDb = Pick<ReturnType<typeof createDatabase>, 'execute'>;

/**
 * Remove from a *copy* of the corpus the translator sets the mobile app has no
 * code path to reach.
 *
 * The bundled DB is a whole-file copy of the one apps/web reads, which carries
 * nine translator sets at 6236 ayahs each while the reader can render four.
 * translators.ts has named this as a bundle-size question since M1; this is
 * the answer to it. Measured: 25.7 MB on disk, 5.7 MB of download.
 *
 * search_fts is NOT touched here. schema.sql's trg_translations_ad deletes the
 * matching index row for every translation deleted, and it is the only thing
 * that can: search_fts.source holds the language code and ref_id holds
 * translations.id, so there is no (source, translator) key to delete by. A
 * second, hand-written delete would be a second answer to the same question.
 *
 * Runs on the copy, before sealing, and never against the canonical DB: the
 * web app reads that file and shows every translation this one drops.
 *
 * Must run BEFORE the VACUUM in sealDbForBundling, or the pages these deletes
 * free ship inside the APK as holes.
 */
export async function pruneForMobile(
  dbPath: string,
): Promise<{ translationsDeleted: number }> {
  const db = createDatabase(`file:${dbPath}`);
  try {
    return await pruneOpenDb(db);
  } finally {
    db.close();
  }
}

/**
 * The prune, run on a connection the caller owns.
 *
 * Split out for the same reason sealOpenDb is: libsql keeps the WAL lock past
 * `close()`, so a pipeline that prunes by path and then seals by path dies on
 * `SQLITE_BUSY` at `journal_mode = DELETE` -- the copy is in WAL, because it
 * is a byte copy of the WAL-mode database apps/web reads. Measured 2026-09-25
 * on the real asset: the delete ran, all 31,180 rows, and the seal after it
 * threw, leaving an unvacuumed file. So the generator prunes and seals on one
 * connection, and both entry points still share this one copy of what pruning
 * means.
 */
export async function pruneOpenDb(
  db: PrunableDb,
): Promise<{ translationsDeleted: number }> {
  const pairs = Object.entries(selectedTranslators);
  // An OR of equality pairs, not two independent IN lists:
  // `language_code IN (...) AND translator IN (...)` would keep ru/Tasnim,
  // a combination that does not exist, and -- more to the point -- would
  // keep uz/'Abu Adel' if it ever did. Same shape as
  // validateM1ReaderDbContract's own selection clause, for the same reason.
  const keep = pairs.map(() => '(language_code = ? AND translator = ?)').join(' OR ');

  const removed = await db.execute({
    sql: `DELETE FROM translations WHERE NOT (${keep})`,
    args: pairs.flat(),
  });

  return { translationsDeleted: Number(removed.rowsAffected ?? 0) };
}
