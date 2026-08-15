import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createDatabase } from '@quran-corpus/data';

describe('M0 fixture DB artifact', () => {
  it('exists and is non-empty after generate:m0-db', async () => {
    const path = new URL('../../../apps/mobile/assets/db/quran-m0.db', import.meta.url);

    expect(existsSync(path)).toBe(true);
    expect((await stat(path)).size).toBeGreaterThan(1024);
  });

  it('is a single self-contained file, not a WAL-mode database', async () => {
    const path = new URL('../../../apps/mobile/assets/db/quran-m0.db', import.meta.url);

    // Bytes 18 and 19 are the SQLite file format write/read versions. 2 means
    // the reader must find a -wal sidecar next to the file; a bundled asset
    // travels alone, so a 2 here ships a database the app cannot open.
    const header = await readFile(path);
    expect([header[18], header[19]]).toEqual([1, 1]);
    expect(existsSync(`${path.pathname}-wal`)).toBe(false);
    expect(existsSync(`${path.pathname}-shm`)).toBe(false);
  });

  it('contains reader data for every bundled fixture ayah and language', async () => {
    const path = new URL('../../../apps/mobile/assets/db/quran-m0.db', import.meta.url);
    const db = createDatabase(`file:${path.pathname}`);

    try {
      const ayahs = await db.execute<{ count: number }>('SELECT COUNT(*) AS count FROM ayahs');
      const ayahsWithWords = await db.execute<{ count: number }>(
        'SELECT COUNT(DISTINCT ayah_id) AS count FROM words',
      );
      const translationRows = await db.execute<{ count: number }>(
        "SELECT COUNT(*) AS count FROM translations WHERE language_code IN ('en', 'uz', 'ru')",
      );

      expect(ayahs.rows[0]?.count).toBe(2);
      expect(ayahsWithWords.rows[0]?.count).toBe(2);
      expect(translationRows.rows[0]?.count).toBe(6);
    } finally {
      db.close();
    }
  });
});
