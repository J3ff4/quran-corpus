import { NextResponse } from 'next/server';
import { getAllSurahs } from '@quran-corpus/data';
import { getDatabase } from '../../../lib/db';
import { toPickerSurah, type PickerSurah } from '../../../components/wbw/types';

export async function GET(): Promise<Response> {
  try {
    const db = await getDatabase();
    const surahs = await getAllSurahs(db);
    const out: PickerSurah[] = surahs.map(toPickerSurah);
    return NextResponse.json(out, {
      headers: { 'Cache-Control': 'public, max-age=86400, immutable' },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load surahs' }, { status: 500 });
  }
}
