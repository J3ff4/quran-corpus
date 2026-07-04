import Link from 'next/link';
import { getDatabase } from '../lib/db';
import { getAllSurahs } from '@quran-corpus/data';
import { SurahCard } from '../components/surah-list/SurahCard';

// DB-dependent page — opt out of static pre-rendering (matches /surah).
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Quran Corpus' };

const FEATURED_SURAH_IDS = [1, 2, 36, 67];

const TILES = [
  { href: '/dictionary', label: 'Dictionary', subtitle: 'Roots & meanings' },
  { href: '/dictionary/lemma-frequency', label: 'Lemma frequency', subtitle: 'Most common words' },
  { href: '/dictionary/verb-concordance', label: 'Verb concordance', subtitle: 'Verb forms in context' },
  { href: '/about', label: 'About & Credits', subtitle: 'Sources & licenses' },
];

export default async function HomePage() {
  const db = await getDatabase();
  const surahs = await getAllSurahs(db);
  const featured = FEATURED_SURAH_IDS.map((id) => surahs.find((s) => s.id === id)).filter(
    (s): s is NonNullable<typeof s> => s != null,
  );

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <section className="mb-10 text-center">
        <p dir="rtl" className="font-arabic text-3xl text-paper-900 dark:text-paper-100">
          بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
        </p>
        <h1 className="mt-4 text-2xl font-semibold text-paper-900 dark:text-paper-100">Quran Corpus</h1>
        <p className="mt-1 text-sm text-paper-500 dark:text-paper-400">
          Word-by-word morphology, grammar, and translations
        </p>
        <Link
          href="/search"
          className="mt-6 flex items-center gap-2 rounded-full border border-paper-200 bg-paper-100 px-4 py-3 text-left text-paper-500 transition-colors hover:bg-paper-200 dark:border-night-100 dark:bg-night-200 dark:text-paper-400 dark:hover:bg-night-100"
        >
          <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span>Search the Quran…</span>
        </Link>
      </section>

      {featured.length > 0 && (
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
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-paper-500 dark:text-paper-400">
          Explore
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {TILES.map((tile) => (
            <Link
              key={tile.href}
              href={tile.href}
              className="rounded-xl bg-paper-100 px-4 py-4 transition-colors hover:bg-paper-200 dark:bg-night-200 dark:hover:bg-night-100"
            >
              <p className="text-sm font-medium text-paper-900 dark:text-paper-100">{tile.label}</p>
              <p className="mt-0.5 text-xs text-paper-500 dark:text-paper-400">{tile.subtitle}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
