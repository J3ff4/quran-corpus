import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

// The reader and WbW UIs have their own test files; what is unverified here is
// the wiring from `?lang=` plus the script cookie to the query's language code.
vi.mock('../components/reader/ReaderView', () => ({ ReaderView: () => <div /> }));
vi.mock('../components/reader/LanguageBar', () => ({ LanguageBar: () => <div /> }));
vi.mock('../components/reader/SurahHeader', () => ({ SurahHeader: () => <div /> }));
vi.mock('../components/reader/RecordSurahVisit', () => ({ RecordSurahVisit: () => <div /> }));
vi.mock('../components/wbw/WbwView', () => ({ WbwView: () => <div /> }));

const getTranslationsBySurahAndLang = vi.fn(async () => []);
const getGlossesWithFallback = vi.fn(async () => []);
const surah = { id: 1, name_arabic: 'الفاتحة', name_translit: 'Al-Fatiha', name_translation: 'The Opening', revelation_type: 'meccan', ayah_count: 7, order_number: 1 };

vi.mock('../lib/db', () => ({ getDatabase: async () => ({}) }));

const cookieJar = { get: vi.fn((_name: string) => undefined as { value: string } | undefined) };
vi.mock('next/headers', () => ({ cookies: async () => cookieJar }));

vi.mock('@quran-corpus/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@quran-corpus/data')>();
  return {
    ...actual,
    getSurahById: async () => surah,
    getAllSurahs: async () => [surah],
    getAyahsBySurah: async () => [],
    getWordsBySurah: async () => [],
    getWordsBySurahAyahRange: async () => [],
    getSegmentsByWordIds: async () => [],
    getSurahNames: async () => new Map(),
    getTranslationsBySurahAndLang: (...a: unknown[]) => getTranslationsBySurahAndLang(...(a as [])),
    getGlossesWithFallback: (...a: unknown[]) => getGlossesWithFallback(...(a as [])),
  };
});

const { default: SurahPage } = await import('../app/surah/[id]/page');
const { default: WbwPage } = await import('../app/surah/[id]/words/page');

const cookies = (locale?: string, script?: string) =>
  cookieJar.get.mockImplementation((name: string) =>
    name === 'ui-locale' && locale
      ? { value: locale }
      : name === 'ui-script' && script
        ? { value: script }
        : undefined,
  );

const reader = (lang: string) =>
  SurahPage({ params: Promise.resolve({ id: '1' }), searchParams: Promise.resolve({ lang }) });
const wbw = (lang: string) =>
  WbwPage({ params: Promise.resolve({ id: '1' }), searchParams: Promise.resolve({ lang }) });

describe('reader and WbW query language', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieJar.get.mockReturnValue(undefined);
  });

  it('composes the Cyrillic script onto the Uzbek translation the reader picked', async () => {
    // Which language you read is `?lang=`; which alphabet is the script
    // cookie. Neither alone is a `language_code` -- only the composition is.
    cookies('uz', 'cyrillic');
    render(await reader('uz'));
    expect(getTranslationsBySurahAndLang).toHaveBeenCalledWith(expect.anything(), 1, 'uz-Cyrl');
    expect(getGlossesWithFallback).toHaveBeenCalledWith(expect.anything(), 1, 'uz-Cyrl');
  });

  it('composes the same code for the word-by-word glosses', async () => {
    cookies('uz', 'cyrillic');
    render(await wbw('uz'));
    expect(getGlossesWithFallback).toHaveBeenCalledWith(expect.anything(), 1, 'uz-Cyrl');
  });

  it('leaves Uzbek in Latin alone', async () => {
    cookies('uz', 'latin');
    render(await reader('uz'));
    expect(getTranslationsBySurahAndLang).toHaveBeenCalledWith(expect.anything(), 1, 'uz');
  });

  it('never composes a script onto a language that has only one', async () => {
    // No table carries an `en-Cyrl` row, so composing one empties the page
    // rather than degrading it.
    cookies('uz', 'cyrillic');
    render(await reader('en'));
    expect(getTranslationsBySurahAndLang).toHaveBeenCalledWith(expect.anything(), 1, 'en');
    render(await reader('ru'));
    expect(getTranslationsBySurahAndLang).toHaveBeenCalledWith(expect.anything(), 1, 'ru');
  });

  it('ignores a junk script cookie', async () => {
    cookies('uz', 'runes');
    render(await reader('uz'));
    expect(getTranslationsBySurahAndLang).toHaveBeenCalledWith(expect.anything(), 1, 'uz');
  });
});
