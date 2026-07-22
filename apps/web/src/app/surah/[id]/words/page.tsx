import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getDatabase } from '../../../../lib/db';
import {
  getSurahById,
  getAllSurahs,
  getAyahsBySurah,
  getWordsBySurahAyahRange,
  getGlossesWithFallback,
  getSegmentsByWordIds,
  posLabelEn,
} from '@quran-corpus/data';
import type { WordSegment } from '@quran-corpus/data';
import { WbwView } from '../../../../components/wbw/WbwView';
import type { WbwCell, WbwAyah } from '../../../../components/wbw/types';
import { toPickerSurah, type PickerSurah } from '../../../../components/wbw/types';
import { isValidLang, type ValidLang } from '../../../../components/reader/languages';
import { VIEW_MODE_COOKIE, isViewMode } from '../../../../components/wbw/viewMode';
import { parseSurahId, resolvePage } from './params';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; ayah?: string; lang?: string }>;
}

export default async function WbwPage({ params, searchParams }: PageProps) {
  const surahId = parseSurahId(await params);
  if (surahId == null) notFound();
  const { page: rawPage, ayah: rawAyah, lang: rawLang } = await searchParams;
  const lang: ValidLang = isValidLang(rawLang) ? rawLang : 'en';

  const db = await getDatabase();
  const surah = await getSurahById(db, surahId);
  if (!surah) notFound();

  const { page, lo, hi, scrollAyah, totalPages } = resolvePage(surah.ayah_count, rawPage, rawAyah);

  // ponytail: ayahs+glosses load the whole surah; only words are windowed. Fine at homelab scale — add getAyahsBySurahRange / getGlossesBySurahAyahRange if a large surah measures slow.
  const [ayahRows, words, glosses, allSurahs] = await Promise.all([
    getAyahsBySurah(db, surahId),
    getWordsBySurahAyahRange(db, surahId, lo, hi),
    getGlossesWithFallback(db, surahId, lang),
    getAllSurahs(db),
  ]);
  const segments = await getSegmentsByWordIds(db, words.map((w) => w.id));
  const pickerSurahs: PickerSurah[] = allSurahs.map(toPickerSurah);

  const cookieStore = await cookies();
  const storedViewMode = cookieStore.get(VIEW_MODE_COOKIE)?.value;
  const initialViewMode = isViewMode(storedViewMode) ? storedViewMode : 'card';

  const glossByWordId = new Map<number, { text: string; lang: string }>();
  for (const g of glosses) glossByWordId.set(g.word_id, { text: g.gloss_text, lang: g.gloss_lang });

  const segmentsByWordId = new Map<number, WordSegment[]>();
  for (const s of segments) {
    let arr = segmentsByWordId.get(s.word_id);
    if (!arr) {
      arr = [];
      segmentsByWordId.set(s.word_id, arr);
    }
    arr.push(s);
  }

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
      gloss: glossByWordId.get(w.id)?.text ?? null,
      glossLang: glossByWordId.get(w.id)?.lang ?? null,
      posTag: w.pos_tag,
      posLabel: posLabelEn(w.pos_tag),
      segments: segmentsByWordId.get(w.id) ?? [],
      grammarArabic: w.grammar_arabic,
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
      <WbwView
        surah={surah}
        ayahs={ayahs}
        page={page}
        totalPages={totalPages}
        scrollAyah={scrollAyah}
        pageLang={lang}
        pickerSurahs={pickerSurahs}
        initialViewMode={initialViewMode}
      />
    </main>
  );
}
