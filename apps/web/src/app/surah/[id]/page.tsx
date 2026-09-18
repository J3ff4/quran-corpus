// DB-dependent page — opt out of static pre-rendering
export const dynamic = 'force-dynamic';

import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getDatabase } from '../../../lib/db';
import {
  getSurahById,
  getAyahsBySurah,
  getWordsBySurah,
  getTranslationsBySurahAndLang,
  getGlossesWithFallback,
  getSurahNames,
} from '@quran-corpus/data';
import type { Word, Translation } from '@quran-corpus/data';
import { SurahHeader } from '../../../components/reader/SurahHeader';
import { ReaderView } from '../../../components/reader/ReaderView';
import { LanguageBar } from '../../../components/reader/LanguageBar';
import { RecordSurahVisit } from '../../../components/reader/RecordSurahVisit';
import { isValidLang, type ValidLang } from '../../../components/reader/languages';
import { parseScrollAyah } from './params';
import { BOOKMARKS_COOKIE, bookmarkedAyahsIn } from '../../../lib/bookmarks';
import { nameFor } from '../../../components/surah-list/nameFor';
import { resolveLocale } from '../../../lib/locale';
import { contentLanguage } from '@quran-corpus/config/i18n/script';

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
  // Read server-side so each ayah's bookmark icon renders saved, rather than
  // painting empty and filling in after hydration.
  const cookieStore = await cookies();
  const { content, script } = resolveLocale(cookieStore);
  // Which language you read is `?lang=`; which alphabet it is written in is the
  // script cookie. Only their composition is a real `language_code`.
  const queryLang = contentLanguage(lang, script);
  const [surah, ayahs, words, translations, glosses, names] = await Promise.all([
    getSurahById(db, surahId),
    getAyahsBySurah(db, surahId),
    getWordsBySurah(db, surahId),
    getTranslationsBySurahAndLang(db, surahId, queryLang),
    getGlossesWithFallback(db, surahId, queryLang),
    getSurahNames(db, content),
  ]);

  if (!surah) notFound();

  const scrollAyah = parseScrollAyah(rawAyah, surah.ayah_count);

  const surahName = nameFor(names, surah);
  const bookmarkedAyahs = bookmarkedAyahsIn(
    cookieStore.get(BOOKMARKS_COOKIE)?.value,
    surahId,
    'reading',
  );

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
      <RecordSurahVisit surahId={surahId} />
      <SurahHeader surah={surah} name={surahName} />
      <LanguageBar surahId={surahId} activeLang={lang} />
      <ReaderView
        ayahs={ayahs}
        wordsByAyah={wordsByAyah}
        translationsByAyah={translationsByAyah}
        glossesByWordId={glossesByWordId}
        lang={queryLang}
        scrollAyah={scrollAyah}
        bookmarkedAyahs={bookmarkedAyahs}
      />
    </main>
  );
}
