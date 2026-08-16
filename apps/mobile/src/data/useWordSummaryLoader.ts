import { useCallback, useRef } from 'react';
import type { MobileDataClient } from '@quran-corpus/mobile-data';
import type { Word } from '@quran-corpus/data/mobile';
import type { ContentLanguageCode } from '@/i18n/languages';

import { getSurahGlosses, getWordSummary, type WordSummary } from './corpusRepository';

/**
 * Load one word's sheet payload, reusing the surah's glosses across taps.
 *
 * getGlossesWithFallback takes a SURAH id, not a word-id list, so the gloss
 * query costs the same whether one word is tapped or fifty -- 6,116 rows for
 * al-Baqarah. Caching it per surah+language is what keeps the second tap free.
 *
 * Shared because the reader and the word-by-word screen both open the same
 * sheet from the same database: a second copy of this cache is a second place
 * for the invalidation key to drift.
 */
export function useWordSummaryLoader(
  client: MobileDataClient | null,
  surahId: number | null,
  contentLanguage: ContentLanguageCode,
): (word: Word) => Promise<WordSummary> {
  const glossesRef = useRef<{ key: string; glosses: Map<number, string> } | null>(null);

  return useCallback(
    async (word: Word) => {
      if (!client || !surahId) throw new Error('the corpus database is not open');
      // Language is part of the key, not just the surah: switching content
      // language while a surah is open otherwise keeps serving the glosses
      // fetched for the previous one.
      const key = `${surahId}:${contentLanguage}`;
      if (glossesRef.current?.key !== key) {
        glossesRef.current = {
          key,
          glosses: await getSurahGlosses(client, surahId, contentLanguage),
        };
      }
      return getWordSummary(client, word, glossesRef.current.glosses.get(word.id) ?? null);
    },
    [client, contentLanguage, surahId],
  );
}
