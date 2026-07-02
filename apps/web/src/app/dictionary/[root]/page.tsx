export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { getRootEntry, getRootConcordance } from '@quran-corpus/data';
import { getDatabase } from '../../../lib/db';
import { RootEntry } from '../../../components/dictionary/RootEntry';

interface PageProps {
  params: Promise<{ root: string }>;
}

export default async function RootPage({ params }: PageProps) {
  const { root } = await params;
  const bw = decodeURIComponent(root);
  const db = await getDatabase();
  const entry = await getRootEntry(db, bw);
  if (!entry) notFound();
  const concordance = await getRootConcordance(db, bw);
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <RootEntry entry={entry} concordance={concordance} />
    </main>
  );
}
