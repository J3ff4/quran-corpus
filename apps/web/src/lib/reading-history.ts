const STORAGE_KEY = 'reading-history';
const MAX_ENTRIES = 4;

/** Fatiha, Baqara, Kahf, Mulk — shown until the user has built up real history. */
export const DEFAULT_SURAH_IDS = [1, 2, 18, 67];

function readAll(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is number => typeof id === 'number') : [];
  } catch {
    return [];
  }
}

function writeAll(ids: number[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage unavailable (private mode/quota) — visit just won't be remembered.
  }
}

/** Moves surahId to the front of the recency list, capped to MAX_ENTRIES. */
export function recordSurahVisit(surahId: number): void {
  const ids = readAll().filter((id) => id !== surahId);
  ids.unshift(surahId);
  writeAll(ids.slice(0, MAX_ENTRIES));
}

/** Most-recent-first surah IDs, backfilled with defaults (no duplicates) up to MAX_ENTRIES. */
export function getFeaturedSurahIds(): number[] {
  const recent = readAll();
  const fill = DEFAULT_SURAH_IDS.filter((id) => !recent.includes(id));
  return [...recent, ...fill].slice(0, MAX_ENTRIES);
}
