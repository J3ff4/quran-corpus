import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAllSurahs, getSurahNames } from '@quran-corpus/data';
import { getDatabase } from '../../../lib/db';
import { toPickerSurah, type PickerSurah } from '../../../components/wbw/types';
import { resolveLocale } from '../../../lib/locale';

export async function GET(): Promise<Response> {
  try {
    const db = await getDatabase();
    const { content } = resolveLocale(await cookies());
    const [surahs, names] = await Promise.all([getAllSurahs(db), getSurahNames(db, content)]);
    const out: PickerSurah[] = surahs.map((s) => toPickerSurah(s, names));
    // The body now varies by the locale cookie, so it can no longer be cached
    // publicly: a shared cache would hand one reader's language to the next.
    // `private` keeps the browser's own copy, `Vary: Cookie` retires it when
    // the reader switches.
    return NextResponse.json(out, {
      headers: { 'Cache-Control': 'private, max-age=86400', Vary: 'Cookie' },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load surahs' }, { status: 500 });
  }
}
