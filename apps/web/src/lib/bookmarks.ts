const STORAGE_KEY = 'bookmarks';

export interface Bookmark {
  surahId: number;
  ayahNumber: number;
  view: 'reading' | 'wbw';
  bookmarkedAt: number;
}

function isBookmark(b: unknown): b is Bookmark {
  if (typeof b !== 'object' || b === null) return false;
  const r = b as Record<string, unknown>;
  return (
    typeof r.surahId === 'number' &&
    typeof r.ayahNumber === 'number' &&
    (r.view === 'reading' || r.view === 'wbw') &&
    typeof r.bookmarkedAt === 'number'
  );
}

function readAll(): Bookmark[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isBookmark) : [];
  } catch {
    return [];
  }
}

function writeAll(bookmarks: Bookmark[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
    return true;
  } catch {
    // Storage unavailable (private mode/quota) — caller reports the toggle
    // as a no-op instead of claiming a state that was never persisted.
    return false;
  }
}

export function getBookmarks(): Bookmark[] {
  return readAll().sort((a, b) => b.bookmarkedAt - a.bookmarkedAt);
}

export function isBookmarked(
  surahId: number,
  ayahNumber: number,
  view: Bookmark['view'],
): boolean {
  return readAll().some(
    (b) => b.surahId === surahId && b.ayahNumber === ayahNumber && b.view === view,
  );
}

/**
 * Returns the *actual* post-toggle state: true/false if the write to
 * localStorage succeeded, or the unchanged pre-toggle state if it failed
 * (private mode/quota) so callers never report a bookmark that wasn't saved.
 */
export function toggleBookmark(
  surahId: number,
  ayahNumber: number,
  view: Bookmark['view'],
): boolean {
  const all = readAll();
  const idx = all.findIndex(
    (b) => b.surahId === surahId && b.ayahNumber === ayahNumber && b.view === view,
  );
  const wasBookmarked = idx !== -1;
  if (wasBookmarked) {
    all.splice(idx, 1);
  } else {
    all.push({ surahId, ayahNumber, view, bookmarkedAt: Date.now() });
  }
  return writeAll(all) ? !wasBookmarked : wasBookmarked;
}
