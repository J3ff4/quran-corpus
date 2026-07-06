export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { getRootEntry, getRootConcordancePage, countRootConcordance } from '@quran-corpus/data';
import { getDatabase } from '../../../lib/db';
import { RootEntry } from '../../../components/dictionary/RootEntry';

const PAGE = 20;

interface PageProps {
  params: Promise<{ root: string }>;
}

export default async function RootPage({ params }: PageProps) {
  const { root } = await params;
  const bw = decodeURIComponent(root);
  const db = await getDatabase();
  const entry = await getRootEntry(db, bw);
  if (!entry) notFound();
  const [initialConcordance, total] = await Promise.all([
    getRootConcordancePage(db, bw, { limit: PAGE, offset: 0 }),
    countRootConcordance(db, bw),
  ]);
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <RootEntry entry={entry} initialConcordance={initialConcordance} total={total} />
    </main>
  );
}
