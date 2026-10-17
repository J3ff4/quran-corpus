import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { search, EMPTY_SEARCH_RESULT } from '@quran-corpus/data';
import { getDatabase } from '../../../lib/db';
import { resolveLocale } from '../../../lib/locale';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim();
  if (q.length === 0 || q.length > 100) {
    return NextResponse.json(EMPTY_SEARCH_RESULT);
  }
  const db = await getDatabase();
  // No selection passed: web offers every indexed translation rather than one
  // fixed translator per language. The `translators` option exists for a caller
  // with a per-language translator choice -- see its comment in
  // queries/search.ts. glossLanguage only shapes the Words section; it never
  // reaches searchVerses' SQL, so verse hits are unchanged.
  const { content } = resolveLocale(await cookies());
  const result = await search(db, q, { glossLanguage: content });
  return NextResponse.json(result);
}
