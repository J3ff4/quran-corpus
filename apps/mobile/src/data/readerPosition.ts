/**
 * Where the reader is, shared between the three ways of reading one surah.
 *
 * Mushaf, translation and word-by-word are one reading in the user's head and
 * three renderings in ours -- two behind the same route, one behind another.
 * D46 says the ayah carries between all three, in both directions.
 *
 * ponytail: a module singleton, not a context and not the user database. A
 * context would re-render every consumer on a value the reader's scroll handler
 * writes on every frame; the user database is asynchronous, debounced, and is
 * device state a phone keeps across app updates -- far too much machinery for
 * "which ayah is on screen right now". One reader is open at a time, so one
 * slot is enough.
 *
 * Deliberately NOT the saved reading position in SQLite: that one is a durable
 * bookmark written on a debounce, so reading it back answers with wherever the
 * debounce last landed rather than where the reader actually is.
 */
let current: { surahId: number; ayahNumber: number } | null = null;

export function setReaderPosition(surahId: number, ayahNumber: number): void {
  current = { surahId, ayahNumber };
}

/** The position within `surahId`, or null when the store is on another surah.
 *  Scoped by surah on purpose: an ayah number only means anything inside one,
 *  and 50 carried across would open Aal-Imran at 50 because al-Baqarah was
 *  left there. */
export function getReaderPosition(surahId: number): number | null {
  return current?.surahId === surahId ? current.ayahNumber : null;
}

/** Tests only. The app has no reason to forget where the reader is. */
export function clearReaderPosition(): void {
  current = null;
}
