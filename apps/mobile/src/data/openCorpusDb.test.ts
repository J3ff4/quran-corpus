import { describe, expect, it, vi } from 'vitest';
import type { CorpusDbFileSystem } from './openCorpusDb';
import { corpusDbAssetName, corpusDbFileName, ensureCorpusDbFile, stagingSuffix } from './openCorpusDb';

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
  };

  return { fileSystem, calls, files };
}

describe('openCorpusDb constants', () => {
  it('uses the bundled M1 DB asset name and stable local filename', () => {
    expect(corpusDbAssetName).toBe('quran.db');
    expect(corpusDbFileName).toBe('quran-corpus-m1.db');
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
    expect(calls).toEqual(['makeDirectory', 'getInfo', 'delete', 'copy', 'move']);
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
