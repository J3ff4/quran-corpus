import Link from 'next/link';
import type { Surah } from '@quran-corpus/data';
import { SurahCard } from '../surah-list/SurahCard';

interface FeaturedSurahsProps {
  surahs: Surah[];
  featuredIds: number[];
}

export function FeaturedSurahs({ surahs, featuredIds }: FeaturedSurahsProps) {
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
