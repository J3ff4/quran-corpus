import { NextResponse } from 'next/server';
import { search, EMPTY_SEARCH_RESULT } from '@quran-corpus/data';
import { getDatabase } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim();
  if (q.length === 0 || q.length > 100) {
    return NextResponse.json(EMPTY_SEARCH_RESULT);
  }
  const db = await getDatabase();
  // No selection passed: web offers every indexed translation rather than one
  // fixed translator per language. apps/mobile passes its selectedTranslators
  // entry -- see the comment on sourceFilter in queries/search.ts.
  const result = await search(db, q);
  return NextResponse.json(result);
}
