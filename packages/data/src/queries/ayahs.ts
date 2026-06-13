import type { Client, Row } from '@libsql/client';
import type { Ayah, Word } from '../types.js';
import { getWordsByAyah } from './words.js';

function rowToAyah(row: Row): Ayah {
  return {
    id: row['id'] as number,
    surah_id: row['surah_id'] as number,
    ayah_number: row['ayah_number'] as number,
    text_uthmani: row['text_uthmani'] as string,
    text_simple: (row['text_simple'] as string | null) ?? null,
    juz: (row['juz'] as number | null) ?? null,
    page: (row['page'] as number | null) ?? null,
    audio_url: (row['audio_url'] as string | null) ?? null,
  };
}

export async function getAyahsBySurah(db: Client, surahId: number): Promise<Ayah[]> {
  const result = await db.execute({
    sql: 'SELECT * FROM ayahs WHERE surah_id = ? ORDER BY ayah_number',
    args: [surahId],
  });
  return result.rows.map(rowToAyah);
}

export async function getAyahWithWords(
  db: Client,
  ayahId: number,
): Promise<{ ayah: Ayah; words: Word[] } | null> {
  const result = await db.execute({
    sql: 'SELECT * FROM ayahs WHERE id = ?',
    args: [ayahId],
  });
  const row = result.rows[0];
  if (row == null) return null;
  const ayah = rowToAyah(row);
  const words = await getWordsByAyah(db, ayahId);
  return { ayah, words };
}
