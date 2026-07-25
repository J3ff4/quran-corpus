import { readCookie, writeCookie } from './cookies';

const MAX_ENTRIES = 4;
const MAX_SURAH_ID = 114;

/**
 * Reading history lives in a cookie (not localStorage) so the server can render
 * the right list in the initial HTML — no client swap, no flash of defaults.
 */
export const FEATURED_SURAHS_COOKIE = 'featured-surahs';

/** Fatiha, Baqara, Kahf, Mulk — shown until the user has built up real history. */
export const DEFAULT_SURAH_IDS = [1, 2, 18, 67];

/** Untrusted input: the cookie is user-writable, so drop anything that isn't a real surah id. */
function parseCookie(raw: string | undefined): number[] {
  if (!raw) return [];
  const ids = raw
    .split(',')
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= MAX_SURAH_ID);
  return [...new Set(ids)].slice(0, MAX_ENTRIES);
}

/** Moves surahId to the front of the recency list, capped to MAX_ENTRIES. */
export function recordSurahVisit(surahId: number): void {
  const current = parseCookie(readCookie(FEATURED_SURAHS_COOKIE));
  const ids = [surahId, ...current.filter((id) => id !== surahId)].slice(0, MAX_ENTRIES);
  // A rejected write (blocked cookies) just means the visit isn't remembered.
  writeCookie(FEATURED_SURAHS_COOKIE, ids.join(','));
}

/** Most-recent-first surah IDs, backfilled with defaults (no duplicates). Safe to call server-side. */
export function getFeaturedIdsFromCookie(raw: string | undefined): number[] {
  const recent = parseCookie(raw);
  const fill = DEFAULT_SURAH_IDS.filter((id) => !recent.includes(id));
  return [...recent, ...fill].slice(0, MAX_ENTRIES);
}
