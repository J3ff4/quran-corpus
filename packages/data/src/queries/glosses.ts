import type { Client, Row } from '@libsql/client';
import type { WordGloss } from '../types.js';

function rowToWordGloss(row: Row): WordGloss {
  return {
    id: row['id'] as number,
    word_id: row['word_id'] as number,
    language_code: row['language_code'] as string,
    gloss_text: row['gloss_text'] as string,
  };
}

export async function getGlossesBySurahAndLang(
  db: Client,
  surahId: number,
  languageCode: string,
): Promise<WordGloss[]> {
  const result = await db.execute({
    sql: `SELECT g.*
          FROM word_glosses g
          JOIN words w ON w.id = g.word_id
          JOIN ayahs a ON a.id = w.ayah_id
          WHERE a.surah_id = ? AND g.language_code = ?`,
    args: [surahId, languageCode],
  });
  return result.rows.map(rowToWordGloss);
}
