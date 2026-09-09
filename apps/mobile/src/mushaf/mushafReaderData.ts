import { useEffect, useMemo, useState } from 'react';
import type { Ayah, PageEntry } from '@quran-corpus/data/mobile';
import type { MobileDataClient } from '@quran-corpus/mobile-data';

import { getAyahsOfSurah, getPageIndex, getSurahList } from '@/data/corpusRepository';
import { ayahKey } from './highlights';

/** What the pager needs to know about a page it is not rendering: which surah
 *  and ayah it opens with (the header's title and the reading position, ruling
 *  15) and its juz (the footer). 604 rows, one query, once per process. */
export interface MushafIndex {
  pages: Map<number, PageEntry>;
  /** Transliterated surah names, by surah id. Every surah, not the pages'
   *  opening ones: a band can name a surah that starts halfway down a page. */
  surahNames: Map<number, string>;
  /** Ayah count per surah. The mushaf tab's recitation needs it and cannot ask
   *  the route for it: what is playing is whatever surah the tapped word
   *  belonged to. Same query as the names, so it costs nothing. */
  ayahCounts: Map<number, number>;
  ready: boolean;
}

const EMPTY_INDEX: MushafIndex = {
  pages: new Map(),
  surahNames: new Map(),
  ayahCounts: new Map(),
  ready: false,
};

// Process-wide, and deliberately not per reader: the index is 604 + 114 rows of
// data that cannot change while the app runs, and the reader mounts a fresh
// tree on every surah page-turn and every mode switch.
let indexPromise: Promise<Omit<MushafIndex, 'ready'>> | null = null;
const ayahCache = new Map<number, Promise<Ayah[]>>();

/** Tests only. Both caches are module state, so one suite's client would
 *  otherwise answer the next suite's queries. */
export function resetMushafReaderCachesForTest(): void {
  indexPromise = null;
  ayahCache.clear();
}

async function loadIndex(client: MobileDataClient): Promise<Omit<MushafIndex, 'ready'>> {
  const [pages, surahs] = await Promise.all([getPageIndex(client), getSurahList(client)]);
  return {
    pages: new Map(pages.map((entry) => [entry.page, entry])),
    surahNames: new Map(surahs.map((surah) => [surah.id, surah.nameTranslit])),
    ayahCounts: new Map(surahs.map((surah) => [surah.id, surah.ayahCount])),
  };
}

export function useMushafIndex(client: MobileDataClient | null): MushafIndex {
  const [index, setIndex] = useState<MushafIndex>(EMPTY_INDEX);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    // Cached as the promise rather than the result: two layers mount together
    // during a mode switch, and both ask on the same tick.
    indexPromise ??= loadIndex(client);
    const pending = indexPromise;
    pending
      .then((loaded) => {
        if (!cancelled) setIndex({ ...loaded, ready: true });
      })
      .catch((cause: unknown) => {
        // Cleared so the next mount retries rather than serving a rejected
        // promise for the life of the process. The page still renders: the
        // footer loses its juz and the header falls back to the route's surah.
        if (indexPromise === pending) indexPromise = null;
        console.error('[mushaf] page index failed', { cause });
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  return index;
}

/**
 * Every ayah of the surahs currently on screen, keyed `surah:ayah`.
 *
 * The rows, not just the text: the page needs `text_uthmani` for TalkBack and
 * the bismillah (ruling 12), and `id` to turn a tapped glyph into a `Word`.
 * Per surah rather than per page because that is the only query shape that
 * exists, and a surah is fetched once however many of its pages are visited.
 */
export function useMushafAyahs(
  client: MobileDataClient | null,
  surahIds: readonly number[],
): Map<string, Ayah> {
  const [loaded, setLoaded] = useState<Map<number, Ayah[]>>(new Map());
  // The ids as one string, so a caller rebuilding the array every render does
  // not re-run the effect on every render.
  const key = [...new Set(surahIds)].sort((a, b) => a - b).join(',');

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    const ids = key === '' ? [] : key.split(',').map(Number);

    for (const surahId of ids) {
      let pending = ayahCache.get(surahId);
      if (!pending) {
        pending = getAyahsOfSurah(client, surahId);
        ayahCache.set(surahId, pending);
      }
      const captured = pending;
      captured
        .then((ayahs) => {
          if (cancelled) return;
          setLoaded((current) => {
            if (current.get(surahId) === ayahs) return current;
            return new Map(current).set(surahId, ayahs);
          });
        })
        .catch((cause: unknown) => {
          if (ayahCache.get(surahId) === captured) ayahCache.delete(surahId);
          console.error('[mushaf] ayah texts failed', { surahId, cause });
        });
    }

    return () => {
      cancelled = true;
    };
  }, [client, key]);

  return useMemo(() => {
    const byKey = new Map<string, Ayah>();
    for (const ayahs of loaded.values()) {
      for (const ayah of ayahs) byKey.set(ayahKey(ayah.surah_id, ayah.ayah_number), ayah);
    }
    return byKey;
  }, [loaded]);
}
