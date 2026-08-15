import { rm } from 'node:fs/promises';
import { createDatabase } from '@quran-corpus/data';

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
 */
export async function sealDbForBundling(dbPath: string): Promise<void> {
  const db = createDatabase(`file:${dbPath}`);

  try {
    // Fold anything still in the WAL into the main file before leaving WAL
    // mode, so committed pages cannot be dropped on the way out.
    await db.execute('PRAGMA wal_checkpoint(TRUNCATE)');
    await db.execute('PRAGMA journal_mode = DELETE');
  } finally {
    db.close();
  }

  // Opening the DB recreates these; a bundled asset should be one file.
  await rm(`${dbPath}-wal`, { force: true });
  await rm(`${dbPath}-shm`, { force: true });
}
