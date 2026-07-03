import type { Client } from '@libsql/client';
import { normalizeArabic, escapeFtsQuery } from '../text/normalize.js';
import { searchRoots } from './roots.js';
import { getWordsByAyah } from './words.js';
import type { VerseRef, VerseHit, JumpVerse, SearchResult } from '../types.js';

// One-time populate of search_fts. Arabic rows are normalized here (source='ar')
// because SQL triggers cannot run the JS normalizer; translation rows are kept
// synced by triggers (see schema.sql trg_translations_ai/au/ad), so on a fresh
// DB they may already be indexed by the time this runs. We guard on Arabic
// specifically (not total count) so backfill still populates Arabic even when
// the trigger already indexed translations, and skip any translation row the
// trigger already inserted to avoid duplicates.
export async function backfillSearchIndex(db: Client): Promise<void> {
  const arDone = await db.execute("SELECT count(*) AS c FROM search_fts WHERE source='ar'");
  if ((arDone.rows[0]!['c'] as number) > 0) return;

  const ayahs = await db.execute(
    'SELECT id, surah_id, ayah_number, text_uthmani FROM ayahs',
  );
  for (const r of ayahs.rows) {
    await db.execute({
      sql: 'INSERT INTO search_fts (surah_id, ayah_number, source, ref_id, body) VALUES (?,?,?,?,?)',
      args: [
        r['surah_id'] as number,
        r['ayah_number'] as number,
        'ar',
        r['id'] as number,
        normalizeArabic(r['text_uthmani'] as string),
      ],
    });
  }

  const tr = await db.execute(
    `SELECT t.id, a.surah_id, a.ayah_number, t.language_code, t.text
     FROM translations t JOIN ayahs a ON a.id = t.ayah_id`,
  );
  for (const r of tr.rows) {
    const seen = await db.execute({
      sql: 'SELECT 1 FROM search_fts WHERE source = ? AND ref_id = ? LIMIT 1',
      args: [r['language_code'] as string, r['id'] as number],
    });
    if (seen.rows.length > 0) continue;
    await db.execute({
      sql: 'INSERT INTO search_fts (surah_id, ayah_number, source, ref_id, body) VALUES (?,?,?,?,?)',
      args: [
        r['surah_id'] as number,
        r['ayah_number'] as number,
        r['language_code'] as string,
        r['id'] as number,
        r['text'] as string,
      ],
    });
  }
}

function latinKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function parseVerseRef(db: Client, q: string): Promise<VerseRef | null> {
  const s = q.trim();
  if (s.length === 0) return null;

  const numeric = s.match(/^(\d{1,3})(?::(\d{1,3})(?::(\d{1,3}))?)?$/);
  if (numeric) {
    const surah = Number(numeric[1]);
    if (surah < 1 || surah > 114) return null;
    return {
      surah,
      ayah: numeric[2] !== undefined ? Number(numeric[2]) : null,
      position: numeric[3] !== undefined ? Number(numeric[3]) : null,
    };
  }

  // Surah name, optional trailing ayah number: "Al-Baqarah 255", "the opener".
  const named = s.match(/^(.+?)(?:\s+(\d{1,3}))?$/);
  if (!named) return null;
  const namePart = named[1]!.trim();
  const ayah = named[2] !== undefined ? Number(named[2]) : null;
  const wantLatin = latinKey(namePart);
  const wantArabic = normalizeArabic(namePart);
  if (wantLatin.length === 0 && wantArabic.length === 0) return null;

  const surahs = await db.execute(
    'SELECT id, name_arabic, name_translit, name_translation FROM surahs',
  );
  for (const r of surahs.rows) {
    const translit = latinKey(r['name_translit'] as string);
    const translation = latinKey(r['name_translation'] as string);
    const arabic = normalizeArabic(r['name_arabic'] as string);
    if (
      (wantLatin.length > 0 && (wantLatin === translit || wantLatin === translation)) ||
      (wantArabic.length > 0 && wantArabic === arabic)
    ) {
      return { surah: r['id'] as number, ayah, position: null };
    }
  }
  return null;
}

export async function searchVerses(
  db: Client,
  q: string,
  opts?: { limit?: number },
): Promise<VerseHit[]> {
  const limit = opts?.limit ?? 50;
  const term = normalizeArabic(q).trim();
  if (term.length === 0) return [];
  const match = escapeFtsQuery(term);
  // body is column index 4; \u0002/\u0003 wrap matched tokens (rendered as <mark>
  // in React text nodes, never raw HTML). bm25 ascending = most relevant first.
  const res = await db.execute({
    sql: `SELECT surah_id, ayah_number, source,
                 snippet(search_fts, 4, char(2), char(3), '…', 12) AS snippet
          FROM search_fts
          WHERE search_fts MATCH ?
          ORDER BY bm25(search_fts)
          LIMIT ?`,
    args: [match, limit],
  });
  return res.rows.map((r) => ({
    surah_id: r['surah_id'] as number,
    ayah_number: r['ayah_number'] as number,
    source: r['source'] as string,
    snippet: r['snippet'] as string,
  }));
}

export async function search(db: Client, q: string): Promise<SearchResult> {
  const query = q.trim();
  if (query.length === 0) return { jump: null, verses: [], roots: [] };

  const ref = await parseVerseRef(db, query);
  let jump: JumpVerse | null = null;
  if (ref) {
    if (ref.ayah !== null) {
      const a = await db.execute({
        sql: 'SELECT id, surah_id, ayah_number, text_uthmani FROM ayahs WHERE surah_id = ? AND ayah_number = ?',
        args: [ref.surah, ref.ayah],
      });
      const row = a.rows[0];
      if (row) {
        const words = await getWordsByAyah(db, row['id'] as number);
        jump = {
          surah_id: row['surah_id'] as number,
          ayah_number: row['ayah_number'] as number,
          text_uthmani: row['text_uthmani'] as string,
          words: words.map((w) => ({ position: w.position, text_arabic: w.text_arabic })),
          highlightPosition: ref.position,
        };
      }
    } else {
      jump = {
        surah_id: ref.surah,
        ayah_number: null,
        text_uthmani: '',
        words: [],
        highlightPosition: null,
      };
    }
  }

  const [verses, roots] = await Promise.all([searchVerses(db, query), searchRoots(db, query)]);
  return { jump, verses, roots };
}
