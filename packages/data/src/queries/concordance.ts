import type { Client } from '@libsql/client';
import type { VerseWord } from '../types.js';
import { stripQuranicAnnotations } from '../text/normalize.js';

/**
 * Page size for concordance paging. Single source of truth: the SSR initial
 * page, the client Load-more page, and the API route's DEFAULT_LIMIT must all
 * agree, or Load-more's `offset = entries.length` skips or repeats rows.
 */
export const CONCORDANCE_PAGE_SIZE = 20;

/** Ceiling for a single concordance page request. Caps how much of the
 *  corpus's most expensive query (it rebuilds every matched verse) one
 *  unauthenticated request can pull. */
export const CONCORDANCE_MAX_LIMIT = 50;

/** Clamp a query-string integer to [min,max], falling back to `fallback` on
 *  junk (missing, blank, non-numeric, fractional).
 *
 *  Blank is checked before the numeric conversion because `Number('')` and
 *  `Number('  ')` are `0`, not `NaN` -- so `?limit=` would pass the integer
 *  test and clamp to `min`, serving a 1-row page instead of the documented
 *  default of 20. `?offset=` would land on 0, which is right by accident. */
function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw === null || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/**
 * Parse `limit`/`offset` for a concordance page request. Lives here rather
 * than in each route so the root and lemma endpoints cannot drift apart on
 * what they accept -- Load-more computes `offset = entries.length` against
 * whatever page size the other route returned.
 */
export function parseConcordancePaging(sp: URLSearchParams): { limit: number; offset: number } {
  return {
    limit: clampInt(sp.get('limit'), CONCORDANCE_PAGE_SIZE, 1, CONCORDANCE_MAX_LIMIT),
    offset: clampInt(sp.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

/**
 * Guard LIMIT/OFFSET before they are bound into SQL. The routes clamp their
 * own input, but every other caller (SSR pages, tests, a future apps/mobile)
 * passes these straight through, and **SQLite treats a negative LIMIT as "no
 * limit"** -- `limit: -1` would silently return the whole concordance and
 * rebuild every one of its verses. Throws rather than clamps: reaching here
 * with junk is a programming error, not user input.
 */
export function assertPagingBounds(limit: number | undefined, offset: number): void {
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) {
    throw new RangeError('limit must be a positive safe integer');
  }
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new RangeError('offset must be a non-negative safe integer');
  }
}

/**
 * Rebuild each ayah's full word list (for the concordance verse-trim UI),
 * keyed by ayah_id. Shared by the root and lemma concordance queries -- both
 * need the same per-ayah sibling-word assembly once they have their matched
 * rows, and the only thing that differs between them is *which* words match,
 * not how the surrounding verse is rebuilt.
 *
 * `starts_clause` marks a word whose first segment is a clause boundary
 * (SUB/REM), used to pick a sensible trim window. `text_arabic` is stripped of
 * Quranic annotation marks the same way the matched rows are.
 *
 * The ayah_id IN clause is batched (default 500) so a hot root/lemma spanning
 * thousands of ayahs never exceeds SQLite's SQLITE_LIMIT_VARIABLE_NUMBER
 * (999 pre-3.32).
 */
export async function buildVerseWordsByAyah(
  db: Client,
  ayahIds: number[],
  batchSize = 500,
): Promise<Map<number, VerseWord[]>> {
  // Guard the boundary: batchSize <= 0 would never advance `i` (infinite loop
  // of empty queries), and > 500 breaks this helper's SQLite bind-limit
  // guarantee (SQLITE_LIMIT_VARIABLE_NUMBER, 999 pre-3.32).
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) {
    throw new RangeError('batchSize must be an integer between 1 and 500');
  }
  const wordsByAyah = new Map<number, VerseWord[]>();
  for (let i = 0; i < ayahIds.length; i += batchSize) {
    const chunk = ayahIds.slice(i, i + batchSize);
    const placeholders = chunk.map(() => '?').join(',');
    const sib = await db.execute({
      sql: `SELECT w.ayah_id, w.id, w.position, w.text_arabic,
                   EXISTS (SELECT 1 FROM word_segments s
                           WHERE s.word_id = w.id
                             AND s.segment_index = (SELECT MIN(segment_index) FROM word_segments WHERE word_id = w.id)
                             AND s.pos_tag IN ('SUB','REM')) AS starts_clause
            FROM words w
            WHERE w.ayah_id IN (${placeholders})
            ORDER BY w.ayah_id, w.position`,
      args: chunk,
    });
    for (const r of sib.rows) {
      const aid = r['ayah_id'] as number;
      const list = wordsByAyah.get(aid) ?? [];
      list.push({
        id: r['id'] as number,
        position: r['position'] as number,
        text_arabic: stripQuranicAnnotations(r['text_arabic'] as string),
        starts_clause: (r['starts_clause'] as number) === 1,
      });
      wordsByAyah.set(aid, list);
    }
  }
  return wordsByAyah;
}
