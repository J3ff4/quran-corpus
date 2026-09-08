import type { QueryClient } from '../queryClient.js';

export const MUSHAF_PAGE_MIN = 1;
export const MUSHAF_PAGE_MAX = 604;

export interface MushafWord {
  surahId: number;
  ayahNumber: number;
  position: number;
  /** `end` rows are ayah medallions: position n+1 of an n-word ayah, with no
   *  `words` row behind them. */
  charType: 'word' | 'end';
  /** The QCF V2 glyph codepoint string. Renders as tofu -- or worse, as
   *  plausible Arabic in the system font -- unless that page's font is loaded. */
  glyph: string;
}

export interface MushafLine {
  line: number;
  words: MushafWord[];
}

/**
 * One mushaf page, grouped into its lines.
 *
 * The page number comes off a route param, so it is validated here rather than
 * trusted: an out-of-range or non-integer page would otherwise reach SQLite as
 * a bound parameter and answer with an empty page, which looks like a missing
 * import rather than a bad request.
 */
export async function getMushafPage(
  client: QueryClient,
  page: number,
): Promise<MushafLine[]> {
  if (!Number.isInteger(page) || page < MUSHAF_PAGE_MIN || page > MUSHAF_PAGE_MAX) {
    throw new RangeError(
      `mushaf page must be an integer ${MUSHAF_PAGE_MIN}..${MUSHAF_PAGE_MAX}, got ${page}`,
    );
  }

  const result = await client.execute({
    sql: `SELECT line, seq, surah_id, ayah_number, position, char_type, glyph
            FROM mushaf_layout
           WHERE page = ?
           ORDER BY line, seq`,
    args: [page],
  });

  const lines: MushafLine[] = [];
  let current: MushafLine | undefined;
  for (const row of result.rows) {
    const line = Number(row['line']);
    // Rows arrive ordered by line, so the current line is always the last one
    // pushed -- no map, no second pass.
    if (!current || current.line !== line) {
      current = { line, words: [] };
      lines.push(current);
    }
    current.words.push({
      surahId: Number(row['surah_id']),
      ayahNumber: Number(row['ayah_number']),
      position: Number(row['position']),
      charType: String(row['char_type']) as 'word' | 'end',
      glyph: String(row['glyph']),
    });
  }
  return lines;
}
