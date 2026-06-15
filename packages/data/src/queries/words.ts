import type { Client, Row } from '@libsql/client';
import type { Word } from '../types.js';

function rowToWord(row: Row): Word {
  return {
    id: row['id'] as number,
    ayah_id: row['ayah_id'] as number,
    position: row['position'] as number,
    text_arabic: row['text_arabic'] as string,
    transliteration: (row['transliteration'] as string | null) ?? null,
    root: (row['root'] as string | null) ?? null,
    lemma: (row['lemma'] as string | null) ?? null,
    root_buckwalter: (row['root_buckwalter'] as string | null) ?? null,
    lemma_buckwalter: (row['lemma_buckwalter'] as string | null) ?? null,
    pos_tag: (row['pos_tag'] as string | null) ?? null,
    morphology_json: (row['morphology_json'] as string | null) ?? null,
  };
}

export async function getWordsByAyah(db: Client, ayahId: number): Promise<Word[]> {
  const result = await db.execute({
    sql: 'SELECT * FROM words WHERE ayah_id = ? ORDER BY position',
    args: [ayahId],
  });
  return result.rows.map(rowToWord);
}

export async function getWordsBySurah(db: Client, surahId: number): Promise<Word[]> {
  const result = await db.execute({
    sql: `SELECT w.*
          FROM words w
          JOIN ayahs a ON a.id = w.ayah_id
          WHERE a.surah_id = ?
          ORDER BY a.ayah_number, w.position`,
    args: [surahId],
  });
  return result.rows.map(rowToWord);
}
