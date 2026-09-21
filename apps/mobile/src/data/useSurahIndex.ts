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
/** Two, not one: a failed read used to leave this hook at null for the life of
 *  the screen, and every caller hides the "find a surah by name" row while it
 *  is null -- so one transient failure removed a whole entry point for the
 *  session, with a logcat line as its only trace (#95). `openCorpusDb` does not
 *  cache its own failures, so a second attempt is a real second chance rather
 *  than a replay of the first. Two is the whole budget: a read that fails twice
 *  is a corpus the reader screen is already complaining about. */
const READ_ATTEMPTS = 2;

/** Long enough that a retry is not simply the same failing call again, short
 *  enough that the row appears before a reader reaches for it. */
const RETRY_DELAY_MS = 400;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function useSurahIndex(nameLang?: QueryLanguageCode): SurahIndex {
  const [surahs, setSurahs] = useState<SurahListItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Back to "not known" before the read, not after it. These rows are named
    // in the PREVIOUS language while a new one is in flight, and if that read
    // throws, leaving them standing shows the old script with nothing to say
    // the switch did not take.
    setSurahs(null);

    async function attempt() {
      const corpusDb = await openCorpusDb();
      const rows = await getSurahList(createExpoSqliteClient(corpusDb as ExpoSqliteLike), nameLang);
      if (!cancelled) setSurahs(rows);
    }

    async function load() {
      for (let tries = 0; tries < READ_ATTEMPTS; tries += 1) {
        try {
          await attempt();
          return;
        } catch (cause) {
          // Logged for logcat, never shown: the screen this hangs off has its
          // own content and its own error state, and neither is about this.
          console.error(`[surah index] read failed (attempt ${tries + 1})`, cause);
          if (cancelled) return;
          if (tries + 1 < READ_ATTEMPTS) await delay(RETRY_DELAY_MS);
          if (cancelled) return;
        }
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
