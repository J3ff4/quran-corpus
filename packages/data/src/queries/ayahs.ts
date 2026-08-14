import type { QueryClient, QueryRow } from '../queryClient.js';
import type { Ayah, Word } from '../types.js';
import { getWordsByAyah } from './words.js';
import { stripQuranicAnnotations } from '../text/normalize.js';

function rowToAyah(row: QueryRow): Ayah {
  return {
    id: row['id'] as number,
    surah_id: row['surah_id'] as number,
    ayah_number: row['ayah_number'] as number,
    text_uthmani: stripQuranicAnnotations(row['text_uthmani'] as string),
    text_simple: (row['text_simple'] as string | null) ?? null,
    juz: (row['juz'] as number | null) ?? null,
    page: (row['page'] as number | null) ?? null,
    audio_url: (row['audio_url'] as string | null) ?? null,
  };
}

export async function getAyahsBySurah(db: QueryClient, surahId: number): Promise<Ayah[]> {
  const result = await db.execute({
    sql: 'SELECT * FROM ayahs WHERE surah_id = ? ORDER BY ayah_number',
    args: [surahId],
  });
  return result.rows.map(rowToAyah);
}

export async function getAyahWithWords(
  db: QueryClient,
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
