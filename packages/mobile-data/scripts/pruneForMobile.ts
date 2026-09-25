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
 * the answer to it. Measured: 25.5 MB on disk, 6.0 MB of download.
 *
 * No hand-written search_fts delete. schema.sql's trg_translations_ad removes
 * the matching index row for every translation deleted, and it is the only
 * thing that can: search_fts.source holds the language code and ref_id holds
 * translations.id, so there is no (source, translator) key to delete by. A
 * second, hand-written delete would be a second answer to the same question.
 * The index still needs compacting afterwards -- see the optimize below.
 *
 * Takes a connection rather than a path, and deliberately offers no by-path
 * entry point. Two reasons, and either alone is enough:
 *
 *  - libsql keeps the WAL lock past `close()`, so a pipeline that prunes by
 *    path and then seals by path dies on `SQLITE_BUSY` at
 *    `journal_mode = DELETE` -- the copy is in WAL, because it is a byte copy
 *    of the WAL-mode database apps/web reads. Measured 2026-09-25 on the real
 *    asset: the delete ran, all 31,180 rows, and the seal after it threw,
 *    leaving an unvacuumed file. The caller therefore has to own the
 *    connection anyway, and sealOpenDb is split out for the same reason.
 *  - A by-path export is an irreversible 31,180-row delete that takes any
 *    path, with nothing distinguishing the copy from the canonical DB that
 *    apps/web reads and that this must never touch.
 *
 * Must run BEFORE sealOpenDb's VACUUM, or the pages these deletes free ship
 * inside the APK as holes. Measured: 25.6 MB of difference between the two
 * orders.
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

  // Compact the index the trigger just gutted. An fts5 delete does not remove
  // the term's entry, it writes a tombstone into a new segment, and those are
  // reclaimed by a segment merge -- never by VACUUM, which reclaims database
  // pages and cannot see inside an fts5 segment. So 31,180 deletes leave the
  // search index roughly the size it was, full of markers for rows that are
  // gone.
  //
  // Measured 2026-09-25 on the real asset: the fts5 tables go 20,504,576 ->
  // 12,763,136 bytes and the sealed file 101,306,368 -> 93,564,928, for two
  // seconds on top of a 467-second prune. Larger than the VACUUM's own win.
  //
  // Before sealOpenDb's VACUUM, like the delete above: the merge frees pages,
  // and unrepacked they ship inside the APK as holes.
  await db.execute("INSERT INTO search_fts(search_fts) VALUES('optimize')");

  return { translationsDeleted: Number(removed.rowsAffected ?? 0) };
}
