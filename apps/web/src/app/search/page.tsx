export const dynamic = 'force-dynamic';

import { search, EMPTY_SEARCH_RESULT } from '@quran-corpus/data';
import { getDatabase } from '../../lib/db';
import { SearchResults } from '../../components/search/SearchResults';
import { parseSearchQuery } from './params';

interface PageProps {
  searchParams: Promise<{ q?: string | string[] }>;
}

export default async function SearchPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const query = parseSearchQuery(q);
  const db = await getDatabase();
  const result = query ? await search(db, query) : EMPTY_SEARCH_RESULT;
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-paper-900 dark:text-paper-100">Search</h1>
      <form role="search" action="/search" method="get" className="mb-6 flex gap-2">
        <input
          type="search"
          name="q"
          aria-label="Search the Quran"
          defaultValue={query ?? ''}
          placeholder="Verse (2:255), Arabic, meaning, or word…"
          className="flex-1 rounded-lg border border-paper-300 bg-paper-50 px-4 py-2 text-paper-900 placeholder:text-paper-400 focus:border-paper-500 focus:outline-none dark:border-night-100 dark:bg-night-50 dark:text-paper-100"
        />
        <button
          type="submit"
          className="rounded-lg bg-paper-800 px-4 py-2 text-sm font-medium text-paper-50 dark:bg-night-100 dark:text-paper-100"
        >
          Search
        </button>
      </form>
      {query && <SearchResults result={result} />}
    </main>
  );
}
