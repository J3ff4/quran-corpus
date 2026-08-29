import type { MobileDataClient, SqlValue } from '@quran-corpus/mobile-data';

// Type aliases, not interfaces: only an alias picks up the implicit index
// signature that satisfies MobileRow (Record<string, SqlValue>). That is what
// lets the stores be handed back as rows without an `as unknown as` cast, so a
// renamed column in the repository breaks the build here instead of silently
// returning rows the reader cannot read.
type BookmarkRow = {
  surah_id: number;
  ayah_number: number;
  note: string | null;
  created_at: string;
};

type HistoryRow = {
  surah_id: number;
  ayah_number: number;
};

export function createMemoryUserClient(): MobileDataClient {
  const bookmarks = new Map<string, BookmarkRow>();
  let history: HistoryRow | null = null;
  const settings = new Map<string, string>();

  return {
    async execute(statement) {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      const args = typeof statement === 'string' ? [] : (statement.args ?? []);

      if (sql.startsWith('INSERT INTO bookmarks')) {
        const [surahId, ayahNumber] = args as SqlValue[];
        const key = `${surahId}:${ayahNumber}`;
        // ON CONFLICT DO NOTHING in the real statement: re-bookmarking must not
        // reset created_at, or the Recent tab reorders on a no-op tap.
        if (!bookmarks.has(key)) {
          bookmarks.set(key, {
            surah_id: Number(surahId),
            ayah_number: Number(ayahNumber),
            note: null,
            created_at: new Date().toISOString(),
          });
        }
        return { rows: [] };
      }

      if (sql.startsWith('UPDATE bookmarks SET note')) {
        const [note, surahId, ayahNumber] = args as SqlValue[];
        // UPDATE, never an insert -- the real statement cannot create a
        // bookmark, and a fake that does would hide exactly that difference.
        const row = bookmarks.get(`${surahId}:${ayahNumber}`);
        if (row) row.note = note === null || note === undefined ? null : String(note);
        return { rows: [] };
      }

      if (sql.startsWith('DELETE FROM bookmarks')) {
        const [surahId, ayahNumber] = args as SqlValue[];
        bookmarks.delete(`${surahId}:${ayahNumber}`);
        return { rows: [] };
      }

      if (sql.includes('FROM bookmarks')) {
        return {
          rows: [...bookmarks.values()].sort(
            (a, b) => a.surah_id - b.surah_id || a.ayah_number - b.ayah_number,
          ),
        };
      }

      if (sql.startsWith('INSERT INTO reading_history')) {
        const [surahId, ayahNumber] = args as SqlValue[];
        history = { surah_id: Number(surahId), ayah_number: Number(ayahNumber) };
        return { rows: [] };
      }

      if (sql.includes('FROM reading_history')) {
        return { rows: history ? [history] : [] };
      }

      if (sql.startsWith('INSERT INTO settings')) {
        const [key, value] = args as SqlValue[];
        settings.set(String(key), String(value));
        return { rows: [] };
      }

      if (sql.includes('FROM settings')) {
        const [key] = args as SqlValue[];
        const value = settings.get(String(key));
        return { rows: value == null ? [] : [{ value }] };
      }

      throw new Error(`Unhandled user repository SQL in fake client: ${sql}`);
    },
  };
}
