import type * as ExpoAsset from 'expo-asset';
import type * as ExpoFileSystemLegacy from 'expo-file-system/legacy';
import type * as ExpoFont from 'expo-font';
import type * as SQLite from 'expo-sqlite';
import type * as ExpoSQLite from 'expo-sqlite';

export const corpusDbAssetName = 'quran.db';
export const corpusDbFileName = 'quran-corpus-m1.db';

// The extraction below copies ~134 MB while the user stares at a fresh install,
// so it is the slowest thing the app ever does. Callers hold the splash screen
// until it resolves.
export const stagingSuffix = '.partial';

// The subset of expo-file-system/legacy that ensureCorpusDbFile needs. Declared
// structurally so the extraction sequence can be tested without pulling Expo's
// native modules into the vitest module graph — the same reason openCorpusDb
// require()s its dependencies instead of importing them.
export interface CorpusDbFileSystem {
  makeDirectoryAsync(uri: string, options: { intermediates: boolean }): Promise<void>;
  getInfoAsync(uri: string): Promise<{ exists: boolean }>;
  deleteAsync(uri: string, options: { idempotent: boolean }): Promise<void>;
  copyAsync(options: { from: string; to: string }): Promise<void>;
  moveAsync(options: { from: string; to: string }): Promise<void>;
}

/**
 * Extracts the bundled corpus DB into `sqliteDir` exactly once and returns its
 * path. `resolveAssetUri` is only called when the copy is actually needed.
 */
export async function ensureCorpusDbFile(
  fileSystem: CorpusDbFileSystem,
  sqliteDir: string,
  resolveAssetUri: () => Promise<string>,
): Promise<string> {
  const targetPath = `${sqliteDir}/${corpusDbFileName}`;
  const stagingPath = `${targetPath}${stagingSuffix}`;

  await fileSystem.makeDirectoryAsync(sqliteDir, { intermediates: true });
  const info = await fileSystem.getInfoAsync(targetPath);
  if (info.exists) return targetPath;

  // Copy to a scratch name and rename only once the copy has returned. A
  // half-written file is byte-for-byte indistinguishable from a complete one,
  // so copying straight to targetPath means an app killed mid-extract leaves a
  // truncated file that every later launch sees as existing, skips, and hands
  // to SQLite. Renaming within a directory is atomic, so targetPath is either
  // absent or a whole database.
  //
  // expo-sqlite's own importDatabaseFromAssetAsync has this exact bug
  // (SQLiteModule.kt: an exists() guard followed by a plain File.copyTo), which
  // is why this opener is hand-rolled rather than delegating to it.
  const assetUri = await resolveAssetUri();
  await fileSystem.deleteAsync(stagingPath, { idempotent: true });
  await fileSystem.copyAsync({ from: assetUri, to: stagingPath });
  await fileSystem.moveAsync({ from: stagingPath, to: targetPath });

  return targetPath;
}

// Several screens call openCorpusDb independently. Without this, two of them
// mounting together on a first launch would each start an extract, both writing
// the same staging path, and the second rename would publish a mangled file.
// Memoizing also spares every later call an extra filesystem round-trip.
let extraction: Promise<string> | null = null;

export async function openCorpusDb(): Promise<SQLite.SQLiteDatabase> {
  const { Asset } = require('expo-asset') as typeof ExpoAsset;
  const FileSystem = require('expo-file-system/legacy') as typeof ExpoFileSystemLegacy;
  const SQLiteRuntime = require('expo-sqlite') as typeof ExpoSQLite;

  extraction ??= ensureCorpusDbFile(FileSystem, `${FileSystem.documentDirectory}SQLite`, async () => {
    const asset = Asset.fromModule(require('../../assets/db/quran.db'));
    await asset.downloadAsync();
    if (!asset.localUri) throw new Error('Bundled corpus DB asset did not resolve to a local URI');
    return asset.localUri;
  }).catch((error: unknown) => {
    // Do not cache a failure: a transient error would otherwise poison every
    // later call for the lifetime of the process.
    extraction = null;
    throw error;
  });

  await extraction;

  return SQLiteRuntime.openDatabaseSync(corpusDbFileName);
}

export function useCorpusFonts(): [boolean, Error | null] {
  const { useFonts } = require('expo-font') as typeof ExpoFont;

  return useFonts({
    Hafs: require('../../assets/fonts/hafs.18.woff2'),
  });
}
