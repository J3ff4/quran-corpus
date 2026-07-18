// DB-dependent page — opt out of static pre-rendering
export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { getDatabase } from '../../../lib/db';
import {
  getSurahById,
  getAyahsBySurah,
  getWordsBySurah,
  getTranslationsBySurahAndLang,
  getGlossesWithFallback,
} from '@quran-corpus/data';
import type { Word, Translation } from '@quran-corpus/data';
import { SurahHeader } from '../../../components/reader/SurahHeader';
import { ReaderView } from '../../../components/reader/ReaderView';
import { LanguageBar } from '../../../components/reader/LanguageBar';
import { isValidLang, type ValidLang } from '../../../components/reader/languages';
import { parseScrollAyah } from './params';

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string; ayah?: string }>;
}

export default async function SurahPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { lang: rawLang, ayah: rawAyah } = await searchParams;
  const lang: ValidLang = isValidLang(rawLang) ? rawLang : 'en';
  const surahId = parseInt(id, 10);

  if (isNaN(surahId) || surahId < 1 || surahId > 114) notFound();

  const db = await getDatabase();
  const [surah, ayahs, words, translations, glosses] = await Promise.all([
    getSurahById(db, surahId),
    getAyahsBySurah(db, surahId),
    getWordsBySurah(db, surahId),
    getTranslationsBySurahAndLang(db, surahId, lang),
    getGlossesWithFallback(db, surahId, lang),
  ]);

  if (!surah) notFound();

  const scrollAyah = parseScrollAyah(rawAyah, surah.ayah_count);

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

  // word_id -> gloss text + the lang it was actually found in (may be the EN fallback).
  const glossesByWordId: Record<number, { text: string; lang: string }> = {};
  for (const g of glosses) {
    glossesByWordId[g.word_id] = { text: g.gloss_text, lang: g.gloss_lang };
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
        scrollAyah={scrollAyah}
      />
    </main>
  );
}
