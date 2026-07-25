'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Surah } from '@quran-corpus/data';
import { SurahCard } from '../surah-list/SurahCard';
import { DEFAULT_SURAH_IDS, getFeaturedSurahIds } from '../../lib/reading-history';

interface FeaturedSurahsProps {
  surahs: Surah[];
}

/**
 * Starts with the default surah set on the server-rendered markup and
 * reconciles from localStorage reading history after mount (same SSR-safe
 * pattern as BookmarkButton) to avoid a hydration mismatch.
 */
export function FeaturedSurahs({ surahs }: FeaturedSurahsProps) {
  const [featuredIds, setFeaturedIds] = useState(DEFAULT_SURAH_IDS);

  useEffect(() => {
    setFeaturedIds(getFeaturedSurahIds());
  }, []);

  const featured = featuredIds
    .map((id) => surahs.find((s) => s.id === id))
    .filter((s): s is Surah => s != null);

  if (featured.length === 0) return null;

  return (
    <section className="mb-10">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-paper-500 dark:text-paper-400">
        Read
      </h2>
      <ul className="space-y-2">
        {featured.map((surah) => (
          <li key={surah.id}>
            <SurahCard surah={surah} />
          </li>
        ))}
      </ul>
      <Link
        href="/surah"
        className="mt-3 inline-block text-sm text-paper-600 hover:text-paper-900 dark:text-paper-400 dark:hover:text-paper-100"
      >
        All 114 surahs →
      </Link>
    </section>
  );
}
