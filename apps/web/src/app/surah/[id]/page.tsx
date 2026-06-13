import { notFound } from 'next/navigation';
import { getDatabase } from '../../../lib/db';
import {
  getSurahById,
  getAyahsBySurah,
  getWordsBySurah,
  getTranslationsBySurahAndLang,
} from '@quran-corpus/data';
import type { Word, Translation } from '@quran-corpus/data';
import { SurahHeader } from '../../../components/reader/SurahHeader';
import { ReaderView } from '../../../components/reader/ReaderView';
import { LanguageBar } from '../../../components/reader/LanguageBar';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}

export default async function SurahPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { lang = 'en' } = await searchParams;
  const surahId = parseInt(id, 10);

  if (isNaN(surahId) || surahId < 1 || surahId > 114) notFound();

  const db = await getDatabase();
  const [surah, ayahs, words, translations] = await Promise.all([
    getSurahById(db, surahId),
    getAyahsBySurah(db, surahId),
    getWordsBySurah(db, surahId),
    getTranslationsBySurahAndLang(db, surahId, lang),
  ]);

  if (!surah) notFound();

  // Group words by ayah_id
  const wordsByAyah: Record<number, Word[]> = {};
  for (const word of words) {
    (wordsByAyah[word.ayah_id] ??= []).push(word);
  }

  // Index one translation per ayah for this lang
  const translationsByAyah: Record<number, Translation> = {};
  for (const t of translations) {
    translationsByAyah[t.ayah_id] = t;
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <SurahHeader surah={surah} />
      <LanguageBar surahId={surahId} activeLang={lang} />
      <ReaderView
        ayahs={ayahs}
        wordsByAyah={wordsByAyah}
        translationsByAyah={translationsByAyah}
        lang={lang}
      />
    </main>
  );
}
