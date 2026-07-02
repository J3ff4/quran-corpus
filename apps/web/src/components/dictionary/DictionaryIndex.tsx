import Link from 'next/link';
import type { Root } from '@quran-corpus/data';
import { DictionarySearch } from './DictionarySearch';
import { RootListRow } from './RootListRow';

interface DictionaryIndexProps {
  roots: Root[];
  sort: 'alpha' | 'freq';
  query?: string;
}

const toggleBase = 'rounded-full px-4 py-1 text-sm transition-colors';
const toggleActive = 'bg-paper-800 text-paper-50 dark:bg-night-100 dark:text-paper-100';
const toggleIdle = 'text-paper-600 hover:bg-paper-200 dark:text-paper-400 dark:hover:bg-night-100';
const toolLink =
  'rounded-lg border border-paper-300 px-3 py-1.5 text-sm text-paper-700 transition-colors hover:bg-paper-200 dark:border-night-100 dark:text-paper-300 dark:hover:bg-night-100';

/**
 * Dictionary browse surface: search, alpha/freq toggle, tool links, and the
 * root rows. Purely presentational — the route supplies the resolved roots.
 */
export function DictionaryIndex({ roots, sort, query }: DictionaryIndexProps) {
  return (
    <div>
      <DictionarySearch defaultValue={query} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          href="/dictionary?sort=alpha"
          className={`${toggleBase} ${sort === 'alpha' ? toggleActive : toggleIdle}`}
        >
          Alphabetical
        </Link>
        <Link
          href="/dictionary?sort=freq"
          className={`${toggleBase} ${sort === 'freq' ? toggleActive : toggleIdle}`}
        >
          By frequency
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <Link href="/dictionary/lemma-frequency" className={toolLink}>
          Lemma Frequency
        </Link>
        <Link href="/dictionary/verb-concordance" className={toolLink}>
          Verb Concordance
        </Link>
      </div>

      {query && (
        <h2 className="mb-3 text-sm text-paper-600 dark:text-paper-400">
          Results for “{query}”
        </h2>
      )}

      {roots.length === 0 ? (
        <p className="px-4 py-8 text-center text-paper-500">No roots found.</p>
      ) : (
        <ul className="divide-y divide-paper-200 dark:divide-night-100">
          {roots.map((r) => (
            <li key={r.id}>
              <RootListRow root={r} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
