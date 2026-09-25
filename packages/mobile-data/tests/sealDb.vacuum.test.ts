import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createDatabase } from '@quran-corpus/data';
import { removeJournalSidecars, sealDbForBundling, sealOpenDb } from '../scripts/sealDb.js';

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'seal-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

it('repacks a fragmented database instead of shipping its holes', async () => {
  const path = join(dir, 'frag.db');
  const db = createDatabase(`file:${path}`);
  // Real fragmentation, built the way the corpus got it: insert short rows,
  // then grow every one of them with an UPDATE, so the slack sits INSIDE
  // allocated pages rather than on the freelist -- which is where the corpus
  // DB's 36 MB of it sits (freelist_count there is 149). The DELETE below adds
  // a freelist on top; both kinds are what VACUUM reclaims.
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
  // WAL first, the way schema.sql:2 leaves the real assets. Without this the
  // fixture is already in DELETE -- createDatabase's default -- and the
  // assertion below holds no matter what sealing does, including nothing.
  await db.execute('PRAGMA journal_mode = WAL');
  await db.execute('CREATE TABLE t (id INTEGER PRIMARY KEY)');

  // The builder path, not sealDbForBundling: libsql keeps the WAL lock past
  // close(), so a reopen to seal a file THIS process just wrote in WAL dies on
  // `database is locked` -- which is the whole reason sealOpenDb is split out.
  // The real pipeline gets away with the reopen because the WAL it seals was
  // written by another process and copied.
  await sealOpenDb(db);
  db.close();
  await removeJournalSidecars(path);

  // Read the bytes rather than reopening: opening the file can itself settle
  // the mode, so a reopened PRAGMA answers about the connection, not about
  // what shipped. Bytes 18/19 are the write/read file-format versions -- 2
  // means "expects a -wal sidecar", and the APK carries no sidecar, so SQLite
  // reaches NativeDatabase.execSync with a null handle before serving one
  // statement. This is the whole reason sealing exists.
  const header = await readFile(path);
  expect([header[18], header[19]]).toEqual([1, 1]);
});
