import type { Client, Row } from '@libsql/client';
import type { Word, WordSegment, ConceptTag, WordDetail } from '../types.js';
import { stripQuranicAnnotations } from '../text/normalize.js';

function strip(s: string | null): string | null {
  return s == null ? null : stripQuranicAnnotations(s);
}

function rowToWord(row: Row): Word {
  return {
    id: row['id'] as number,
    ayah_id: row['ayah_id'] as number,
    position: row['position'] as number,
    text_arabic: stripQuranicAnnotations(row['text_arabic'] as string),
    transliteration: (row['transliteration'] as string | null) ?? null,
    root: (row['root'] as string | null) ?? null,
    lemma: strip(row['lemma'] as string | null),
    root_buckwalter: (row['root_buckwalter'] as string | null) ?? null,
    lemma_buckwalter: (row['lemma_buckwalter'] as string | null) ?? null,
    pos_tag: (row['pos_tag'] as string | null) ?? null,
    morphology_json: (row['morphology_json'] as string | null) ?? null,
    morphology_description: (row['morphology_description'] as string | null) ?? null,
    grammar_arabic: strip(row['grammar_arabic'] as string | null),
    audio_url: (row['audio_url'] as string | null) ?? null,
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

export async function getWordsBySurahAyahRange(
  db: Client,
  surahId: number,
  loAyah: number,
  hiAyah: number,
): Promise<Word[]> {
  const result = await db.execute({
    sql: `SELECT w.*
          FROM words w
          JOIN ayahs a ON a.id = w.ayah_id
          WHERE a.surah_id = ? AND a.ayah_number BETWEEN ? AND ?
          ORDER BY a.ayah_number, w.position`,
    args: [surahId, loAyah, hiAyah],
  });
  return result.rows.map(rowToWord);
}

function rowToSegment(row: Row): WordSegment {
  return {
    id: row['id'] as number,
    word_id: row['word_id'] as number,
    segment_index: row['segment_index'] as number,
    segment_type: (row['segment_type'] as string | null) ?? null,
    pos_tag: (row['pos_tag'] as string | null) ?? null,
    form_arabic: strip(row['form_arabic'] as string | null),
    form_buckwalter: (row['form_buckwalter'] as string | null) ?? null,
    features_json: (row['features_json'] as string | null) ?? null,
    lemma: strip(row['lemma'] as string | null),
    root: (row['root'] as string | null) ?? null,
  };
}

function rowToConceptTag(row: Row): ConceptTag {
  return {
    id: row['id'] as number,
    word_id: row['word_id'] as number,
    tag_label: row['tag_label'] as string,
    tag_type: (row['tag_type'] as string | null) ?? null,
  };
}

export async function getWordByLocation(
  db: Client,
  surah: number,
  ayah: number,
  position: number,
): Promise<Word | null> {
  const result = await db.execute({
    sql: `SELECT w.*
          FROM words w
          JOIN ayahs a ON a.id = w.ayah_id
          WHERE a.surah_id = ? AND a.ayah_number = ? AND w.position = ?`,
    args: [surah, ayah, position],
  });
  return result.rows[0] ? rowToWord(result.rows[0]) : null;
}

export async function getWordDetail(
  db: Client,
  wordId: number,
): Promise<WordDetail | null> {
  const wordRes = await db.execute({
    sql: 'SELECT * FROM words WHERE id = ?',
    args: [wordId],
  });
  if (!wordRes.rows[0]) return null;
  const [segRes, tagRes] = await Promise.all([
    db.execute({
      sql: 'SELECT * FROM word_segments WHERE word_id = ? ORDER BY segment_index',
      args: [wordId],
    }),
    db.execute({
      sql: 'SELECT * FROM word_concept_tags WHERE word_id = ? ORDER BY id',
      args: [wordId],
    }),
  ]);
  return {
    word: rowToWord(wordRes.rows[0]),
    segments: segRes.rows.map(rowToSegment),
    concept_tags: tagRes.rows.map(rowToConceptTag),
  };
}

export async function getSegmentsByWordIds(
  db: Client,
  wordIds: number[],
): Promise<WordSegment[]> {
  if (wordIds.length === 0) return [];
  const placeholders = wordIds.map(() => '?').join(',');
  const result = await db.execute({
    sql: `SELECT * FROM word_segments WHERE word_id IN (${placeholders}) ORDER BY word_id, segment_index`,
    args: wordIds,
  });
  return result.rows.map(rowToSegment);
}
