export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import {
  getLemmaEntry,
  getLemmaConcordancePage,
  isLemmaBuckwalter,
  CONCORDANCE_PAGE_SIZE,
} from '@quran-corpus/data';
import { getDatabase } from '../../../../lib/db';
import { LemmaEntry } from '../../../../components/dictionary/LemmaEntry';

interface PageProps {
  params: Promise<{ lemma: string }>;
}

export default async function LemmaPage({ params }: PageProps) {
  const { lemma: bw } = await params;
  // Validate before touching the DB, using the same rule the concordance API
  // enforces -- otherwise SSR would accept an identifier the client-side
  // Load-more then 400s on (the accepts/rejects asymmetry). The App Router has
  // already percent-decoded the segment; decoding it again here would alias
  // `qa%2541la` onto `qaAla`, and `%` is outside the charset this rejects.
  if (!isLemmaBuckwalter(bw)) notFound();
  const db = await getDatabase();
  const entry = await getLemmaEntry(db, bw);
  if (!entry) notFound();
  // getLemmaEntry already returns COUNT(*) for this lemma as entry.count; it
  // equals countLemmaConcordance (same COUNT over the same predicate), so reuse
  // it as the paging total instead of a second identical round-trip.
  const initialConcordance = await getLemmaConcordancePage(db, bw, {
    limit: CONCORDANCE_PAGE_SIZE,
    offset: 0,
  });
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <LemmaEntry
        key={bw}
        entry={entry}
        initialConcordance={initialConcordance}
        total={entry.count}
      />
    </main>
  );
}
