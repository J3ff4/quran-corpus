import { NextResponse } from 'next/server';
import {
  getLemmaConcordancePage,
  countLemmaConcordance,
  isLemmaBuckwalter,
  parseConcordancePaging,
} from '@quran-corpus/data';
import { getDatabase } from '../../../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lemma: string }> },
): Promise<Response> {
  // No decode: the App Router already percent-decodes `params`, and a second
  // pass aliases crafted URLs onto real ones (`qa%2541la` -> `qa%41la` ->
  // `qaAla`, served 200 under a non-canonical URL and cached separately).
  // `%` is outside the Buckwalter charset, so the validator rejects any
  // leftover escape on its own.
  const bw = (await params).lemma;
  if (!isLemmaBuckwalter(bw)) {
    return NextResponse.json({ error: 'Invalid lemma' }, { status: 400 });
  }
  const { limit, offset } = parseConcordancePaging(new URL(request.url).searchParams);
  const db = await getDatabase();
  const [entries, total] = await Promise.all([
    getLemmaConcordancePage(db, bw, { limit, offset }),
    countLemmaConcordance(db, bw),
  ]);
  return NextResponse.json(
    { entries, total },
    { headers: { 'Cache-Control': 'public, max-age=86400' } },
  );
}
