import type * as ExpoAsset from 'expo-asset';
import type * as ExpoFileSystemLegacy from 'expo-file-system/legacy';
import type * as ExpoFont from 'expo-font';
import type * as SQLite from 'expo-sqlite';
import type * as ExpoSQLite from 'expo-sqlite';

// No constant for the asset name: Metro needs a string literal inside
// require(), so the one below is the only place it can live and a second copy
// here would only drift.
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

  const db = SQLiteRuntime.openDatabaseSync(corpusDbFileName);
  // Enforced by SQLite on the connection, not by inspecting SQL strings before
  // we hand them over. The corpus is shipped content and nothing in the app has
  // any business writing to it, but the query client is the same one the
  // read-write user DB uses, so the boundary cannot live in the client. A
  // string filter would also be the weaker guarantee -- it has to be right
  // about every statement form, whereas query_only makes the engine itself
  // refuse writes and DDL on this handle.
  db.execSync('PRAGMA query_only = ON;');
  return db;
}

export function useCorpusFonts(): [boolean, Error | null] {
  const { useFonts } = require('expo-font') as typeof ExpoFont;

  return useFonts({
    Hafs: require('../../assets/fonts/hafs.18.woff2'),
  });
}
