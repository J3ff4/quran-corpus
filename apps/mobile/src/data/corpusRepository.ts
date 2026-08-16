import { selectedTranslators, type MobileDataClient } from '@quran-corpus/mobile-data';
import {
  getAyahsBySurah,
  getAllSurahs,
  getSegmentsByWordIds,
  getSurahById,
  getTranslationsBySurahAndLang,
  getWordDetail,
  type Ayah,
  type Surah,
  type Translation,
  type WordDetail,
  type WordSegment,
} from '@quran-corpus/data/mobile';
import type { ContentLanguageCode } from '../i18n/languages';

const M0_SURAH_ID = 1;

// Fails the build if the shared list ever stops covering every content language
// the UI offers -- otherwise a new language would render a permanently blank
// translation pane instead of an error.
const translatorByLanguage: Record<ContentLanguageCode, string> = selectedTranslators;

export interface ReaderAyah {
  ayah: Ayah;
  translation: Translation | null;
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

function selectedTranslationByAyah(
  translations: Translation[],
  languageCode: ContentLanguageCode,
): Map<number, Translation> {
  const selectedTranslator = translatorByLanguage[languageCode];
  const grouped = new Map<number, Translation>();
  for (const translation of translations) {
    if (translation.translator === selectedTranslator) {
      grouped.set(translation.ayah_id, translation);
    }
  }

  // The guard above covers a language the DB does not carry at all (no rows).
  // This covers the other half: rows exist for the language but under a
  // different translator string, which filters every ayah out and renders a
  // blank translation pane with nothing to say why. Fail loudly instead --
  // the reader already has an error state, and a silent blank pane reads as a
  // corrupt download.
  if (translations.length > 0 && grouped.size === 0) {
    const present = [...new Set(translations.map((translation) => translation.translator))];
    throw new Error(
      `No ${languageCode} translation by ${selectedTranslator} in the bundled DB (found: ${present.join(', ')})`,
    );
  }

  return grouped;
}

export async function getSurahList(client: MobileDataClient): Promise<SurahListItem[]> {
  const surahs = await getAllSurahs(client);
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
  // Words are deliberately not fetched here. Nothing in the reader renders
  // them, and pulling every word of a surah moved 6116 rows across the bridge
  // for al-Baqarah alone -- the heaviest thing the app did, for output no
  // screen read. Word-by-word display (M2 parity) needs one ayah's words on
  // demand, not the whole surah up front, so this is not a fetch to restore.
  const [surah, ayahs, translations] = await Promise.all([
    getSurahById(client, surahId),
    getAyahsBySurah(client, surahId),
    getTranslationsBySurahAndLang(client, surahId, languageCode),
  ]);

  if (!surah) throw new Error(`Surah not found: ${surahId}`);

  const translationsByAyah = selectedTranslationByAyah(translations, languageCode);

  return {
    surah,
    ayahs: ayahs.map((ayah) => ({
      ayah,
      translation: translationsByAyah.get(ayah.id) ?? null,
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
  const detail = await getWordDetail(client, wordId);
  const segments = detail ? await getSegmentsByWordIds(client, [detail.word.id]) : [];
  return { detail, segments };
}
