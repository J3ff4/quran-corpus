import { getRootSearchList } from '@quran-corpus/data';
import { getDatabase } from '../../lib/db';
import { DictionaryBrowser } from '../../components/dictionary/DictionaryBrowser';
import { letterCounts } from './letters';

// Static: the full root list (~1642 rows, ~100-150KB) ships once at build
// time and is cached by the service worker. All search/sort/letter filtering
// happens client-side in DictionaryBrowser — no per-request SSR, no
// searchParams, no navigation on filter.
export default async function DictionaryPage() {
  const db = await getDatabase();
  const roots = await getRootSearchList(db);
  const counts = letterCounts(roots.map((r) => r.root_arabic));

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-paper-900 dark:text-paper-100">
        Quranic Dictionary
      </h1>
      <DictionaryBrowser roots={roots} counts={counts} />
    </main>
  );
}
