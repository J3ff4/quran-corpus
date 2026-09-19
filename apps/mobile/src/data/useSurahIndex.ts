import { useCallback, useEffect, useMemo, useState } from 'react';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';
import type { QueryLanguageCode } from '@/i18n/languages';

import { getSurahList, type SurahListItem } from './corpusRepository';
import { openCorpusDb } from './openCorpusDb';

export interface SurahIndex {
  /** The rows, or null until the read lands. Null is "not known", never "no
   *  surahs" -- every caller renders something else in the meantime. */
  surahs: SurahListItem[] | null;
  /** That same read, projected. Null for an id the read did not cover, and
   *  null for every id while it has not landed: the jump sheet disables its
   *  ayah field rather than validating against a guess, so a failed read costs
   *  the reader the ayah, not the jump. */
  ayahCountOf: (surahId: number) => number | null;
}

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
export function useSurahIndex(nameLang?: QueryLanguageCode): SurahIndex {
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

  const counts = useMemo(
    () => (surahs === null ? null : new Map(surahs.map((surah) => [surah.id, surah.ayahCount]))),
    [surahs],
  );
  // ponytail: one read per mounting screen, not a module-level cache. 114 rows,
  // off the first-paint path, and a cache would need its own invalidation.
  const ayahCountOf = useCallback((surahId: number) => counts?.get(surahId) ?? null, [counts]);

  return useMemo(() => ({ surahs, ayahCountOf }), [surahs, ayahCountOf]);
}
