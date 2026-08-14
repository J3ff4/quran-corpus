import { describe, expect, it, vi } from 'vitest';
import type { CorpusDbFileSystem } from './openCorpusDb';
import { corpusDbAssetName, corpusDbFileName, ensureCorpusDbFile, stagingSuffix } from './openCorpusDb';

const sqliteDir = 'file:///docs/SQLite';
const targetPath = `${sqliteDir}/${corpusDbFileName}`;
const stagingPath = `${targetPath}${stagingSuffix}`;

function createFileSystem(exists: boolean) {
  const calls: string[] = [];

  const fileSystem: CorpusDbFileSystem = {
    makeDirectoryAsync: vi.fn(async () => {
      calls.push('makeDirectory');
    }),
    getInfoAsync: vi.fn(async () => {
      calls.push('getInfo');
      return { exists };
    }),
    deleteAsync: vi.fn(async () => {
      calls.push('delete');
    }),
    copyAsync: vi.fn(async () => {
      calls.push('copy');
    }),
    moveAsync: vi.fn(async () => {
      calls.push('move');
    }),
  };

  return { fileSystem, calls };
}

describe('openCorpusDb constants', () => {
  it('uses the bundled M1 DB asset name and stable local filename', () => {
    expect(corpusDbAssetName).toBe('quran.db');
    expect(corpusDbFileName).toBe('quran-corpus-m1.db');
  });
});

describe('ensureCorpusDbFile', () => {
  it('stages the copy and renames it into place on first launch', async () => {
    const { fileSystem, calls } = createFileSystem(false);
    const resolveAssetUri = vi.fn(async () => 'file:///asset/quran.db');

    const result = await ensureCorpusDbFile(fileSystem, sqliteDir, resolveAssetUri);

    expect(result).toBe(targetPath);
    // Order is the whole point: the copy must land on a scratch name and only
    // become targetPath via the rename, so a kill mid-copy cannot leave a
    // truncated file that later launches mistake for a complete database.
    expect(calls).toEqual(['makeDirectory', 'getInfo', 'delete', 'copy', 'move']);
    expect(fileSystem.copyAsync).toHaveBeenCalledWith({ from: 'file:///asset/quran.db', to: stagingPath });
    expect(fileSystem.moveAsync).toHaveBeenCalledWith({ from: stagingPath, to: targetPath });
  });

  it('clears a staging file left behind by an interrupted extract', async () => {
    const { fileSystem } = createFileSystem(false);

    await ensureCorpusDbFile(fileSystem, sqliteDir, async () => 'file:///asset/quran.db');

    expect(fileSystem.deleteAsync).toHaveBeenCalledWith(stagingPath, { idempotent: true });
  });

  it('never touches the asset or the filesystem again once the DB is extracted', async () => {
    const { fileSystem, calls } = createFileSystem(true);
    const resolveAssetUri = vi.fn(async () => 'file:///asset/quran.db');

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
    const { fileSystem } = createFileSystem(false);
    const resolveAssetUri = vi.fn(async () => {
      throw new Error('Bundled corpus DB asset did not resolve to a local URI');
    });

    await expect(ensureCorpusDbFile(fileSystem, sqliteDir, resolveAssetUri)).rejects.toThrow(
      'Bundled corpus DB asset did not resolve to a local URI',
    );
    expect(fileSystem.moveAsync).not.toHaveBeenCalled();
  });
});
