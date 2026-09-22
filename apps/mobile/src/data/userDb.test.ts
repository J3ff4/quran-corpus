import { beforeEach, describe, expect, it, vi } from 'vitest';
import { USER_DB_VERSION } from '@quran-corpus/data/user-db';

const mocks = vi.hoisted(() => ({
  opens: [] as string[],
  applied: [] as string[],
  queried: [] as string[],
  openResult: null as (() => Promise<unknown>) | null,
}));

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: async (name: string) => {
    mocks.opens.push(name);
    if (mocks.openResult) return mocks.openResult();
    return {
      execAsync: async (sql: string) => {
        mocks.applied.push(sql);
      },
      // migrateUserDb reaches the driver through createExpoSqliteClient, which
      // is a read client -- every statement it runs, DDL included, goes through
      // getAllAsync. Returning [] for `PRAGMA user_version` is what a file that
      // predates the pragma looks like, which is the case that matters here.
      getAllAsync: async (sql: string) => {
        mocks.queried.push(sql);
        return [];
      },
    };
  },
}));

// The connection is memoized in module scope, so each case needs a fresh
// module registry -- otherwise the second test inherits the first one's cache
// and passes without exercising anything.
async function freshOpenUserDb() {
  vi.resetModules();
  const mod = await import('./userDb.js');
  return mod.openUserDb;
}

describe('openUserDb', () => {
  beforeEach(() => {
    mocks.opens = [];
    mocks.applied = [];
    mocks.queried = [];
    mocks.openResult = null;
  });

  it('migrates the file on the same open, not on a later call', async () => {
    const openUserDb = await freshOpenUserDb();

    await openUserDb();

    // Every caller of openUserDb() gets a migrated file because the migration
    // is inside the memoized open. Without this assertion the call could be
    // deleted and the rest of this suite would still pass.
    expect(mocks.queried[0]).toContain('PRAGMA user_version');
    expect(mocks.queried.some((sql) => sql.includes('reading_days'))).toBe(true);
    expect(mocks.queried.at(-1)).toBe(`PRAGMA user_version = ${USER_DB_VERSION}`);
  });

  it('applies the shared user-DB schema on first open', async () => {
    const openUserDb = await freshOpenUserDb();

    await openUserDb();

    expect(mocks.opens).toEqual(['quran-corpus-user.db']);
    // Asserted on content, not on "execAsync was called": the point of taking
    // the schema from packages/data is that this app cannot define its own, so
    // the test fails if someone reintroduces a local copy that drifts.
    const schema = mocks.applied.join('\n');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS bookmarks');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS reading_history');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS settings');
  });

  it('opens once however many callers ask for it', async () => {
    const openUserDb = await freshOpenUserDb();

    const [first, second] = await Promise.all([openUserDb(), openUserDb()]);
    const third = await openUserDb();

    // Reading positions are written from scroll, so this used to reopen the
    // database and re-run the whole DDL several times a second.
    expect(mocks.opens).toHaveLength(1);
    expect(mocks.applied).toHaveLength(1);
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('retries after a failed open instead of caching the failure', async () => {
    const openUserDb = await freshOpenUserDb();
    mocks.openResult = () => Promise.reject(new Error('database is locked'));

    await expect(openUserDb()).rejects.toThrow('database is locked');

    // A cached rejection would poison every later call for the life of the
    // process -- one transient failure at launch and the app never persists
    // another bookmark until it is force-quit.
    mocks.openResult = null;
    await expect(openUserDb()).resolves.toBeTruthy();
    expect(mocks.opens).toHaveLength(2);
  });
});

describe('reportIfBrandNew', () => {
  const sqliteDir = 'file:///data/user/0/com.qurancorpus.mobile/files/SQLite';

  function fs(files: string[]) {
    return {
      getInfoAsync: async (uri: string) => ({
        exists: files.some((name) => `${sqliteDir}/${name}` === uri),
      }),
      readDirectoryAsync: async () => files,
    };
  }

  it('says nothing when the database is already there', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { reportIfBrandNew } = await import('./userDb.js');

    await reportIfBrandNew(fs(['quran-corpus-user.db', 'quran-corpus-m11a.db']), sqliteDir);

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('warns, and names what else is in the directory, when it is about to create one', async () => {
    // The signal that was missing on 2026-09-21 (#96): a brand-new user DB on
    // a device that had been running the app for three weeks looked exactly
    // like a first launch.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { reportIfBrandNew } = await import('./userDb.js');

    await reportIfBrandNew(fs(['quran-corpus-m11a.db']), sqliteDir);

    expect(warn).toHaveBeenCalledOnce();
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain('creating a NEW quran-corpus-user.db');
    // The listing is the half that says whether the corpus went too.
    expect(message).toContain('quran-corpus-m11a.db');
    warn.mockRestore();
  });

  it('never throws out of a filesystem that refuses to answer', async () => {
    // It runs on the open path. A diagnostic that can break the open it
    // describes is worse than the blind spot it fills.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { reportIfBrandNew } = await import('./userDb.js');

    await expect(
      reportIfBrandNew(
        {
          getInfoAsync: async () => {
            throw new Error('EACCES');
          },
          readDirectoryAsync: async () => [],
        },
        sqliteDir,
      ),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe('the user DB backup', () => {
  const sqliteDir = 'file:///documents/SQLite';
  const backupDir = 'file:///documents/backups';
  const live = `${sqliteDir}/quran-corpus-user.db`;
  const backup = `${backupDir}/quran-corpus-user.db.backup`;

  function fakeFs(initial: Record<string, string>) {
    const files = new Map(Object.entries(initial));
    const copiedTo: string[] = [];
    return {
      files,
      copiedTo,
      fs: {
        getInfoAsync: async (uri: string) => ({ exists: files.has(uri) }),
        readDirectoryAsync: async () => [...files.keys()],
        makeDirectoryAsync: async () => {},
        copyAsync: async ({ from, to }: { from: string; to: string }) => {
          copiedTo.push(to);
          const data = files.get(from);
          if (data === undefined) throw new Error(`no such file: ${from}`);
          files.set(to, data);
        },
        moveAsync: async ({ from, to }: { from: string; to: string }) => {
          const data = files.get(from);
          if (data === undefined) throw new Error(`no such file: ${from}`);
          files.set(to, data);
          files.delete(from);
        },
        deleteAsync: async (uri: string) => {
          files.delete(uri);
        },
      },
    };
  }

  function fakeDb(total: number) {
    const ran: string[] = [];
    return {
      ran,
      db: {
        execAsync: async (sql: string) => {
          ran.push(sql);
        },
        getAllAsync: async () => [{ total }],
      },
    };
  }

  it('puts the backup back when the live database has gone missing', async () => {
    const { files, fs, copiedTo } = fakeFs({ [backup]: 'three weeks of bookmarks' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { restoreIfMissing } = await import('./userDb.js');

    await expect(restoreIfMissing(fs, sqliteDir, backupDir)).resolves.toBe(true);

    expect(files.get(live)).toBe('three weeks of bookmarks');
    // Staged and renamed, never copied straight to the live path: a copy that
    // dies halfway leaves a truncated file every later launch reads as whole.
    expect(copiedTo).toEqual([`${live}.partial`]);
    expect(files.has(`${live}.partial`)).toBe(false);
    expect(String(warn.mock.calls[0]?.[0])).toContain('RESTORED');
    warn.mockRestore();
  });

  it("clears the dead WAL sidecars the wipe left behind", async () => {
    // The wipe this restores from was the extract-cleanup loop, whose pattern
    // had no sidecar arm: it deleted the `.db` and left `-wal` beside it.
    // SQLite binds a WAL to its database by the header alone, so leaving them
    // means the next open replays frames from the deleted database over the
    // file we just restored.
    const { files, fs } = fakeFs({
      [backup]: 'three weeks of bookmarks',
      [`${live}-wal`]: 'frames from the database that was deleted',
      [`${live}-shm`]: 'shared memory',
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { restoreIfMissing } = await import('./userDb.js');

    await expect(restoreIfMissing(fs, sqliteDir, backupDir)).resolves.toBe(true);

    expect(files.get(live)).toBe('three weeks of bookmarks');
    expect(files.has(`${live}-wal`)).toBe(false);
    expect(files.has(`${live}-shm`)).toBe(false);
    warn.mockRestore();
  });

  it('counts every user table, not the three obvious ones', async () => {
    // A device whose only content is a reading streak counted zero, so the
    // empty-guard read it as a fresh install and declined to back it up.
    const { fs } = fakeFs({ [live]: 'a reading streak and nothing else' });
    const asked: string[] = [];
    const db = {
      execAsync: async () => {},
      getAllAsync: async (sql: string) => {
        asked.push(sql);
        return [{ total: 3 }];
      },
    };
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { backUp } = await import('./userDb.js');

    await expect(backUp(db, fs, sqliteDir, backupDir)).resolves.toBe(true);

    for (const table of ['bookmarks', 'reading_history', 'reading_days', 'root_views', 'settings']) {
      expect(asked[0]).toContain(table);
    }
    log.mockRestore();
  });

  it('leaves a database that is already there alone', async () => {
    const { files, fs } = fakeFs({ [live]: 'the real thing', [backup]: 'older copy' });
    const { restoreIfMissing } = await import('./userDb.js');

    await expect(restoreIfMissing(fs, sqliteDir, backupDir)).resolves.toBe(false);

    expect(files.get(live)).toBe('the real thing');
  });

  it('does not invent a database on a first-ever launch', async () => {
    const { files, fs } = fakeFs({});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { restoreIfMissing } = await import('./userDb.js');

    await expect(restoreIfMissing(fs, sqliteDir, backupDir)).resolves.toBe(false);

    expect(files.has(live)).toBe(false);
    warn.mockRestore();
  });

  it('refreshes the backup from a database that has rows', async () => {
    const { files, fs, copiedTo } = fakeFs({ [live]: 'bookmarks and notes' });
    const { db, ran } = fakeDb(4);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { backUp } = await import('./userDb.js');

    await expect(backUp(db, fs, sqliteDir, backupDir)).resolves.toBe(true);

    expect(files.get(backup)).toBe('bookmarks and notes');
    expect(copiedTo).toEqual([`${backup}.partial`]);
    // Announced, so the net can be seen deploying on a device (#96).
    expect(String(log.mock.calls[0]?.[0])).toContain('backed up 4 rows');
    // WAL first: expo-sqlite writes in WAL mode, so the newest bookmarks live
    // in -wal until a checkpoint folds them into the file being copied.
    expect(ran).toContain('PRAGMA wal_checkpoint(TRUNCATE)');
    log.mockRestore();
  });

  it('never overwrites a backup with an empty database', async () => {
    // The guard the whole design rests on. A faithful mirror would have copied
    // the 2026-09-21 wipe over the only good copy on the next launch --
    // protection that guarantees the loss it is there to prevent (#96).
    const { files, fs } = fakeFs({ [live]: 'empty shell', [backup]: 'three weeks of bookmarks' });
    const { db } = fakeDb(0);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { backUp } = await import('./userDb.js');

    await expect(backUp(db, fs, sqliteDir, backupDir)).resolves.toBe(false);

    expect(files.get(backup)).toBe('three weeks of bookmarks');
    expect(String(warn.mock.calls[0]?.[0])).toContain('keeping the backup');
    warn.mockRestore();
  });

  it('says nothing when an empty database is simply a fresh install', async () => {
    const { fs } = fakeFs({ [live]: 'empty shell' });
    const { db } = fakeDb(0);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { backUp } = await import('./userDb.js');

    await expect(backUp(db, fs, sqliteDir, backupDir)).resolves.toBe(false);

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('survives a filesystem that refuses to copy', async () => {
    // Insurance must never take down the open it is insuring.
    const { fs } = fakeFs({ [live]: 'rows' });
    const { db } = fakeDb(2);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { backUp } = await import('./userDb.js');

    await expect(
      backUp(db, { ...fs, copyAsync: async () => { throw new Error('ENOSPC'); } }, sqliteDir, backupDir),
    ).resolves.toBe(false);

    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
