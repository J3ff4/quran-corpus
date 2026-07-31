export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import {
  getWordByLocation,
  getWordDetail,
} from '@quran-corpus/data';
import { getDatabase } from '../../../../../lib/db';
import { WordDetailView } from '../../../../../components/morphology/WordDetailView';
import { parseWordParams } from './params';
import { rootPath } from '../../../../../lib/routes';

interface PageProps {
  params: Promise<{ surah: string; ayah: string; position: string }>;
}

export default async function WordPage({ params }: PageProps) {
  const loc = parseWordParams(await params);
  if (!loc) notFound();

  const db = await getDatabase();
  const word = await getWordByLocation(db, loc.surah, loc.ayah, loc.position);
  if (!word) notFound();

  const detail = await getWordDetail(db, word.id);
  if (!detail) notFound();

  const rootHref = word.root_buckwalter ? rootPath(word.root_buckwalter) : undefined;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <WordDetailView detail={detail} {...(rootHref ? { rootHref } : {})} />
    </main>
  );
}
