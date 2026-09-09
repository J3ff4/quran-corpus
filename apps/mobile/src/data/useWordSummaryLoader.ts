import { useCallback, useRef } from 'react';
import type { MobileDataClient } from '@quran-corpus/mobile-data';
import type { Word } from '@quran-corpus/data/mobile';
import type { ContentLanguageCode } from '@/i18n/languages';

import { getSurahGlosses, getWordSummary, type Gloss, type WordSummary } from './corpusRepository';

/**
 * Load one word's sheet payload, reusing the surah's glosses across taps.
 *
 * getGlossesWithFallback takes a SURAH id, not a word-id list, so the gloss
 * query costs the same whether one word is tapped or fifty -- 6,116 rows for
 * al-Baqarah. Caching it per surah+language is what keeps the second tap free.
 *
 * Shared because the reader, the word-by-word screen and the mushaf tab all
 * open the same sheet from the same database: a second copy of this cache is a second place
 * for the invalidation key to drift.
 */
export function useWordSummaryLoader(
  client: MobileDataClient | null,
  surahId: number | null,
  contentLanguage: ContentLanguageCode,
  // The mushaf tab has no surah of its own: a page carries whatever surahs
  // print put on it, so its caller passes the tapped word's surah per call and
  // leaves this null.
): (word: Word, wordSurahId?: number) => Promise<WordSummary> {
  // The in-flight promise, not the map it resolves to. Storing the resolved
  // value left the cache empty for as long as the query took, so a second tap
  // landing while the first was still running missed, and issued its own
  // full-surah gloss query -- 6,116 rows for al-Baqarah, twice, to answer two
  // taps a moment apart (#12).
  const glossesRef = useRef<{ key: string; glosses: Promise<Map<number, Gloss>> } | null>(null);

  return useCallback(
    async (word: Word, wordSurahId?: number) => {
      const surah = wordSurahId ?? surahId;
      if (!client || !surah) throw new Error('the corpus database is not open');
      // Language is part of the key, not just the surah: switching content
      // language while a surah is open otherwise keeps serving the glosses
      // fetched for the previous one.
      const key = `${surah}:${contentLanguage}`;
      let entry = glossesRef.current;
      if (entry?.key !== key) {
        entry = { key, glosses: getSurahGlosses(client, surah, contentLanguage) };
        glossesRef.current = entry;
      }

      // Awaited off the entry this call captured, so a call still in flight is
      // unaffected by what the ref does next -- including being cleared by a
      // newer query that failed, which is the case that would otherwise need a
      // non-null assertion here to compile and would then throw at the reader.
      let glosses: Map<number, Gloss>;
      try {
        glosses = await entry.glosses;
      } catch (cause) {
        // A rejected promise is a permanent cache entry: without this every
        // later tap on the surah would replay the same failure and never
        // retry. Cleared only if nothing newer has taken its place.
        if (glossesRef.current === entry) glossesRef.current = null;
        throw cause;
      }

      return getWordSummary(client, word, glosses.get(word.id) ?? null);
    },
    [client, contentLanguage, surahId],
  );
}
