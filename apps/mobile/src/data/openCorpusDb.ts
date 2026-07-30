import type * as ExpoAsset from 'expo-asset';
import type * as ExpoFileSystemLegacy from 'expo-file-system/legacy';
import type * as ExpoFont from 'expo-font';
import type * as SQLite from 'expo-sqlite';
import type * as ExpoSQLite from 'expo-sqlite';

export const corpusDbAssetName = 'quran.db';
export const corpusDbFileName = 'quran-corpus-m1.db';

export async function openCorpusDb(): Promise<SQLite.SQLiteDatabase> {
  const { Asset } = require('expo-asset') as typeof ExpoAsset;
  const FileSystem = require('expo-file-system/legacy') as typeof ExpoFileSystemLegacy;
  const SQLiteRuntime = require('expo-sqlite') as typeof ExpoSQLite;
  const sqliteDir = `${FileSystem.documentDirectory}SQLite`;
  const targetPath = `${sqliteDir}/${corpusDbFileName}`;

  await FileSystem.makeDirectoryAsync(sqliteDir, { intermediates: true });
  const info = await FileSystem.getInfoAsync(targetPath);

  if (!info.exists) {
    const asset = Asset.fromModule(require('../../assets/db/quran.db'));
    await asset.downloadAsync();
    if (!asset.localUri) throw new Error('Bundled corpus DB asset did not resolve to a local URI');
    await FileSystem.copyAsync({ from: asset.localUri, to: targetPath });
  }

  return SQLiteRuntime.openDatabaseSync(corpusDbFileName);
}

export function useCorpusFonts(): [boolean, Error | null] {
  const { useFonts } = require('expo-font') as typeof ExpoFont;

  return useFonts({
    Hafs: require('../../assets/fonts/hafs.18.woff2'),
  });
}
