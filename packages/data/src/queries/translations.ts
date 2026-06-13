import type { Client, Row } from '@libsql/client';
import type { Translation } from '../types.js';

function rowToTranslation(row: Row): Translation {
  return {
    id: row['id'] as number,
    ayah_id: row['ayah_id'] as number,
    language_code: row['language_code'] as string,
    translator: row['translator'] as string,
    text: row['text'] as string,
  };
}

export async function getTranslationsByAyah(db: Client, ayahId: number): Promise<Translation[]> {
  const result = await db.execute({
    sql: 'SELECT * FROM translations WHERE ayah_id = ? ORDER BY language_code',
    args: [ayahId],
  });
  return result.rows.map(rowToTranslation);
}

export async function getTranslation(
  db: Client,
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
