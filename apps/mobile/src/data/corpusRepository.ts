import type { MobileDataClient } from '@quran-corpus/mobile-data';
import {
  getAyahsBySurah,
  getAllSurahs,
  getSegmentsByWordIds,
  getSurahById,
  getTranslationsBySurahAndLang,
  getWordsBySurah,
  getWordDetail,
  type Ayah,
  type Surah,
  type Translation,
  type Word,
  type WordDetail,
  type WordSegment,
} from '@quran-corpus/data/mobile';
import type { ContentLanguageCode } from '../i18n/languages';

const M0_SURAH_ID = 1;
const selectedTranslators: Record<ContentLanguageCode, string> = {
  en: 'Saheeh International',
  uz: 'Muhammad Sodik Muhammad Yusuf',
  ru: 'Abu Adel',
};

export interface ReaderAyah {
  ayah: Ayah;
  translation: Translation | null;
  words: Word[];
}

export interface SurahReaderData {
  surah: Surah;
  ayahs: ReaderAyah[];
}

export interface SurahListItem {
  id: number;
  nameArabic: string;
  nameTranslit: string;
  nameTranslation: string;
  ayahCount: number;
}

function groupWordsByAyah(words: Word[]): Map<number, Word[]> {
  const grouped = new Map<number, Word[]>();
  for (const word of words) {
    const existing = grouped.get(word.ayah_id) ?? [];
    existing.push(word);
    grouped.set(word.ayah_id, existing);
  }
  return grouped;
}

function selectedTranslationByAyah(
  translations: Translation[],
  languageCode: ContentLanguageCode,
): Map<number, Translation> {
  const selectedTranslator = selectedTranslators[languageCode];
  const grouped = new Map<number, Translation>();
  for (const translation of translations) {
    if (translation.translator === selectedTranslator) {
      grouped.set(translation.ayah_id, translation);
    }
  }
  return grouped;
}

export async function getSurahList(client: MobileDataClient): Promise<SurahListItem[]> {
  const db = client as never;
  const surahs = await getAllSurahs(db);
  return surahs.map((surah) => ({
    id: surah.id,
    nameArabic: surah.name_arabic,
    nameTranslit: surah.name_translit,
    nameTranslation: surah.name_translation,
    ayahCount: surah.ayah_count,
  }));
}

export async function getSurahReader(
  client: MobileDataClient,
  surahId: number,
  languageCode: ContentLanguageCode,
): Promise<SurahReaderData> {
  const db = client as never;
  const [surah, ayahs, words, translations] = await Promise.all([
    getSurahById(db, surahId),
    getAyahsBySurah(db, surahId),
    getWordsBySurah(db, surahId),
    getTranslationsBySurahAndLang(db, surahId, languageCode),
  ]);

  if (!surah) throw new Error(`Surah not found: ${surahId}`);

  const wordsByAyah = groupWordsByAyah(words);
  const translationsByAyah = selectedTranslationByAyah(translations, languageCode);

  return {
    surah,
    ayahs: ayahs.map((ayah) => ({
      ayah,
      translation: translationsByAyah.get(ayah.id) ?? null,
      words: wordsByAyah.get(ayah.id) ?? [],
    })),
  };
}

export async function getAyahReaderLocation(
  client: MobileDataClient,
  surahId: number,
  ayahNumber: number,
  languageCode: ContentLanguageCode,
): Promise<ReaderAyah | null> {
  const reader = await getSurahReader(client, surahId, languageCode);
  return reader.ayahs.find((item) => item.ayah.ayah_number === ayahNumber) ?? null;
}

export async function getM0SurahReader(
  client: MobileDataClient,
  languageCode: ContentLanguageCode,
): Promise<SurahReaderData> {
  return getSurahReader(client, M0_SURAH_ID, languageCode);
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
