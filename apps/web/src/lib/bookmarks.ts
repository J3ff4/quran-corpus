import { readCookie, writeCookie } from './cookies';

/**
 * Bookmarks live in a cookie (not localStorage) so the server can render the
 * list in the initial HTML — same reason as reading-history.ts. Order is
 * recency, most-recent-first, so no timestamp needs storing.
 */
export const BOOKMARKS_COOKIE = 'bookmarks';

/** Pre-cookie storage, read once per browser and migrated (see migrateLegacyBookmarks). */
const LEGACY_STORAGE_KEY = 'bookmarks';

// Cookies go out on every request and browsers cap them around 4KB. At ~10
// bytes an entry this stays under ~2KB; the oldest bookmark falls off past it.
const MAX_BOOKMARKS = 200;

const MAX_SURAH_ID = 114;
const MAX_AYAH_NUMBER = 286; // Al-Baqarah, the longest surah.

export interface Bookmark {
  surahId: number;
  ayahNumber: number;
  view: 'reading' | 'wbw';
}

function keyOf(b: Bookmark): string {
  return `${b.surahId}-${b.ayahNumber}-${b.view}`;
}

function serialize(bookmarks: Bookmark[]): string {
  return bookmarks.map((b) => `${b.surahId}-${b.ayahNumber}-${b.view === 'wbw' ? 'w' : 'r'}`).join(',');
}

/**
 * Untrusted input: the cookie is user-writable, so anything that isn't a real
 * surah:ayah:view triple is dropped, along with duplicates (which would
 * otherwise collide on the React key).
 */
export function getBookmarksFromCookie(raw: string | undefined): Bookmark[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: Bookmark[] = [];
  for (const entry of raw.split(',')) {
    const [rawSurah, rawAyah, rawView] = entry.split('-');
    const surahId = Number(rawSurah);
    const ayahNumber = Number(rawAyah);
    if (!Number.isInteger(surahId) || surahId < 1 || surahId > MAX_SURAH_ID) continue;
    if (!Number.isInteger(ayahNumber) || ayahNumber < 1 || ayahNumber > MAX_AYAH_NUMBER) continue;
    if (rawView !== 'r' && rawView !== 'w') continue;
    const bookmark: Bookmark = { surahId, ayahNumber, view: rawView === 'w' ? 'wbw' : 'reading' };
    const key = keyOf(bookmark);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(bookmark);
    if (out.length === MAX_BOOKMARKS) break;
  }
  return out;
}

/** False when the browser rejected the write, so callers never claim an unsaved bookmark. */
function persist(bookmarks: Bookmark[]): boolean {
  return writeCookie(BOOKMARKS_COOKIE, serialize(bookmarks.slice(0, MAX_BOOKMARKS)));
}

/**
 * One-time move of pre-cookie localStorage bookmarks into the cookie, so the
 * server can see bookmarks saved before this change. Returns true only when it
 * actually migrated something (the caller then re-renders from the server).
 * The legacy key is cleared only after the cookie write is confirmed, so a
 * failed write leaves the old data intact to retry.
 * ponytail: delete this (and its call sites) once users have all been through it.
 */
export function migrateLegacyBookmarks(): boolean {
  let legacy: unknown;
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return false;
    legacy = JSON.parse(raw);
  } catch {
    return false;
  }
  if (!Array.isArray(legacy)) {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // Nothing to do — malformed value just stays put.
    }
    return false;
  }

  const migrated = legacy
    .filter(
      (b): b is Bookmark & { bookmarkedAt?: number } =>
        typeof b === 'object' &&
        b !== null &&
        typeof (b as Bookmark).surahId === 'number' &&
        typeof (b as Bookmark).ayahNumber === 'number' &&
        ((b as Bookmark).view === 'reading' || (b as Bookmark).view === 'wbw'),
    )
    .sort((a, b) => (b.bookmarkedAt ?? 0) - (a.bookmarkedAt ?? 0))
    .map(({ surahId, ayahNumber, view }) => ({ surahId, ayahNumber, view }));

  // Existing cookie wins — it is the newer store, and merging two stores is the
  // drift this migration exists to end.
  const existing = getBookmarksFromCookie(readCookie(BOOKMARKS_COOKIE));
  if (existing.length > 0 || migrated.length === 0) {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // Best effort; a leftover key is harmless once the cookie is populated.
    }
    return false;
  }

  if (!persist(migrated)) return false;
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Cookie is authoritative from here; the stale key is only ignored.
  }
  return true;
}

/**
 * Ayah numbers bookmarked in one surah for one view. Lets a server page hand
 * BookmarkButton its state so the icon isn't blank until hydration. Safe to
 * call server-side.
 */
export function bookmarkedAyahsIn(
  raw: string | undefined,
  surahId: number,
  view: Bookmark['view'],
): number[] {
  return getBookmarksFromCookie(raw)
    .filter((b) => b.surahId === surahId && b.view === view)
    .map((b) => b.ayahNumber);
}

/** Most-recently-bookmarked first. Client-side only; the server uses getBookmarksFromCookie. */
export function getBookmarks(): Bookmark[] {
  return getBookmarksFromCookie(readCookie(BOOKMARKS_COOKIE));
}

export function isBookmarked(surahId: number, ayahNumber: number, view: Bookmark['view']): boolean {
  return getBookmarks().some(
    (b) => b.surahId === surahId && b.ayahNumber === ayahNumber && b.view === view,
  );
}

/**
 * Returns the *actual* post-toggle state: true/false if the cookie write
 * succeeded, or the unchanged pre-toggle state if it failed (blocked cookies,
 * size cap) so callers never report a bookmark that wasn't saved.
 */
export function toggleBookmark(
  surahId: number,
  ayahNumber: number,
  view: Bookmark['view'],
): boolean {
  const all = getBookmarks();
  const target: Bookmark = { surahId, ayahNumber, view };
  const key = keyOf(target);
  const wasBookmarked = all.some((b) => keyOf(b) === key);
  const next = wasBookmarked
    ? all.filter((b) => keyOf(b) !== key)
    : [target, ...all].slice(0, MAX_BOOKMARKS);
  return persist(next) ? !wasBookmarked : wasBookmarked;
}
