import { rm } from 'node:fs/promises';
import { createDatabase } from '@quran-corpus/data';

type SealableDb = Pick<ReturnType<typeof createDatabase>, 'execute'>;

/**
 * Makes `dbPath` safe to ship as a lone bundled asset.
 *
 * A WAL-mode database is three files on disk and only the main one travels
 * inside the APK. On device SQLite reads a WAL-mode header, goes looking for a
 * `-wal` sidecar that was never bundled, and fails before it can serve a single
 * statement -- which is how the corpus DB reached `NativeDatabase.execSync`
 * with a null handle and surfaced as a bare NullPointerException.
 *
 * Checkpointing alone does not fix it: that empties the WAL but leaves the file
 * format version at 2, so a reader still expects a sidecar. Switching
 * journal_mode is what rewrites header bytes 18/19 back to 1 and makes the file
 * self-contained.
 *
 * Use this when nothing else holds the file open. A builder that has just
 * written the database has to call `sealOpenDb` on its own connection instead
 * (see below) and `removeJournalSidecars` after closing it.
 */
export async function sealDbForBundling(dbPath: string): Promise<void> {
  const db = createDatabase(`file:${dbPath}`);

  try {
    await sealOpenDb(db);
  } finally {
    db.close();
  }

  await removeJournalSidecars(dbPath);
}

/**
 * The sealing pragmas, run on a connection the caller owns.
 *
 * Split out because libsql keeps the WAL lock past `close()`: a script that has
 * just written the database cannot reopen it to seal it, and gets SQLITE_BUSY
 * on `journal_mode = DELETE`. So the builder seals on the connection it already
 * has, and both paths still share this one copy of what sealing means.
 *
 * Both pragmas report failure in a *result row* rather than by throwing, so
 * each is checked. Without that, a busy checkpoint or a refused mode switch
 * ships a WAL-header file that fails on device with the NullPointerException
 * this whole function exists to prevent.
 */
export async function sealOpenDb(db: SealableDb): Promise<void> {
  // Fold anything still in the WAL into the main file before leaving WAL
  // mode, so committed pages cannot be dropped on the way out.
  await checkpointWal(db);

  const journal = await db.execute('PRAGMA journal_mode = DELETE');
  // The row carries the mode now in force, not the one requested.
  const mode = journal.rows[0]?.journal_mode;
  if (String(mode).toLowerCase() !== 'delete') {
    throw new Error(`journal_mode is still ${String(mode)} after requesting DELETE; the file would ship expecting a -wal sidecar`);
  }
}

/**
 * Fold the WAL back into the main database file.
 *
 * Separate from sealing because the corpus source has to be checkpointed
 * *without* leaving WAL mode -- apps/web reads that same file and wants to stay
 * in WAL. Reports a refusal in column `busy` rather than by throwing, and a
 * refused checkpoint means a later copyFile silently drops whatever the scraper
 * wrote last, so it is checked here for every caller.
 */
export async function checkpointWal(db: SealableDb): Promise<void> {
  const result = await db.execute('PRAGMA wal_checkpoint(TRUNCATE)');
  const busy = result.rows[0]?.busy;
  if (busy !== 0) {
    throw new Error(
      `wal_checkpoint(TRUNCATE) could not complete (busy=${String(busy)}); another connection holds the WAL`,
    );
  }
}

/** Opening the DB recreates these; a bundled asset should be one file. */
export async function removeJournalSidecars(dbPath: string): Promise<void> {
  await rm(`${dbPath}-wal`, { force: true });
  await rm(`${dbPath}-shm`, { force: true });
}
