/**
 * Route-parameter validators.
 *
 * Every value here arrives as a string from a deep link, so it is untrusted
 * input even though the app writes its own links (CLAUDE.md §3, OWASP). They
 * live in one module because both the reader route and the word-detail route
 * need the same bounds, and a second copy is a second place for a bound to
 * drift.
 */

// Not re-implemented here. buckwalter.ts already validates the corpus charset,
// caps the length and refuses double-encoded input -- which is exactly this
// route's threat -- and CLAUDE.md §2 records what happened the last time a
// consumer kept its own copy of those validators.
export { parseRootParam, parseLemmaParam } from '@quran-corpus/data/mobile';

import { ARABIC_ALPHABET_ORDER } from '@quran-corpus/data/mobile';

/** A hijāʾī bucket off a deep link. Membership, not a charset test:
 *  `rootFirstLetter` folds أ إ آ ٱ to ا and ى to ي, so those are never buckets
 *  and a screen for one could never have rows. The list is imported rather
 *  than restated so this cannot drift from the folding that produces it. */
export function parseLetterParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  return ARABIC_ALPHABET_ORDER.includes(raw) ? raw : null;
}

/** Shared shape: a 1-based corpus coordinate with an upper bound.
 *
 *  Both guards are needed and they catch different inputs. `Number.isInteger`
 *  rejects `'2.5'` and `'abc'`; `'1e9'` is integer-valued and gets past it,
 *  and is stopped only by `max`. */
function parseCoordinate(value: string | string[] | undefined, max: number): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) return null;
  return parsed;
}

export function parseSurahId(value: string | string[] | undefined): number | null {
  return parseCoordinate(value, 114);
}

/** 286 is al-Baqarah, the longest surah. A number that is valid here but not in
 *  the surah being read resolves to no row, which every caller already handles. */
export function parseAyahNumber(value: string | string[] | undefined): number | null {
  return parseCoordinate(value, 286);
}

/** The corpus's longest ayah is 2:282 at 128 words (measured 2026-08-16 against
 *  the live DB). The bound only has to reject nonsense before it reaches a
 *  query; a word that does not exist resolves to the not-found state either way. */
export function parsePosition(value: string | string[] | undefined): number | null {
  return parseCoordinate(value, 128);
}
