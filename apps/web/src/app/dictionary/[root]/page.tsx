export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import {
  getRootEntry,
  getRootConcordancePage,
  countRootConcordance,
  getRootNeighbors,
  isRootBuckwalter,
  CONCORDANCE_PAGE_SIZE,
} from '@quran-corpus/data';
import { getDatabase } from '../../../lib/db';
import { RootEntry } from '../../../components/dictionary/RootEntry';

const PAGE = CONCORDANCE_PAGE_SIZE;

interface PageProps {
  params: Promise<{ root: string }>;
}

export default async function RootPage({ params }: PageProps) {
  const { root: bw } = await params;
  // Same rule the concordance API enforces, for the same reason the lemma page
  // states: SSR must not accept an identifier the client-side Load-more then
  // 400s on. Harmless on today's data (every root token is within the charset),
  // but the asymmetry is exactly what the shared validator exists to prevent.
  if (!isRootBuckwalter(bw)) notFound();
  const db = await getDatabase();
  const entry = await getRootEntry(db, bw);
  if (!entry) notFound();
  const [initialConcordance, total, neighbors] = await Promise.all([
    getRootConcordancePage(db, bw, { limit: PAGE, offset: 0 }),
    countRootConcordance(db, bw),
    getRootNeighbors(db, bw),
  ]);
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <RootEntry
        key={bw}
        entry={entry}
        initialConcordance={initialConcordance}
        total={total}
        prevBw={neighbors.prev}
        nextBw={neighbors.next}
      />
    </main>
  );
}
