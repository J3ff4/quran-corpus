import type { MobileDataClient } from '@quran-corpus/mobile-data';

export interface Bookmark {
  surahId: number;
  ayahNumber: number;
}

export interface ReadingPosition {
  surahId: number;
  ayahNumber: number;
}

export async function setBookmark(
  client: MobileDataClient,
  surahId: number,
  ayahNumber: number,
  bookmarked: boolean,
): Promise<void> {
  if (bookmarked) {
    await client.execute({
      sql: `INSERT INTO bookmarks (surah_id, ayah_number)
            VALUES (?, ?)
            ON CONFLICT(surah_id, ayah_number) DO NOTHING`,
      args: [surahId, ayahNumber],
    });
    return;
  }

  await client.execute({
    sql: 'DELETE FROM bookmarks WHERE surah_id = ? AND ayah_number = ?',
    args: [surahId, ayahNumber],
  });
}

export async function getBookmarks(client: MobileDataClient): Promise<Bookmark[]> {
  const result = await client.execute(`
    SELECT surah_id, ayah_number
    FROM bookmarks
    ORDER BY surah_id, ayah_number
  `);

  return result.rows.map((row) => ({
    surahId: Number(row.surah_id),
    ayahNumber: Number(row.ayah_number),
  }));
}

export async function recordReadingPosition(
  client: MobileDataClient,
  surahId: number,
  ayahNumber: number,
): Promise<void> {
  await client.execute({
    sql: `INSERT INTO reading_history (id, surah_id, ayah_number, updated_at)
          VALUES (1, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
            surah_id = excluded.surah_id,
            ayah_number = excluded.ayah_number,
            updated_at = CURRENT_TIMESTAMP`,
    args: [surahId, ayahNumber],
  });
}

export async function getLastReadingPosition(client: MobileDataClient): Promise<ReadingPosition | null> {
  const result = await client.execute(`
    SELECT surah_id, ayah_number
    FROM reading_history
    WHERE id = 1
  `);
  const row = result.rows[0];
  if (!row) return null;

  return {
    surahId: Number(row.surah_id),
    ayahNumber: Number(row.ayah_number),
  };
}

export async function saveSetting(client: MobileDataClient, key: string, value: string): Promise<void> {
  await client.execute({
    sql: `INSERT INTO settings (key, value, updated_at)
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = CURRENT_TIMESTAMP`,
    args: [key, value],
  });
}

export async function getSetting(client: MobileDataClient, key: string): Promise<string | null> {
  const result = await client.execute({
    sql: 'SELECT value FROM settings WHERE key = ?',
    args: [key],
  });
  const value = result.rows[0]?.value;
  return value == null ? null : String(value);
}
