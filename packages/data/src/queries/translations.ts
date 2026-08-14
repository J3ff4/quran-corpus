import type { QueryClient, QueryRow } from '../queryClient.js';
import type { Translation } from '../types.js';

function rowToTranslation(row: QueryRow): Translation {
  return {
    id: row['id'] as number,
    ayah_id: row['ayah_id'] as number,
    language_code: row['language_code'] as string,
    translator: row['translator'] as string,
    text: row['text'] as string,
  };
}

export async function getTranslationsByAyah(db: QueryClient, ayahId: number): Promise<Translation[]> {
  const result = await db.execute({
    sql: 'SELECT * FROM translations WHERE ayah_id = ? ORDER BY language_code',
    args: [ayahId],
  });
  return result.rows.map(rowToTranslation);
}

export async function getTranslation(
  db: QueryClient,
  ayahId: number,
  languageCode: string,
): Promise<Translation | null> {
  const result = await db.execute({
    sql: 'SELECT * FROM translations WHERE ayah_id = ? AND language_code = ? LIMIT 1',
    args: [ayahId, languageCode],
  });
  const row = result.rows[0];
  return row != null ? rowToTranslation(row) : null;
}

export async function getTranslationsBySurahAndLang(
  db: QueryClient,
  surahId: number,
  languageCode: string,
): Promise<Translation[]> {
  const result = await db.execute({
    sql: `SELECT t.*
          FROM translations t
          JOIN ayahs a ON a.id = t.ayah_id
          WHERE a.surah_id = ? AND t.language_code = ?
          ORDER BY a.ayah_number`,
    args: [surahId, languageCode],
  });
  return result.rows.map(rowToTranslation);
}
