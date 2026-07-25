import type { Surah } from '@quran-corpus/data';
import type { Bookmark } from '../../lib/bookmarks';
import type { BookmarkRow } from './BookmarksView';

/**
 * Joins bookmarks to surah names, dropping any ayah the surah doesn't have.
 * The cookie is user-writable and only globally range-checked (1..286), so a
 * plausible-but-nonexistent pair like Al-Fatihah 8 reaches here; linking it
 * would land the reader on a scroll target it rejects, silently opening the
 * surah at the top instead.
 */
export function toBookmarkRows(
  bookmarks: Bookmark[],
  surahs: Pick<Surah, 'id' | 'name_translit' | 'ayah_count'>[],
): BookmarkRow[] {
  const byId = new Map(surahs.map((s) => [s.id, s]));
  const rows: BookmarkRow[] = [];
  for (const b of bookmarks) {
    const surah = byId.get(b.surahId);
    if (!surah || b.ayahNumber > surah.ayah_count) continue;
    rows.push({ ...b, surahName: surah.name_translit });
  }
  return rows;
}
