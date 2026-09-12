import { useCallback, useEffect, useState } from 'react';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';

import { getSurahList } from './corpusRepository';
import { openCorpusDb } from './openCorpusDb';

/**
 * id -> ayahCount for all 114, read once per screen.
 *
 * A hook rather than a prop threaded from each screen: the reader and the
 * morphology grid both need it, neither loads the surah list today, and a
 * second copy of this query is exactly the duplication §3 forbids.
 *
 * The lookup answers null until the read lands -- and keeps answering null if
 * it fails. Null is "not known", never "no ayahs": the jump sheet disables its
 * ayah field on null rather than validating against a guess, so a failed read
 * costs the reader the ayah, not the jump.
 */
export function useSurahAyahCounts(): (surahId: number) => number | null {
  const [counts, setCounts] = useState<Map<number, number> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const corpusDb = await openCorpusDb();
        const surahs = await getSurahList(createExpoSqliteClient(corpusDb as ExpoSqliteLike));
        if (!cancelled) setCounts(new Map(surahs.map((surah) => [surah.id, surah.ayahCount])));
      } catch (cause) {
        // Logged for logcat, never shown: the screen this hangs off has its
        // own content and its own error state, and neither is about this.
        console.error('[jump] surah ayah counts failed', cause);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ponytail: one read per mounting screen, not a module-level cache. 114 rows,
  // off the first-paint path, and a cache would need its own invalidation.
  return useCallback((surahId: number) => counts?.get(surahId) ?? null, [counts]);
}
