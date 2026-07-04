export const dynamic = 'force-dynamic';

import type { Root } from '@quran-corpus/data';
import {
  getAllRoots,
  getRootArabicList,
  getRootsByFrequency,
  searchRoots,
  rootFirstLetter,
} from '@quran-corpus/data';
import { getDatabase } from '../../lib/db';
import { DictionaryIndex } from '../../components/dictionary/DictionaryIndex';
import { AlphabetGrid } from '../../components/dictionary/AlphabetGrid';
import { letterCounts } from './letters';
import { parseSort } from './sort';

interface PageProps {
  searchParams: Promise<{ q?: string; sort?: string; letter?: string }>;
}

export default async function DictionaryPage({ searchParams }: PageProps) {
  const { q, sort: rawSort, letter } = await searchParams;
  const sort = parseSort(rawSort);
  const db = await getDatabase();
  const query = q?.trim();

  // Alpha/letter views need every root as the display list, so derive letter
  // counts from that same read. Freq/search views only need counts, so fetch a
  // slim root_arabic list instead of reading + sorting all rows twice.
  const needsAllRoots = !!letter || (!query && sort !== 'freq');
  let roots: Root[];
  let counts: Record<string, number>;
  if (needsAllRoots) {
    const allRoots = await getAllRoots(db);
    counts = letterCounts(allRoots.map((r) => r.root_arabic));
    roots = letter
      ? allRoots.filter((r) => rootFirstLetter(r.root_arabic) === letter)
      : allRoots;
  } else {
    const [list, arabics] = await Promise.all([
      query ? searchRoots(db, query) : getRootsByFrequency(db),
      getRootArabicList(db),
    ]);
    roots = list;
    counts = letterCounts(arabics);
  }

  const effectiveSort = letter ? 'alpha' : sort;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-paper-900 dark:text-paper-100">
        Quranic Dictionary
      </h1>
      <AlphabetGrid counts={counts} {...(letter ? { activeLetter: letter } : {})} />
      <DictionaryIndex
        roots={roots}
        sort={effectiveSort}
        {...(query && !letter ? { query } : {})}
      />
    </main>
  );
}
