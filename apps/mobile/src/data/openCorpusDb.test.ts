import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { CorpusDbFileSystem } from './openCorpusDb';
import {
  corpusDbFileName,
  corpusDbVersion,
  userDbFileName,
  ensureCorpusDbFile,
  stagingSuffix,
} from './openCorpusDb';

const sqliteDir = 'file:///docs/SQLite';
const targetPath = `${sqliteDir}/${corpusDbFileName}`;
const stagingPath = `${targetPath}${stagingSuffix}`;

const assetUri = 'file:///asset/quran.db';

/**
 * A path-aware fake filesystem holding path -> contents.
 *
 * Path-aware rather than a single `exists` flag, because the interesting state
 * is a *staging* file left behind by an interrupted extract while the target is
 * still absent -- one boolean cannot express that, so a test named for it was
 * really re-running the first-launch case.
 */
function createFileSystem(initialFiles: Record<string, string>) {
  const files = new Map(Object.entries({ [assetUri]: 'fresh', ...initialFiles }));
  const calls: string[] = [];

  const fileSystem: CorpusDbFileSystem = {
    makeDirectoryAsync: vi.fn(async () => {
      calls.push('makeDirectory');
    }),
    getInfoAsync: vi.fn(async (uri: string) => {
      calls.push('getInfo');
      return { exists: files.has(uri) };
    }),
    deleteAsync: vi.fn(async (uri: string) => {
      calls.push('delete');
      files.delete(uri);
    }),
    copyAsync: vi.fn(async ({ from, to }: { from: string; to: string }) => {
      calls.push('copy');
      files.set(to, files.get(from) ?? 'missing');
    }),
    moveAsync: vi.fn(async ({ from, to }: { from: string; to: string }) => {
      calls.push('move');
      files.set(to, files.get(from) ?? 'missing');
      files.delete(from);
    }),
    readDirectoryAsync: vi.fn(async (uri: string) => {
      calls.push('readDirectory');
      const prefix = `${uri}/`;
      return [...files.keys()]
        .filter((path) => path.startsWith(prefix))
        .map((path) => path.slice(prefix.length));
    }),
  };

  return { fileSystem, calls, files };
}

describe('openCorpusDb constants', () => {
  it('carries the corpus version in the local filename', () => {
    expect(corpusDbFileName).toBe(`quran-corpus-${corpusDbVersion}.db`);
  });
});

describe('ensureCorpusDbFile', () => {
  it('stages the copy and renames it into place on first launch', async () => {
    const { fileSystem, calls, files } = createFileSystem({});
    const resolveAssetUri = vi.fn(async () => assetUri);

    const result = await ensureCorpusDbFile(fileSystem, sqliteDir, resolveAssetUri);

    expect(result).toBe(targetPath);
    // Order is the whole point: the copy must land on a scratch name and only
    // become targetPath via the rename, so a kill mid-copy cannot leave a
    // truncated file that later launches mistake for a complete database.
    expect(calls).toEqual([
      'makeDirectory',
      'getInfo',
      'readDirectory',
      'delete',
      'copy',
      'move',
    ]);
    expect(fileSystem.copyAsync).toHaveBeenCalledWith({ from: assetUri, to: stagingPath });
    expect(fileSystem.moveAsync).toHaveBeenCalledWith({ from: stagingPath, to: targetPath });
    expect(files.get(targetPath)).toBe('fresh');
    expect(files.has(stagingPath)).toBe(false);
  });

  it('discards a staging file left behind by an interrupted extract', async () => {
    const { fileSystem, calls, files } = createFileSystem({ [stagingPath]: 'truncated' });

    await ensureCorpusDbFile(fileSystem, sqliteDir, async () => assetUri);

    expect(fileSystem.deleteAsync).toHaveBeenCalledWith(stagingPath, { idempotent: true });
    // The delete has to precede the copy, or the stale bytes survive under the
    // scratch name and the rename publishes a truncated database.
    expect(calls.indexOf('delete')).toBeLessThan(calls.indexOf('copy'));
    expect(files.get(targetPath)).toBe('fresh');
  });

  it('never touches the asset or the filesystem again once the DB is extracted', async () => {
    const { fileSystem, calls } = createFileSystem({ [targetPath]: 'fresh' });
    const resolveAssetUri = vi.fn(async () => assetUri);

    const result = await ensureCorpusDbFile(fileSystem, sqliteDir, resolveAssetUri);

    expect(result).toBe(targetPath);
    expect(calls).toEqual(['makeDirectory', 'getInfo']);
    // Resolving the asset downloads it; skipping that is what makes the second
    // launch fast.
    expect(resolveAssetUri).not.toHaveBeenCalled();
    expect(fileSystem.copyAsync).not.toHaveBeenCalled();
    expect(fileSystem.moveAsync).not.toHaveBeenCalled();
  });

  it('propagates an unresolvable asset without leaving a partial target', async () => {
    const { fileSystem } = createFileSystem({});
    const resolveAssetUri = vi.fn(async () => {
      throw new Error('Bundled corpus DB asset did not resolve to a local URI');
    });

    await expect(ensureCorpusDbFile(fileSystem, sqliteDir, resolveAssetUri)).rejects.toThrow(
      'Bundled corpus DB asset did not resolve to a local URI',
    );
    expect(fileSystem.moveAsync).not.toHaveBeenCalled();
  });
});

describe('font assets', () => {
  // A WOFF2 handed to expo-font resolves and then silently does nothing on
  // Android (M7a §4). This is a repo-level invariant, not a rendering test:
  // no test can observe the fallback, which is the whole problem.
  it('ships no .woff2 font', () => {
    expect(readdirSync('assets/fonts').filter((f) => f.endsWith('.woff2'))).toEqual([]);
  });

  it('loads Hafs from a .ttf', () => {
    const src = readFileSync('src/data/openCorpusDb.ts', 'utf8');
    expect(src).toMatch(/Hafs: require\('\.\.\/\.\.\/assets\/fonts\/hafs\.ttf'\)/);
    expect(src).not.toMatch(/\.woff2'\)/);
  });
});

describe('a rebuilt corpus reaching a device that already ran the app', () => {
  // Measured on device 2026-09-08: M7b bundled `mushaf_layout` correctly and
  // the installed app still answered `no such table: mushaf_layout`, because
  // the extract returns early on any existing file. The version in the name is
  // what makes a new corpus a different file rather than the same one.
  it('extracts the new version even though an older extract is present', async () => {
    const stale = `${sqliteDir}/quran-corpus-m1.db`;
    const { fileSystem, files } = createFileSystem({ [stale]: 'old corpus' });

    const result = await ensureCorpusDbFile(fileSystem, sqliteDir, async () => assetUri);

    expect(result).toBe(targetPath);
    expect(files.get(targetPath)).toBe('fresh');
  });

  it('deletes the older extract rather than leaving 134MB behind', async () => {
    const stale = `${sqliteDir}/quran-corpus-m1.db`;
    const { fileSystem, files } = createFileSystem({ [stale]: 'old corpus' });

    await ensureCorpusDbFile(fileSystem, sqliteDir, async () => assetUri);

    expect(files.has(stale)).toBe(false);
  });

  it('never touches the user DB in the same directory', async () => {
    // The name the app actually opens, taken from the constant userDb.ts uses
    // -- not a stand-in. This test used to write `quran-user.db`, which is not
    // a name anything creates, and so it passed for months while the real
    // `quran-corpus-user.db` was being deleted on every version bump: `user`
    // is [a-z0-9]+, so it matched the extract pattern. Bookmarks, notes,
    // reading history and settings, lost on upgrade, with a green test over
    // it.
    const userDb = `${sqliteDir}/${userDbFileName}`;
    const { fileSystem, files } = createFileSystem({
      [userDb]: 'bookmarks and notes',
      [`${sqliteDir}/quran-corpus-m1.db`]: 'old corpus',
    });

    await ensureCorpusDbFile(fileSystem, sqliteDir, async () => assetUri);

    expect(files.get(userDb)).toBe('bookmarks and notes');
    // And the run that spared it still did its job.
    expect(files.has(`${sqliteDir}/quran-corpus-m1.db`)).toBe(false);
  });

  it('takes the stale extract\'s WAL sidecars with it', async () => {
    // expo-sqlite opens in WAL mode, so every extract leaves a -wal and a -shm
    // beside it. A pattern that matched only the `.db` left them on the device
    // for good, which is the space this loop exists to reclaim.
    const { fileSystem, files } = createFileSystem({
      [`${sqliteDir}/quran-corpus-m1.db`]: 'old corpus',
      [`${sqliteDir}/quran-corpus-m1.db-wal`]: 'old wal',
      [`${sqliteDir}/quran-corpus-m1.db-shm`]: 'old shm',
    });

    await ensureCorpusDbFile(fileSystem, sqliteDir, async () => assetUri);

    expect(files.has(`${sqliteDir}/quran-corpus-m1.db-wal`)).toBe(false);
    expect(files.has(`${sqliteDir}/quran-corpus-m1.db-shm`)).toBe(false);
  });

  it("leaves the user DB's own sidecars alone", async () => {
    // `quran-corpus-user.db-wal` matches the pattern just as the DB itself
    // does, and deleting a live WAL loses whatever has not been checkpointed.
    const wal = `${sqliteDir}/${userDbFileName}-wal`;
    const shm = `${sqliteDir}/${userDbFileName}-shm`;
    const { fileSystem, files } = createFileSystem({
      [`${sqliteDir}/${userDbFileName}`]: 'bookmarks and notes',
      [wal]: 'uncheckpointed writes',
      [shm]: 'shared memory',
    });

    await ensureCorpusDbFile(fileSystem, sqliteDir, async () => assetUri);

    expect(files.get(wal)).toBe('uncheckpointed writes');
    expect(files.get(shm)).toBe('shared memory');
  });

  it('matches the user DB name against the pattern it has to survive', async () => {
    // Stating the trap outright: the exclusion is load-bearing precisely
    // because the name DOES look like an extract. If a future rename makes it
    // stop matching, this fails and says so rather than leaving a guard that
    // silently protects nothing.
    expect(/^quran-corpus-[a-z0-9]+\.db$/.test(userDbFileName)).toBe(true);
  });

  it('still skips the copy when the current version is already extracted', async () => {
    const { fileSystem } = createFileSystem({ [targetPath]: 'current' });
    const resolveAssetUri = vi.fn(async () => assetUri);

    await ensureCorpusDbFile(fileSystem, sqliteDir, resolveAssetUri);

    expect(resolveAssetUri).not.toHaveBeenCalled();
    expect(fileSystem.copyAsync).not.toHaveBeenCalled();
  });
});
