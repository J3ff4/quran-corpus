import { useCallback, useEffect, useMemo, useState } from 'react';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';
import type { QueryLanguageCode } from '@/i18n/languages';

import { getSurahList, type SurahListItem } from './corpusRepository';
import { openCorpusDb } from './openCorpusDb';

/**
 * All 114 surah rows, named in `nameLang`, read once per mounting screen.
 *
 * Null until the read lands, and null for good if it fails -- "not known",
 * never "no surahs". Every caller renders something else in the meantime.
 *
 * `nameLang` is a QueryLanguageCode because the script belongs in it: the
 * `surah_names` table carries 114 `uz-Cyrl` rows, and a UiLocaleCode can never
 * name them however the toggle is set (#85). Omitted, the surahs row's own
 * English comes back, which is what the ayah-count caller below wants.
 */
export function useSurahIndex(nameLang?: QueryLanguageCode): SurahListItem[] | null {
  const [surahs, setSurahs] = useState<SurahListItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const corpusDb = await openCorpusDb();
        const rows = await getSurahList(
          createExpoSqliteClient(corpusDb as ExpoSqliteLike),
          nameLang,
        );
        if (!cancelled) setSurahs(rows);
      } catch (cause) {
        // Logged for logcat, never shown: the screen this hangs off has its
        // own content and its own error state, and neither is about this.
        console.error('[surah index] read failed', cause);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [nameLang]);

  return surahs;
}

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
  // The same read, not a second one: the counts are a projection of the index
  // rows, and two queries for one table is the duplication §3 forbids.
  const surahs = useSurahIndex();
  const counts = useMemo(
    () => (surahs === null ? null : new Map(surahs.map((surah) => [surah.id, surah.ayahCount]))),
    [surahs],
  );

  // ponytail: one read per mounting screen, not a module-level cache. 114 rows,
  // off the first-paint path, and a cache would need its own invalidation.
  return useCallback((surahId: number) => counts?.get(surahId) ?? null, [counts]);
}
