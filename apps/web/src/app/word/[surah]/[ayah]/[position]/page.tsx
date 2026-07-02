export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import {
  getWordByLocation,
  getWordDetail,
} from '@quran-corpus/data';
import { getDatabase } from '../../../../../lib/db';
import { WordDetailView } from '../../../../../components/morphology/WordDetailView';

interface PageProps {
  params: Promise<{ surah: string; ayah: string; position: string }>;
}

export function parseWordParams(p: { surah: string; ayah: string; position: string }) {
  const surah = Number(p.surah);
  const ayah = Number(p.ayah);
  const position = Number(p.position);
  if (![surah, ayah, position].every(Number.isInteger)) return null;
  if (surah < 1 || surah > 114 || ayah < 1 || position < 1) return null;
  return { surah, ayah, position };
}

export default async function WordPage({ params }: PageProps) {
  const loc = parseWordParams(await params);
  if (!loc) notFound();

  const db = await getDatabase();
  const word = await getWordByLocation(db, loc.surah, loc.ayah, loc.position);
  if (!word) notFound();

  const detail = await getWordDetail(db, word.id);
  if (!detail) notFound();

  const rootHref = word.root_buckwalter ? `/dictionary/${word.root_buckwalter}` : undefined;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <WordDetailView detail={detail} {...(rootHref ? { rootHref } : {})} />
    </main>
  );
}
