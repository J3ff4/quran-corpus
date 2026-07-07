import type { Client, Row } from '@libsql/client';
import type {
  Root,
  RootForm,
  RootDefinition,
  RootEntry,
  ConcordanceEntry,
  VerseWord,
  RootSearchItem,
} from '../types.js';
import { compareRootsArabic } from '../text/arabic.js';

function rowToRoot(r: Row): Root {
  return {
    id: r['id'] as number,
    root_buckwalter: r['root_buckwalter'] as string,
    root_arabic: r['root_arabic'] as string,
    occurrence_count: r['occurrence_count'] as number,
  };
}

function rowToForm(r: Row): RootForm {
  return {
    id: r['id'] as number,
    root_id: r['root_id'] as number,
    sort_order: r['sort_order'] as number,
    pos_label: r['pos_label'] as string,
    form_arabic: (r['form_arabic'] as string | null) ?? null,
    form_translit: (r['form_translit'] as string | null) ?? null,
    gloss: (r['gloss'] as string | null) ?? null,
    occurrence_count: r['occurrence_count'] as number,
  };
}

function rowToDefinition(r: Row): RootDefinition {
  return {
    id: r['id'] as number,
    root_id: r['root_id'] as number,
    source: r['source'] as string,
    definition: r['definition'] as string,
  };
}

export async function getRootByBuckwalter(db: Client, bw: string): Promise<Root | null> {
  const res = await db.execute({
    sql: 'SELECT * FROM roots WHERE root_buckwalter = ?',
    args: [bw],
  });
  return res.rows[0] ? rowToRoot(res.rows[0]) : null;
}

export async function getAllRoots(db: Client): Promise<Root[]> {
  const res = await db.execute('SELECT * FROM roots');
  return res.rows.map(rowToRoot).sort((a, b) => compareRootsArabic(a.root_arabic, b.root_arabic));
}

/** Slim: just root_arabic for every root — for alphabet letter counts without
 *  reading/sorting full rows when the display list comes from another query. */
export async function getRootArabicList(db: Client): Promise<string[]> {
  const res = await db.execute('SELECT root_arabic FROM roots');
  return res.rows.map((r) => r['root_arabic'] as string);
}

/** Every root plus a concatenated gloss blob, for a one-shot static payload
 *  that the dictionary page's client-side search can filter by meaning
 *  without a per-keystroke server round-trip. */
export async function getRootSearchList(db: Client): Promise<RootSearchItem[]> {
  const res = await db.execute(
    `SELECT r.id, r.root_buckwalter, r.root_arabic, r.occurrence_count,
            GROUP_CONCAT(f.gloss, ' ') AS gloss_blob
     FROM roots r
     LEFT JOIN root_forms f ON f.root_id = r.id
     GROUP BY r.id
     ORDER BY r.root_arabic`,
  );
  return res.rows.map((r) => ({
    id: r['id'] as number,
    root_buckwalter: r['root_buckwalter'] as string,
    root_arabic: r['root_arabic'] as string,
    occurrence_count: r['occurrence_count'] as number,
    gloss_blob: (r['gloss_blob'] as string | null) ?? null,
  }));
}

export async function getRootsByFrequency(db: Client, limit = 200): Promise<Root[]> {
  const res = await db.execute({
    sql: 'SELECT * FROM roots ORDER BY occurrence_count DESC, root_buckwalter LIMIT ?',
    args: [limit],
  });
  return res.rows.map(rowToRoot);
}

export async function searchRoots(db: Client, q: string): Promise<Root[]> {
  const like = `%${q}%`;
  const res = await db.execute({
    sql: `SELECT DISTINCT r.* FROM roots r
          LEFT JOIN root_forms f ON f.root_id = r.id
          WHERE r.root_buckwalter LIKE ? OR r.root_arabic LIKE ? OR f.gloss LIKE ?
          ORDER BY r.occurrence_count DESC LIMIT 100`,
    args: [like, like, like],
  });
  return res.rows.map(rowToRoot);
}

export async function getRootForms(db: Client, rootId: number): Promise<RootForm[]> {
  const res = await db.execute({
    // form_arabic IS NULL only ever marked See-Also junk (external dictionary
    // links the pre-fix scraper mistook for forms); real forms always carry
    // Arabic. Excluding them keeps the UI's empty-section guard correct.
    sql: 'SELECT * FROM root_forms WHERE root_id = ? AND form_arabic IS NOT NULL ORDER BY sort_order',
    args: [rootId],
  });
  return res.rows.map(rowToForm);
}

export async function getRootDefinitions(
  db: Client,
  rootId: number,
): Promise<RootDefinition[]> {
  const res = await db.execute({
    sql: 'SELECT * FROM root_definitions WHERE root_id = ? ORDER BY source',
    args: [rootId],
  });
  return res.rows.map(rowToDefinition);
}

export async function getRootEntry(db: Client, bw: string): Promise<RootEntry | null> {
  const root = await getRootByBuckwalter(db, bw);
  if (!root) return null;
  const [forms, definitions] = await Promise.all([
    getRootForms(db, root.id),
    getRootDefinitions(db, root.id),
  ]);
  return { root, forms, definitions };
}

export interface ConcordancePageOpts {
  /** Omit for the full, unbounded list; set for server-side paging. */
  limit?: number;
  offset?: number;
  lang?: string;
  batchSize?: number;
}

/** Total matched occurrences for a root — the paging total, cheap COUNT with no
 *  verse rebuild. One row per matched word (no join fan-out), so this equals the
 *  entry count of the concordance. */
export async function countRootConcordance(db: Client, bw: string): Promise<number> {
  const res = await db.execute({
    sql: 'SELECT COUNT(*) AS n FROM words WHERE root_buckwalter = ?',
    args: [bw],
  });
  return res.rows[0]!['n'] as number;
}

/** One page of a root's concordance (or all of it when `limit` is omitted).
 *  Deterministic surah→ayah→position order so LIMIT/OFFSET paging never repeats
 *  or skips an occurrence. */
export async function getRootConcordancePage(
  db: Client,
  bw: string,
  opts: ConcordancePageOpts = {},
): Promise<ConcordanceEntry[]> {
  const { limit, offset = 0, lang = 'en', batchSize = 500 } = opts;
  const args: (string | number)[] = [lang, bw];
  let paging = '';
  if (limit !== undefined) {
    paging = ' LIMIT ? OFFSET ?';
    args.push(limit, offset);
  }
  const matched = await db.execute({
    sql: `SELECT a.surah_id, a.ayah_number, w.position, w.id AS word_id,
                 w.ayah_id AS ayah_id, w.text_arabic, w.transliteration,
                 g.gloss_text AS gloss
          FROM words w
          JOIN ayahs a ON a.id = w.ayah_id
          LEFT JOIN word_glosses g ON g.word_id = w.id AND g.language_code = ?
          WHERE w.root_buckwalter = ?
          ORDER BY a.surah_id, a.ayah_number, w.position${paging}`,
    args,
  });
  if (matched.rows.length === 0) return [];

  const ayahIds = [...new Set(matched.rows.map((r) => r['ayah_id'] as number))];
  // Batch the IN clause: a hot root (الله ~1879 ayahs) would otherwise emit
  // more binds than SQLite's SQLITE_LIMIT_VARIABLE_NUMBER (999 pre-3.32).
  const wordsByAyah = new Map<number, VerseWord[]>();
  for (let i = 0; i < ayahIds.length; i += batchSize) {
    const chunk = ayahIds.slice(i, i + batchSize);
    const placeholders = chunk.map(() => '?').join(',');
    const sib = await db.execute({
      sql: `SELECT ayah_id, id, position, text_arabic FROM words
            WHERE ayah_id IN (${placeholders})
            ORDER BY ayah_id, position`,
      args: chunk,
    });
    for (const r of sib.rows) {
      const aid = r['ayah_id'] as number;
      const list = wordsByAyah.get(aid) ?? [];
      list.push({
        id: r['id'] as number,
        position: r['position'] as number,
        text_arabic: r['text_arabic'] as string,
      });
      wordsByAyah.set(aid, list);
    }
  }

  return matched.rows.map((r) => ({
    surah_id: r['surah_id'] as number,
    ayah_number: r['ayah_number'] as number,
    position: r['position'] as number,
    word_id: r['word_id'] as number,
    text_arabic: r['text_arabic'] as string,
    transliteration: (r['transliteration'] as string | null) ?? null,
    gloss: (r['gloss'] as string | null) ?? null,
    verse_words: wordsByAyah.get(r['ayah_id'] as number) ?? [],
  }));
}

/** Full concordance for a root (unbounded). Thin wrapper over the paged query. */
export async function getRootConcordance(
  db: Client,
  bw: string,
  lang = 'en',
  batchSize = 500,
): Promise<ConcordanceEntry[]> {
  return getRootConcordancePage(db, bw, { lang, batchSize });
}
