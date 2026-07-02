// DB-dependent page — opt out of static pre-rendering
export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { getDatabase } from '../../../lib/db';
import {
  getSurahById,
  getAyahsBySurah,
  getWordsBySurah,
  getTranslationsBySurahAndLang,
  getGlossesBySurahAndLang,
} from '@quran-corpus/data';
import type { Word, Translation } from '@quran-corpus/data';
import { SurahHeader } from '../../../components/reader/SurahHeader';
import { ReaderView } from '../../../components/reader/ReaderView';
import { LanguageBar } from '../../../components/reader/LanguageBar';
import { VALID_LANG_CODES } from '../../../components/reader/languages';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}

type ValidLang = (typeof VALID_LANG_CODES)[number];

function isValidLang(v: string | undefined): v is ValidLang {
  return (VALID_LANG_CODES as ReadonlyArray<string>).includes(v ?? '');
}

export default async function SurahPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { lang: rawLang } = await searchParams;
  const lang: ValidLang = isValidLang(rawLang) ? rawLang : 'en';
  const surahId = parseInt(id, 10);

  if (isNaN(surahId) || surahId < 1 || surahId > 114) notFound();

  const db = await getDatabase();
  const [surah, ayahs, words, translations, glosses] = await Promise.all([
    getSurahById(db, surahId),
    getAyahsBySurah(db, surahId),
    getWordsBySurah(db, surahId),
    getTranslationsBySurahAndLang(db, surahId, lang),
    getGlossesBySurahAndLang(db, surahId, lang),
  ]);

  if (!surah) notFound();

  // Group words by ayah_id
  const wordsByAyah: Record<number, Word[]> = {};
  for (const word of words) {
    (wordsByAyah[word.ayah_id] ??= []).push(word);
  }

  // One translation per ayah for this language; last writer wins if multiple translators exist.
  const translationsByAyah: Record<number, Translation> = {};
  for (const t of translations) {
    translationsByAyah[t.ayah_id] = t;
  }

  // word_id -> gloss text for this language.
  const glossesByWordId: Record<number, string> = {};
  for (const g of glosses) {
    glossesByWordId[g.word_id] = g.gloss_text;
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <SurahHeader surah={surah} />
      <LanguageBar surahId={surahId} activeLang={lang} />
      <ReaderView
        ayahs={ayahs}
        wordsByAyah={wordsByAyah}
        translationsByAyah={translationsByAyah}
        glossesByWordId={glossesByWordId}
        lang={lang}
      />
    </main>
  );
}
