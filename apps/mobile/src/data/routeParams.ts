/**
 * Route-parameter validators.
 *
 * Every value here arrives as a string from a deep link, so it is untrusted
 * input even though the app writes its own links (CLAUDE.md §3, OWASP). They
 * live in one module because both the reader route and the word-detail route
 * need the same bounds, and a second copy is a second place for a bound to
 * drift.
 *
 * Every one of them takes `string | string[] | undefined` — the exact type
 * `useLocalSearchParams` returns — so the array/undefined guard lives here once
 * instead of at each route. A validator taking a bare `string` is a trap: an
 * array param joins to `'a,b'` and a missing one stringifies to `'undefined'`,
 * both of which pass a Buckwalter charset test and reach SQLite.
 */

import {
  isLemmaBuckwalter,
  isRootBuckwalter,
  type LemmaFrequencyKind,
} from '@quran-corpus/data/mobile';

/** Shared shape: first-of-array, reject empty, then the caller's predicate. */
function parseParam(
  value: string | string[] | undefined,
  isValid: (raw: string) => boolean,
): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  return isValid(raw) ? raw : null;
}

// Charset and length caps come from packages/data, not restated here --
// CLAUDE.md §2 records what happened the last time a consumer kept its own copy.
//
// What is deliberately NOT shared is web's `parseRootParam`/`parseLemmaParam`,
// which decode before validating. expo-router already ran `decodeURIComponent`
// over every value `useLocalSearchParams` hands back (expo-router 57,
// build/hooks/useLocalSearchParams.js), so decoding again here would resolve
// `/root/qa%2541la` to `qaAla` and serve a real root under a segment the web
// product answers 404 for. This is the same split web already has internally:
// its *page* routes parse (Next hands a Server Component the raw segment) while
// its *route handlers* call `isRootBuckwalter` directly (Next decodes first).
// Expo Router routes are on the handler side of that line.

/** A `root_buckwalter` path segment, or null if it is not one. */
export function parseRootParam(value: string | string[] | undefined): string | null {
  return parseParam(value, isRootBuckwalter);
}

/** A `lemma_buckwalter` path segment, or null if it is not one. */
export function parseLemmaParam(value: string | string[] | undefined): string | null {
  return parseParam(value, isLemmaBuckwalter);
}

/** Which frequency ranking the lemma screen's Previous/Next walks, off the
 *  `?from` query param.
 *
 *  Not built on `parseParam`: that takes the first element of an array, which
 *  is the right rule for a path segment and the wrong one here -- two `?from`
 *  values in one link is a malformed link, not a preference. Anything that is
 *  not one of the two literals returns null, which the screen renders as both
 *  arrows dimmed. */
export function parseFrequencySourceParam(
  value: string | string[] | undefined,
): LemmaFrequencyKind | null {
  return value === 'lemmas' || value === 'verbs' ? value : null;
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
