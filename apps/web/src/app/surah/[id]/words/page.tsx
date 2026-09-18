import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getDatabase } from '../../../../lib/db';
import {
  getSurahById,
  getAllSurahs,
  getSurahNames,
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
import { nameFor } from '../../../../components/surah-list/nameFor';
import { resolveLocale } from '../../../../lib/locale';
import { contentLanguage } from '@quran-corpus/config/i18n/script';
import { parseSurahId, resolvePage } from './params';
import { BOOKMARKS_COOKIE, bookmarkedAyahsIn } from '../../../../lib/bookmarks';

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
  const cookieStore = await cookies();
  const { content, script } = resolveLocale(cookieStore);
  // Which language you read is `?lang=`; which alphabet it is written in is the
  // script cookie. Only their composition is a real `language_code`.
  const queryLang = contentLanguage(lang, script);
  const [ayahRows, words, glosses, allSurahs, names] = await Promise.all([
    getAyahsBySurah(db, surahId),
    getWordsBySurahAyahRange(db, surahId, lo, hi),
    getGlossesWithFallback(db, surahId, queryLang),
    getAllSurahs(db),
    getSurahNames(db, content),
  ]);
  const segments = await getSegmentsByWordIds(db, words.map((w) => w.id));
  const pickerSurahs: PickerSurah[] = allSurahs.map((s) => toPickerSurah(s, names));

  const storedViewMode = cookieStore.get(VIEW_MODE_COOKIE)?.value;
  const initialViewMode = isViewMode(storedViewMode) ? storedViewMode : 'card';
  // Server-side so bookmark icons render saved instead of filling in post-hydration.
  const bookmarkedAyahs = bookmarkedAyahsIn(cookieStore.get(BOOKMARKS_COOKIE)?.value, surahId, 'wbw');

  const glossByWordId = new Map<number, { text: string; lang: string; group: number | null }>();
  for (const g of glosses)
    glossByWordId.set(g.word_id, { text: g.gloss_text, lang: g.gloss_lang, group: g.gloss_group });

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
      glossGroup: glossByWordId.get(w.id)?.group ?? null,
      posTag: w.pos_tag,
      posLabel: posLabelEn(w.pos_tag),
      segments: segmentsByWordId.get(w.id) ?? [],
      grammarNote: w.grammar_note,
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
        surahName={nameFor(names, surah).name}
        ayahs={ayahs}
        page={page}
        totalPages={totalPages}
        scrollAyah={scrollAyah}
        pageLang={queryLang}
        pickerSurahs={pickerSurahs}
        initialViewMode={initialViewMode}
        bookmarkedAyahs={bookmarkedAyahs}
      />
    </main>
  );
}
