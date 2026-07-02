export const dynamic = 'force-dynamic';

import { getAllRoots, getRootsByFrequency, searchRoots } from '@quran-corpus/data';
import { getDatabase } from '../../lib/db';
import { DictionaryIndex } from '../../components/dictionary/DictionaryIndex';
import { parseSort } from './sort';

interface PageProps {
  searchParams: Promise<{ q?: string; sort?: string }>;
}

export default async function DictionaryPage({ searchParams }: PageProps) {
  const { q, sort: rawSort } = await searchParams;
  const sort = parseSort(rawSort);
  const db = await getDatabase();
  const query = q?.trim();
  const roots = query
    ? await searchRoots(db, query)
    : sort === 'freq'
      ? await getRootsByFrequency(db)
      : await getAllRoots(db);
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-paper-900 dark:text-paper-100">
        Quranic Dictionary
      </h1>
      <DictionaryIndex roots={roots} sort={sort} {...(query ? { query } : {})} />
    </main>
  );
}
