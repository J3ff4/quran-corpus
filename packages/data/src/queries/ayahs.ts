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

/** One ayah's coordinate and its text, for a list that shows ayahs from many
 *  surahs at once. */
export interface AyahPreview {
  surah_id: number;
  ayah_number: number;
  text_uthmani: string;
}

/** Pairs per statement. Each coordinate binds two variables, and SQLite's
 *  variable limit is 999 on the builds that still ship the old default -- so
 *  400 pairs (800 variables) stays clear of it with room for the rest of the
 *  statement. A reader with 500 bookmarks is not the common case, but an
 *  unbounded IN list built from a row count the user controls is how that
 *  reader gets a cryptic error instead of a list. */
const PREVIEW_CHUNK = 400;

/**
 * The text of specific ayahs, addressed by coordinate.
 *
 * The bookmarks list needs ayahs scattered across many surahs, which the
 * per-surah readers cannot answer without loading each whole surah -- 60
 * bookmarks over 20 surahs is 20 full-surah loads on a phone.
 *
 * Matched as an OR-chain of coordinate pairs rather than an arithmetic key
 * (`surah_id * 1000 + ayah_number`), which would be shorter and would not use
 * the `UNIQUE(surah_id, ayah_number)` index. Coordinates are bound, never
 * interpolated; only the number of placeholders varies with the input.
 *
 * Rows come back in mushaf order regardless of the order asked for, and a
 * coordinate that matches nothing is simply absent -- the caller pairs the
 * results back up by coordinate.
 */
export async function getAyahPreviews(
  db: QueryClient,
  coordinates: readonly { surahId: number; ayahNumber: number }[],
): Promise<AyahPreview[]> {
  for (const { surahId, ayahNumber } of coordinates) {
    // Loud rather than silent: a non-integer binds cleanly and matches nothing,
    // so a caller passing '2' instead of 2 would see an ayah quietly missing
    // from the list rather than an error.
    if (!Number.isInteger(surahId) || !Number.isInteger(ayahNumber)) {
      throw new TypeError(`ayah coordinates must be integers, got ${surahId}:${ayahNumber}`);
    }
  }

  const previews: AyahPreview[] = [];

  for (let start = 0; start < coordinates.length; start += PREVIEW_CHUNK) {
    const chunk = coordinates.slice(start, start + PREVIEW_CHUNK);
    const result = await db.execute({
      sql: `SELECT surah_id, ayah_number, text_uthmani FROM ayahs
            WHERE ${chunk.map(() => '(surah_id = ? AND ayah_number = ?)').join(' OR ')}
            ORDER BY surah_id, ayah_number`,
      args: chunk.flatMap(({ surahId, ayahNumber }) => [surahId, ayahNumber]),
    });
    previews.push(
      ...result.rows.map((row) => ({
        surah_id: row['surah_id'] as number,
        ayah_number: row['ayah_number'] as number,
        text_uthmani: stripQuranicAnnotations(row['text_uthmani'] as string),
      })),
    );
  }

  return previews;
}
