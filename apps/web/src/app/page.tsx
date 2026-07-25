import Link from 'next/link';
import { cookies } from 'next/headers';
import { getDatabase } from '../lib/db';
import { getAllSurahs } from '@quran-corpus/data';
import { VersePicker } from '../components/wbw/VersePicker';
import { toPickerSurah, type PickerSurah } from '../components/wbw/types';
import { SearchTrigger } from '../components/search/SearchTrigger';
import { FeaturedSurahs } from '../components/home/FeaturedSurahs';
import { FEATURED_SURAHS_COOKIE, getFeaturedIdsFromCookie } from '../lib/reading-history';

export const metadata = { title: 'Quran Corpus' };

// Dynamic render so middleware's per-request CSP nonce lands on the inline
// bootstrap/RSC scripts; a static prerender bakes them nonce-less and the
// strict prod script-src blocks them, hydrating to blank. Enforced for every
// paramless page by src/test/route-render-mode.test.ts.
export const dynamic = 'force-dynamic';

const TILES = [
  { href: '/dictionary', label: 'Dictionary', subtitle: 'Roots & meanings' },
  { href: '/dictionary/lemma-frequency', label: 'Lemma frequency', subtitle: 'Most common words' },
  { href: '/dictionary/verb-concordance', label: 'Verb concordance', subtitle: 'Verb forms in context' },
  { href: '/about', label: 'About & Credits', subtitle: 'Sources & licenses' },
];

export default async function HomePage() {
  const db = await getDatabase();
  const surahs = await getAllSurahs(db);
  const pickerSurahs: PickerSurah[] = surahs.map(toPickerSurah);

  const cookieStore = await cookies();
  const featuredIds = getFeaturedIdsFromCookie(cookieStore.get(FEATURED_SURAHS_COOKIE)?.value);

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
        <SearchTrigger />
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-paper-500 dark:text-paper-400">
          Go to verse
        </h2>
        <VersePicker surahs={pickerSurahs} />
      </section>

      <FeaturedSurahs surahs={surahs} featuredIds={featuredIds} />

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
