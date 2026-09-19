import {
  normalizeArabic,
  surahNameExactMatch,
  surahNameKeys,
  surahNamePrefixMatch,
  surahTranslationKeys,
} from '@quran-corpus/data/mobile';

import type { SurahListItem } from '@/data/corpusRepository';

/**
 * Find a surah by name rather than by number.
 *
 * Pure, and deliberately not a query: the whole index is 114 rows the screens
 * already hold, so this filters what is in hand instead of asking the DB to
 * match user text (§3 OWASP -- untrusted input never reaches SQL through here).
 *
 * The folds are `packages/data`'s own -- the ones `search.ts` resolves a typed
 * surah name with. Not re-implemented here: the picker takes the same query
 * text against the same 114 names, and a second fold would be a second answer
 * to "does `bakara` name al-Baqarah", with only one of the two carrying the
 * Uzbek `o` readings (`Rahmon`/`Rahman`), the sun-letter articles and the
 * rule that keeps the English meanings OUT of the Arabic fold -- run `moon`
 * through the transliteration rules and it lands on surah 76's `The Man`.
 *
 * What is local is the shape of the answer: search resolves ONE surah or none,
 * refusing an ambiguous prefix on purpose. A picker wants every candidate,
 * ranked, because the reader picks from the list.
 *
 * Matches the names the app is SHOWING. Under an Uzbek UI `nameTranslit` is
 * already `Fotiha` and `nameTranslation` the Uzbek meaning, so the arms below
 * follow the locale for free.
 */

/** The picker's extra tolerance on top of the shared Arabic fold.
 *
 *  NFC first, because only a composed string can be compared to another: the
 *  corpus stores `الإخلاص` composed and a keyboard may hand over the decomposed
 *  form, and that mismatch is exactly what killed 49 form chips once. Then the
 *  definite article and the final ta marbuta, which a typist leaves off or
 *  writes as ha -- search can skip both because it demands an exact match on a
 *  name the reader spelled out; a filter is typed a letter at a time. */
export function foldArabicName(raw: string): string {
  const folded = normalizeArabic(raw.normalize('NFC')).replace(/\s/g, '').replace(/ة/g, 'ه');
  return folded.startsWith('ال') && folded.length > 3 ? folded.slice(2) : folded;
}

/** Below this, a meaning match is noise: `man`, `day` prefix a dozen surahs
 *  and would bury the name the user actually typed. The same 3-char floor the
 *  dictionary's meaning arm settled on (#31). */
const MEANING_MIN = 3;

/** Fragments the floor cannot catch, because they clear it and still say
 *  nothing: `the` is three characters and opens the English meaning of some
 *  eighty surahs -- and it is a state every reader passes through on the way
 *  to typing `The Cow`. `surahTranslationKeys` already strips it as an
 *  article; this is the same word arriving alone. */
const MEANING_STOPWORDS = new Set(['the']);

/** Lower sorts first. A name hit always outranks a meaning hit -- the name is
 *  what was asked for, the meaning is a convenience. */
const RANK = { number: 0, exact: 1, prefix: 2, arabic: 3, meaning: 4 } as const;

interface QueryKeys {
  latin: string[];
  english: string[];
  arabic: string;
  digits: number | null;
  /** The raw folded English, for the substring arm. The key sets above only
   *  answer whole-name and leading-fragment questions. */
  englishFragment: string;
}

function rankOf(item: SurahListItem, query: QueryKeys): number {
  if (query.digits !== null && item.id === query.digits) return RANK.number;

  if (query.latin.length > 0) {
    const translit = surahNameKeys(item.nameTranslit);
    const english = surahTranslationKeys(item.nameTranslation);
    // Two columns, two folds, never crossed -- surahName.ts's rule, and the
    // reason `moon` does not answer to `The Man`.
    if (
      surahNameExactMatch(query.latin, translit) ||
      surahNameExactMatch(query.english, english)
    ) {
      return RANK.exact;
    }
    // Transliterations only, as in search: a prefix of an English meaning is
    // a coincidence far more often than an intention.
    if (surahNamePrefixMatch(query.latin, translit)) return RANK.prefix;
  }

  if (query.arabic.length > 0 && foldArabicName(item.nameArabic).includes(query.arabic)) {
    return RANK.arabic;
  }

  if (query.englishFragment.length >= MEANING_MIN && !MEANING_STOPWORDS.has(query.englishFragment)) {
    const meaning = surahTranslationKeys(item.nameTranslation)[0] ?? '';
    if (meaning.includes(query.englishFragment)) return RANK.meaning;
  }

  return Number.POSITIVE_INFINITY;
}

/**
 * The surahs matching `query`, best first.
 *
 * An empty query returns `items` untouched -- the picker opens showing all 114
 * in mushaf order, and typing narrows from there.
 */
export function matchSurahs(items: readonly SurahListItem[], query: string): SurahListItem[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [...items];

  const keys: QueryKeys = {
    latin: surahNameKeys(trimmed),
    english: surahTranslationKeys(trimmed),
    arabic: foldArabicName(trimmed),
    // A bare number still works inside the picker: someone who knows it should
    // not have to close the sheet to use it.
    digits: /^\d{1,3}$/.test(trimmed) ? Number(trimmed) : null,
    englishFragment: surahTranslationKeys(trimmed)[0] ?? '',
  };

  return items
    .map((item) => ({ item, rank: rankOf(item, keys) }))
    .filter((scored) => Number.isFinite(scored.rank))
    // Stable within a rank: mushaf order is the order the list is already in,
    // and a name match should not reshuffle it.
    .sort((a, b) => a.rank - b.rank || a.item.id - b.item.id)
    .map((scored) => scored.item);
}
