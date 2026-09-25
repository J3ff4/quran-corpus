import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createDatabase } from '@quran-corpus/data';
import { sealDbForBundling } from '../scripts/sealDb.js';

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'seal-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

it('repacks a fragmented database instead of shipping its holes', async () => {
  const path = join(dir, 'frag.db');
  const db = createDatabase(`file:${path}`);
  // Real fragmentation, built the way the corpus got it: insert short rows,
  // then grow every one of them with an UPDATE. A plain delete-then-insert
  // would land on the freelist, which is NOT what the corpus DB has.
  //
  // Three statements, not 4000 awaited round-trips. The loop version of this
  // took 59 s and blew vitest's 5 s default timeout -- a test that has to be
  // given a timeout to run at all is one nobody will keep.
  await db.execute('CREATE TABLE t (id INTEGER PRIMARY KEY, body TEXT)');
  await db.execute(`WITH RECURSIVE s(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM s WHERE i<4000)
                    INSERT INTO t SELECT i, 'x' FROM s`);
  await db.execute("UPDATE t SET body = hex(zeroblob(1500))");
  await db.execute('DELETE FROM t WHERE id % 2 = 0');
  db.close();

  const before = (await stat(path)).size;
  await sealDbForBundling(path);
  const after = (await stat(path)).size;

  // Measured on this fixture: 16.4 MB -> 8.2 MB, exactly 0.50.
  expect(after).toBeLessThan(before * 0.8);
});

it('is still self-contained after the repack', async () => {
  const path = join(dir, 'sealed.db');
  const db = createDatabase(`file:${path}`);
  await db.execute('CREATE TABLE t (id INTEGER PRIMARY KEY)');
  db.close();
  await sealDbForBundling(path);

  const reopened = createDatabase(`file:${path}`);
  const mode = await reopened.execute('PRAGMA journal_mode');
  reopened.close();
  // The whole reason sealing exists: a WAL-mode header sends SQLite looking
  // for a -wal sidecar that never travels inside the APK, and it fails with a
  // null handle before serving one statement.
  expect(String(mode.rows[0]?.journal_mode).toLowerCase()).toBe('delete');
});
