export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import {
  getLemmaEntry,
  getLemmaConcordancePage,
  parseLemmaParam,
  CONCORDANCE_PAGE_SIZE,
} from '@quran-corpus/data';
import { getDatabase } from '../../../../lib/db';
import { LemmaEntry } from '../../../../components/dictionary/LemmaEntry';

interface PageProps {
  params: Promise<{ lemma: string }>;
}

export default async function LemmaPage({ params }: PageProps) {
  // Decode + validate before touching the DB, using the same rule the
  // concordance API enforces -- otherwise SSR would accept an identifier the
  // client-side Load-more then 400s on (the accepts/rejects asymmetry).
  const bw = parseLemmaParam((await params).lemma);
  if (bw === null) notFound();
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
