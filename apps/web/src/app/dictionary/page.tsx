import { getRootSearchList } from '@quran-corpus/data';
import { getDatabase } from '../../lib/db';
import { DictionaryBrowser } from '../../components/dictionary/DictionaryBrowser';
import { letterCounts } from './letters';

// The full root list (1642 rows) renders once per request; all
// search/sort/letter filtering then happens client-side in DictionaryBrowser.
// The service worker (NetworkFirst) still caches the response.
//
// ~450KB uncompressed since #31, up from ~100-150KB: the meaning arm searches
// `root_definitions` now, and the 386KB of dictionary prose that carries has
// to be on the client for a filter that runs without a round-trip. If that
// weight ever needs cutting, the lever is moving the meaning arm server-side
// (debounced) rather than trimming the blob, which only loses matches.
// Dynamic so the per-request CSP nonce reaches inline scripts (see app/page.tsx
// and src/test/route-render-mode.test.ts).
export const dynamic = 'force-dynamic';

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
