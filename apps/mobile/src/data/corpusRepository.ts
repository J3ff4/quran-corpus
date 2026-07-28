import type { MobileDataClient } from '@quran-corpus/mobile-data';
import {
  getAyahsBySurah,
  getSegmentsByWordIds,
  getTranslationsBySurahAndLang,
  getWordsBySurah,
  getWordDetail,
  type Ayah,
  type Translation,
  type Word,
  type WordDetail,
  type WordSegment,
} from '@quran-corpus/data/mobile';
import type { ContentLanguageCode } from '../i18n/languages';

const M0_SURAH_ID = 1;

export interface ReaderAyah {
  ayah: Ayah;
  translation: Translation | null;
  words: Word[];
}

export interface SurahReaderData {
  surahId: number;
  ayahs: ReaderAyah[];
}

export async function getM0SurahReader(
  client: MobileDataClient,
  languageCode: ContentLanguageCode,
): Promise<SurahReaderData> {
  const db = client as never;
  const [ayahs, words, translations] = await Promise.all([
    getAyahsBySurah(db, M0_SURAH_ID),
    getWordsBySurah(db, M0_SURAH_ID),
    getTranslationsBySurahAndLang(db, M0_SURAH_ID, languageCode),
  ]);

  return {
    surahId: M0_SURAH_ID,
    ayahs: ayahs.map((ayah) => ({
      ayah,
      translation: translations.find((t) => t.ayah_id === ayah.id) ?? null,
      words: words.filter((w) => w.ayah_id === ayah.id),
    })),
  };
}

export interface MobileWordDetail {
  detail: WordDetail | null;
  segments: WordSegment[];
}

export async function getM0WordDetail(
  client: MobileDataClient,
  wordId: number,
): Promise<MobileWordDetail> {
  const db = client as never;
  const detail = await getWordDetail(db, wordId);
  const segments = detail ? await getSegmentsByWordIds(db, [detail.word.id]) : [];
  return { detail, segments };
}
