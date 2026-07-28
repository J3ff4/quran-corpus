import type { Client, Row } from '@libsql/client';
import type { Surah } from '../types.js';

function rowToSurah(row: Row): Surah {
  return {
    id: row['id'] as number,
    name_arabic: row['name_arabic'] as string,
    name_translit: row['name_translit'] as string,
    name_translation: row['name_translation'] as string,
    revelation_type: row['revelation_type'] as 'meccan' | 'medinan',
    ayah_count: row['ayah_count'] as number,
    order_number: row['order_number'] as number,
  };
}

export async function getAllSurahs(db: Client): Promise<Surah[]> {
  const result = await db.execute('SELECT * FROM surahs ORDER BY id');
  return result.rows.map(rowToSurah);
}

export async function getSurahById(db: Client, id: number): Promise<Surah | null> {
  const result = await db.execute({ sql: 'SELECT * FROM surahs WHERE id = ?', args: [id] });
  const row = result.rows[0];
  return row != null ? rowToSurah(row) : null;
}
