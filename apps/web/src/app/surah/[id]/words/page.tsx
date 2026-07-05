import { notFound } from 'next/navigation';
import { getDatabase } from '../../../../lib/db';
import {
  getSurahById,
  getAyahsBySurah,
  getWordsBySurahAyahRange,
  getGlossesBySurahAndLang,
  posLabelEn,
} from '@quran-corpus/data';
import { WbwView } from '../../../../components/wbw/WbwView';
import type { WbwCell, WbwAyah } from '../../../../components/wbw/types';
import { parseSurahId, resolvePage } from './params';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; ayah?: string }>;
}

export default async function WbwPage({ params, searchParams }: PageProps) {
  const surahId = parseSurahId(await params);
  if (surahId == null) notFound();
  const { page: rawPage, ayah: rawAyah } = await searchParams;

  const db = await getDatabase();
  const surah = await getSurahById(db, surahId);
  if (!surah) notFound();

  const { page, lo, hi, scrollAyah, totalPages } = resolvePage(surah.ayah_count, rawPage, rawAyah);

  // ponytail: ayahs+glosses load the whole surah; only words are windowed. Fine at homelab scale — add getAyahsBySurahRange / getGlossesBySurahAyahRange if a large surah measures slow.
  const [ayahRows, words, glosses] = await Promise.all([
    getAyahsBySurah(db, surahId),
    getWordsBySurahAyahRange(db, surahId, lo, hi),
    getGlossesBySurahAndLang(db, surahId, 'en'),
  ]);

  const glossByWordId = new Map<number, string>();
  for (const g of glosses) glossByWordId.set(g.word_id, g.gloss_text);

  const numberByAyahId = new Map<number, number>();
  const uthmaniByNumber = new Map<number, string>();
  for (const a of ayahRows) {
    numberByAyahId.set(a.id, a.ayah_number);
    uthmaniByNumber.set(a.ayah_number, a.text_uthmani);
  }

  const cellsByNumber = new Map<number, WbwCell[]>();
  for (const w of words) {
    const ayahNumber = numberByAyahId.get(w.ayah_id);
    if (ayahNumber == null) continue;
    let arr = cellsByNumber.get(ayahNumber);
    if (!arr) {
      arr = [];
      cellsByNumber.set(ayahNumber, arr);
    }
    arr.push({
      surahId,
      ayahNumber,
      position: w.position,
      arabic: w.text_arabic,
      translit: w.transliteration,
      gloss: glossByWordId.get(w.id) ?? null,
      posLabel: posLabelEn(w.pos_tag),
    });
  }

  const ayahs: WbwAyah[] = [];
  for (let n = lo; n <= hi; n++) {
    ayahs.push({
      ayahNumber: n,
      cells: cellsByNumber.get(n) ?? [],
      textUthmani: uthmaniByNumber.get(n) ?? '',
    });
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <WbwView surah={surah} ayahs={ayahs} page={page} totalPages={totalPages} scrollAyah={scrollAyah} />
    </main>
  );
}
