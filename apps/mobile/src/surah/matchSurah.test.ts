import { describe, expect, it } from 'vitest';

import type { SurahListItem } from '@/data/corpusRepository';
import { matchSurahs, normalizeArabic, normalizeLatin } from './matchSurah';

/** A slice of the real index -- the rows whose spellings actually disagree. */
const SURAHS: SurahListItem[] = [
  { id: 1, nameArabic: 'الفاتحة', nameTranslit: 'Al-Fatihah', nameTranslation: 'The Opener', ayahCount: 7 },
  { id: 2, nameArabic: 'البقرة', nameTranslit: 'Al-Baqarah', nameTranslation: 'The Cow', ayahCount: 286 },
  { id: 10, nameArabic: 'يونس', nameTranslit: 'Yunus', nameTranslation: 'Jonah', ayahCount: 109 },
  { id: 24, nameArabic: 'النور', nameTranslit: 'An-Nur', nameTranslation: 'The Light', ayahCount: 64 },
  { id: 36, nameArabic: 'يس', nameTranslit: 'Ya-Sin', nameTranslation: 'Ya Sin', ayahCount: 83 },
  { id: 71, nameArabic: 'نوح', nameTranslit: 'Nuh', nameTranslation: 'Noah', ayahCount: 28 },
  { id: 112, nameArabic: 'الإخلاص', nameTranslit: 'Al-Ikhlas', nameTranslation: 'Sincerity', ayahCount: 4 },
];

const ids = (query: string) => matchSurahs(SURAHS, query).map((surah) => surah.id);

describe('matchSurahs, by transliteration', () => {
  it.each(['baqara', 'Baqarah', 'bakara', 'al-baqara', 'AL BAQARA', 'Al-Baqarah'])(
    'finds al-Baqarah from %s',
    (query) => {
      expect(ids(query)[0]).toBe(2);
    },
  );

  it.each(['yasin', 'ya-sin', 'yaseen', 'Ya Sin'])('finds Ya-Sin from %s', (query) => {
    expect(ids(query)[0]).toBe(36);
  });

  it.each(['yunus', 'yoonus', 'Yūnus'])('finds Yunus from %s', (query) => {
    expect(ids(query)[0]).toBe(10);
  });

  it.each(['ikhlas', 'ihlas', 'al-ikhlas'])('finds al-Ikhlas from %s', (query) => {
    expect(ids(query)[0]).toBe(112);
  });

  it('drops the article, plain or assimilated', () => {
    // Asserted on the normalizer, not through a match: without the strip the
    // names still MATCH (`bakara` is inside `albakara`), they just stop
    // ranking as prefixes -- so a match-only test passes either way.
    expect(normalizeLatin('Al-Baqarah')).toBe('bakara');
    expect(normalizeLatin('An-Nur')).toBe('nur');
    expect(normalizeLatin('Ash-Shams')).toBe('sams');
    // Not an article: a three-letter name that merely starts with one.
    expect(normalizeLatin('Ali')).toBe('ali');
  });

  it('does not eat the h of a name that ends in one', () => {
    // `-ah` is trimmed to `-a`; a bare trailing h is a letter of the name.
    expect(ids('nuh')).toEqual([71]);
    expect(normalizeLatin('Nuh')).toBe('nuh');
  });
});

describe('matchSurahs, by meaning and number', () => {
  it('finds al-Baqarah by its English meaning', () => {
    expect(ids('cow')).toEqual([2]);
  });

  it('finds a surah by its localized meaning, whatever the language', () => {
    // The rows carry the UI language's meaning already, so the arm is
    // language-agnostic by construction.
    const uz = [{ ...SURAHS[1], nameTranslit: 'Baqara', nameTranslation: 'Sigir' }];
    expect(matchSurahs(uz, 'sigir').map((surah) => surah.id)).toEqual([2]);
  });

  it('ignores a meaning fragment under three characters', () => {
    // `Jonah` is Yunus's meaning and appears in no transliteration; two of
    // its characters are not a search.
    expect(ids('jo')).toEqual([]);
    expect(ids('jon')).toEqual([10]);
  });

  it('does not let one folded letter match most of the index', () => {
    // `th` folds to `t`, which is inside half these names. A prefix of one
    // letter is still honoured -- that is the list filtering, not noise.
    expect(ids('th')).toEqual([]);
    expect(ids('n')).toEqual([24, 71]);
  });

  it('still accepts a bare number', () => {
    expect(ids('36')).toEqual([36]);
    expect(ids('115')).toEqual([]);
  });
});

describe('matchSurahs, by Arabic name', () => {
  it.each(['البقرة', 'البقره', 'بقرة', 'الْبَقَرَة'])('finds al-Baqarah from %s', (query) => {
    expect(ids(query)[0]).toBe(2);
  });

  it('flattens the hamza seat the way the corpus does not', () => {
    // `الإخلاص` in the row, `الاخلاص` from a phone keyboard.
    expect(ids('الاخلاص')[0]).toBe(112);
  });

  it('normalizes both sides to NFC', () => {
    // al-Ikhlas, not al-Baqarah: only a hamza-bearing letter decomposes at
    // all, so a name without one would assert nothing here.
    const decomposed = 'الإخلاص'.normalize('NFD');
    expect(decomposed).not.toBe('الإخلاص');
    expect(normalizeArabic(decomposed)).toBe(normalizeArabic('الإخلاص'));
    expect(ids(decomposed)[0]).toBe(112);
  });
});

describe('matchSurahs, ranking and edges', () => {
  it('puts a transliteration hit above a meaning hit', () => {
    // `nur` is An-Nur's name and nothing else's; `light` is its meaning.
    // A query that is both a name prefix and another row's meaning has to
    // lead with the name.
    const rows = [
      { ...SURAHS[3] },
      { ...SURAHS[0], nameTranslation: 'The Nur of guidance' },
    ];
    expect(matchSurahs(rows, 'nur').map((surah) => surah.id)).toEqual([24, 1]);
  });

  it('prefers a prefix over a substring', () => {
    const rows = [
      { ...SURAHS[2], id: 99, nameTranslit: 'Abu-Yunus' },
      { ...SURAHS[2] },
    ];
    expect(matchSurahs(rows, 'yunus').map((surah) => surah.id)).toEqual([10, 99]);
  });

  it('returns every surah, in order, for an empty query', () => {
    expect(ids('')).toEqual([1, 2, 10, 24, 36, 71, 112]);
    expect(ids('   ')).toEqual([1, 2, 10, 24, 36, 71, 112]);
  });

  it('returns nothing rather than everything for a miss', () => {
    expect(ids('zzzz')).toEqual([]);
  });

  it('does not mutate the list it was given', () => {
    const original = [...SURAHS];
    matchSurahs(SURAHS, 'cow');
    expect(SURAHS).toEqual(original);
  });
});
