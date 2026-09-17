export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import {
  getRootEntry,
  getRootConcordancePage,
  countRootConcordance,
  getRootNeighbors,
  getRootGlosses,
  parseRootParam,
  CONCORDANCE_PAGE_SIZE,
} from '@quran-corpus/data';
import { getDatabase } from '../../../lib/db';
import { RootEntry } from '../../../components/dictionary/RootEntry';
import { resolveLocale } from '../../../lib/locale';

const PAGE = CONCORDANCE_PAGE_SIZE;

interface PageProps {
  params: Promise<{ root: string }>;
}

export default async function RootPage({ params }: PageProps) {
  // Same rule the concordance API enforces, for the same reason the lemma page
  // states: SSR must not accept an identifier the client-side Load-more then
  // 400s on. Not harmless on today's data -- 97 of 1642 roots contain a
  // character URL normalization leaves percent-encoded.
  const bw = parseRootParam((await params).root);
  if (bw === null) notFound();
  const db = await getDatabase();
  const entry = await getRootEntry(db, bw);
  if (!entry) notFound();
  const { content } = resolveLocale(await cookies());
  const [initialConcordance, total, neighbors, glosses] = await Promise.all([
    getRootConcordancePage(db, bw, { limit: PAGE, offset: 0 }),
    countRootConcordance(db, bw),
    getRootNeighbors(db, bw),
    getRootGlosses(db, entry.root.id, content),
  ]);
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <RootEntry
        key={bw}
        entry={entry}
        initialConcordance={initialConcordance}
        total={total}
        glosses={glosses}
        prevBw={neighbors.prev}
        nextBw={neighbors.next}
      />
    </main>
  );
}
