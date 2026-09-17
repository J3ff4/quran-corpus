import type { Surah, SurahName } from '@quran-corpus/data';

/**
 * A surah's name in the reader's locale.
 *
 * `getSurahNames` already covers all 114 with a per-surah fallback, so the
 * `??` here only guards a caller that hands over a partial map -- it is not
 * the localization fallback, which lives in the query.
 */
export function nameFor(
  names: Map<number, SurahName>,
  surah: Pick<Surah, 'id' | 'name_translit' | 'name_translation'>,
): SurahName {
  return names.get(surah.id) ?? { name: surah.name_translit, meaning: surah.name_translation };
}
