import type * as ExpoAsset from 'expo-asset';
import type * as ExpoFileSystemLegacy from 'expo-file-system/legacy';
import type * as ExpoFont from 'expo-font';
import type * as SQLite from 'expo-sqlite';
import type * as ExpoSQLite from 'expo-sqlite';

// No constant for the asset name: Metro needs a string literal inside
// require(), so the one below is the only place it can live and a second copy
// here would only drift.
//
// The version suffix is load-bearing. The extract below skips a file that
// already exists, so before this was versioned a rebuilt corpus never reached
// a device that had already run the app once: M7b's new `mushaf_layout` table
// and re-paged `ayahs.page` were bundled correctly and the installed app still
// answered `no such table: mushaf_layout` (measured on device, 2026-09-08).
// **Bump this whenever the bundled DB's contents change.** Older extracts are
// deleted on the next launch, so the phone never carries two 134 MB copies.
//
// Missed a second time in M9 (caught before the device run, 2026-09-17): the
// bundle gained 77k Uzbek glosses, surah_names, root_glosses and the Tasnim
// translation, and this still read 'm7b' -- so an installed phone would have
// kept its old extract and shown none of it. Nothing can test for this: the
// suite cannot know the DB's contents changed. Bump it in the same commit that
// regenerates the DB.
//
// Missed a THIRD time in M11 (caught on device, 2026-09-21): the bundle gained
// 114 Russian rows in surah_names and this still read 'm9'. The Russian names
// did appear -- on a phone whose extract happened to be new -- and then the
// row-3 correction in the next build did not, which is the same defect wearing
// a disguise. If the DB changed and this line did not, an installed phone
// shows the OLD data and nothing anywhere says so.
// 'm11b' rather than 'm11a': same reasoning, one build later. m11a shipped in
// vc32 and was already extracted, so vc33's launch took the `if (info.exists)`
// early return and the cleanup loop -- the code that deleted the user's
// database -- never ran. A version a phone does not hold is the only thing
// that makes it run.
//
// 's2' for phase S2, which rebuilds the asset twice: the seal-time VACUUM
// (164.8 -> 127.0 MB) and the prune of the five translator sets the reader
// cannot display. The first of those is byte-different but content-equivalent,
// which is the near-miss worth naming -- with no bump an upgrading phone takes
// the `if (info.exists)` early return, keeps its 164.8 MB extract, and the
// 37.8 MB of storage this phase buys lands on fresh installs only. The prune
// after it IS a content change, and would show the old translations. One bump
// covers both: nothing has shipped 's2' yet, so it is still a version no phone
// holds. It bumps again the next time the asset changes after S2 ships.
export const corpusDbVersion = 's2';
export const corpusDbFileName = `quran-corpus-${corpusDbVersion}.db`;

/** The user's own database, which lives in the same directory as the extracts
 *  below and must NEVER be deleted -- it holds bookmarks, notes, reading
 *  history and settings, it is the one file on the phone the app cannot
 *  rebuild, and it is meant to survive app updates.
 *
 *  It lives here rather than in userDb.ts because the cleanup below is what
 *  has to know it, and userDb.ts imports expo-sqlite at module scope -- this
 *  file require()s its dependencies precisely so it stays testable without
 *  them. userDb.ts imports the name back from here, so the two cannot drift. */
export const userDbFileName = 'quran-corpus-user.db';

/** Matches this app's own extracts, any version, including the `-wal`/`-shm`
 *  sidecars SQLite writes beside them -- and nothing else in the SQLite
 *  directory.
 *
 *  `user` is [a-z0-9]+, so `quran-corpus-user.db` matched this pattern and the
 *  cleanup below deleted the user's database on every corpus-version bump --
 *  bookmarks, notes, history and settings, gone, on exactly the upgrade path
 *  the version bump exists to serve. Reproduced on device 2026-09-21 going
 *  from m9 to m11: the app came back up in English with no history. The
 *  exclusion is asserted in a test; the pattern alone cannot express it,
 *  because any tightening still has to be right about a name it was never
 *  meant to match. */
const corpusDbPattern = /^quran-corpus-[a-z0-9]+\.db(\.partial)?(-wal|-shm|-journal)?$/;

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
  readDirectoryAsync(uri: string): Promise<string[]>;
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

  // A previous version's extract is dead weight the moment this one lands --
  // 134 MB of it -- and deleting it before the copy also means a phone low on
  // space is not asked to hold both at once. The user DB lives in this same
  // directory and is skipped by name, not by trusting the pattern: it used to
  // match, and the phone paid for it.
  //
  // The `-wal`/`-shm` sidecars go with it. expo-sqlite opens in WAL mode, so
  // every extract leaves a pair of them, and a pattern that matched only the
  // `.db` left them behind on every bump -- accumulating exactly the space
  // this loop exists to reclaim.
  const keep = new Set([corpusDbFileName, `${corpusDbFileName}-wal`, `${corpusDbFileName}-shm`]);
  for (const entry of await fileSystem.readDirectoryAsync(sqliteDir)) {
    // `startsWith`, not an equality plus a `-` arm: the user DB's own
    // siblings include `quran-corpus-user.db.partial`, the staging name the
    // restore in userDb.ts copies to -- and `user` is [a-z0-9]+, so that name
    // matches the pattern below just as the `.db` did. Both run unsequenced at
    // launch, and this loop only runs on the launch where the extract is
    // missing, which is exactly the upgrade launch a restore happens on: a
    // sweep landing mid-copy would delete the staging file, the move would
    // throw, and the app would open an empty user DB having just declined to
    // restore the only backup of it.
    if (entry.startsWith(userDbFileName)) continue;
    if (corpusDbPattern.test(entry) && !keep.has(entry)) {
      // Named, not silent. This loop deleted the user's database once (#92)
      // and the app said nothing about it either time it ran; a line per
      // deletion is what turns the next such report from a reconstruction
      // into a reading.
      console.warn(`[corpus db] removing stale extract ${entry}`);
      await fileSystem.deleteAsync(`${sqliteDir}/${entry}`, { idempotent: true });
    }
  }

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

// The open handle is memoized too, mirroring openUserDb. Every screen mount
// re-opened the database, and each open re-ran the PRAGMA below and took
// another native reference to the same cached connection that nothing ever
// releases. One connection for the process is what the app actually wants.
let connection: Promise<SQLite.SQLiteDatabase> | null = null;

export function openCorpusDb(): Promise<SQLite.SQLiteDatabase> {
  // Do not cache a failure: a transient open error would otherwise poison every
  // later call for the lifetime of the process.
  connection ??= createCorpusDb().catch((error: unknown) => {
    connection = null;
    throw error;
  });
  return connection;
}

async function createCorpusDb(): Promise<SQLite.SQLiteDatabase> {
  const { Asset } = require('expo-asset') as typeof ExpoAsset;
  const FileSystem = require('expo-file-system/legacy') as typeof ExpoFileSystemLegacy;
  const SQLiteRuntime = require('expo-sqlite') as typeof ExpoSQLite;

  // One directory, handed to both the writer and the reader. Passing a bare
  // filename to openDatabaseSync resolves it against expo-sqlite's own default
  // directory instead, which is not where expo-file-system just wrote: under
  // Expo Go the file system is scoped per experience
  // (files/ExperienceData/<scope>/) while expo-sqlite is not, so the extract
  // landed somewhere SQLite never looked and it silently opened a fresh empty
  // database -- surfacing much later as "no such table: surahs". Extracting
  // into expo-sqlite's directory instead is not an option either; Expo Go
  // refuses writes outside the experience sandbox.
  const sqliteDirUri = `${FileSystem.documentDirectory}SQLite`;
  // openDatabaseSync goes straight to native and wants a path, not a URI, so
  // the scheme comes off -- but nothing more. Native percent-decodes the rest
  // itself, and decoding here as well turns Expo Go's escaped scope key into a
  // directory that does not exist, where SQLite then creates a blank database
  // rather than failing.
  const sqliteDirPath = sqliteDirUri.replace(/^file:\/\//, '');

  extraction ??= ensureCorpusDbFile(FileSystem, sqliteDirUri, async () => {
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

  const db = SQLiteRuntime.openDatabaseSync(corpusDbFileName, undefined, sqliteDirPath);
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

  // TTF, not WOFF2. Android's Typeface cannot read WOFF2 and expo-font reports
  // no error when it fails -- it falls back to the system face, which renders
  // Arabic perfectly plausibly. `hafs.18.woff2` shipped as family `Hafs` from
  // M0 until 2026-09-08 and never once applied. See M7a Findings §4.
  return useFonts({
    Hafs: require('../../assets/fonts/hafs.ttf'),
    Newsreader: require('../../assets/fonts/Newsreader-Regular.ttf'),
    'Newsreader-SemiBold': require('../../assets/fonts/Newsreader-SemiBold.ttf'),
    // The calligraphic surah name the mushaf's band carries, the same pair web
    // uses: one PUA glyph per surah, and v4 only because v2 has no glyph for
    // surah 102 at all.
    SurahNameV2: require('../../assets/fonts/SurahNameV2.ttf'),
    SurahNameV4: require('../../assets/fonts/SurahNameV4.ttf'),
  });
}
