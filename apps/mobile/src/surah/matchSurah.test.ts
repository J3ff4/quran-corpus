import { describe, expect, it } from 'vitest';

import type { SurahListItem } from '@/data/corpusRepository';
import { foldArabicName, latinize, matchSurahs } from './matchSurah';

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

/** One fixture row, optionally varied. `SURAHS[1]` is `SurahListItem |
 *  undefined` under noUncheckedIndexedAccess, and spreading that gives an
 *  all-optional object matchSurahs will not accept -- so the index is checked
 *  once here instead of at every call site. */
const row = (
  rows: readonly SurahListItem[],
  index: number,
  overrides: Partial<SurahListItem> = {},
): SurahListItem => {
  const base = rows[index];
  if (!base) throw new Error(`no fixture row at index ${index}`);
  return { ...base, ...overrides };
};

describe('matchSurahs, by transliteration', () => {
  it.each(['baqara', 'Baqarah', 'bakara', 'al-baqara', 'AL BAQARA', 'Al-Baqarah'])(
    'finds al-Baqarah from %s',
    (query) => {
      expect(ids(query)[0]).toBe(2);
    },
  );

  // Not `yaseen`: the shared fold has no long-vowel rule, so search does not
  // resolve it either. One answer in both places beats a better answer in one.
  it.each(['yasin', 'ya-sin', 'Ya Sin'])('finds Ya-Sin from %s', (query) => {
    expect(ids(query)[0]).toBe(36);
  });

  it.each(['yunus', 'Yūnus'])('finds Yunus from %s', (query) => {
    expect(ids(query)[0]).toBe(10);
  });

  it.each(['ikhlas', 'ihlas', 'al-ikhlas'])('finds al-Ikhlas from %s', (query) => {
    expect(ids(query)[0]).toBe(112);
  });

  it('drops the article, plain or assimilated', () => {
    // surahName.ts's own rules, exercised through the picker: `An-Nur` and
    // `Ash-Shams` assimilate, `Al-Baqarah` does not.
    expect(ids('nur')).toEqual([24]);
    expect(ids('baqara')).toEqual([2]);
  });

  it('does not eat the h of a name that ends in one', () => {
    // A trailing -h is a romanization choice on a long name; on `Nuh` it is a
    // letter, and surahName.ts's MIN_H_STRIPPED is what keeps it.
    expect(ids('nuh')).toEqual([71]);
  });
});

describe('matchSurahs, by meaning and number', () => {
  it('finds al-Baqarah by its English meaning', () => {
    expect(ids('cow')).toEqual([2]);
  });

  it('finds a surah by its localized meaning, whatever the language', () => {
    // The rows carry the UI language's meaning already, so the arm is
    // language-agnostic by construction.
    const uz = [row(SURAHS, 1, { nameTranslit: 'Baqara', nameTranslation: 'Sigir' })];
    expect(matchSurahs(uz, 'sigir').map((surah) => surah.id)).toEqual([2]);
  });

  it('ignores a meaning fragment under three characters', () => {
    // `Jonah` is Yunus's meaning and appears in no transliteration; two of
    // its characters are not a search.
    expect(ids('jo')).toEqual([]);
    expect(ids('jon')).toEqual([10]);
  });

  it('refuses a fragment shorter than the shared prefix floor', () => {
    // SURAH_NAME_MIN_PREFIX is 3: two letters prefix a dozen surahs, and the
    // reader is better served by a full list than by a guess.
    expect(ids('th')).toEqual([]);
    expect(ids('n')).toEqual([]);
    expect(ids('nur')).toEqual([24]);
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
    expect(foldArabicName(decomposed)).toBe(foldArabicName('الإخلاص'));
    expect(ids(decomposed)[0]).toBe(112);
  });
});

describe('matchSurahs, ranking and edges', () => {
  it('puts a transliteration hit above a meaning hit', () => {
    // `nur` is An-Nur's name and nothing else's; `light` is its meaning.
    // A query that is both a name prefix and another row's meaning has to
    // lead with the name.
    const rows = [
      row(SURAHS, 3),
      row(SURAHS, 0, { nameTranslation: 'The Nur of guidance' }),
    ];
    expect(matchSurahs(rows, 'nur').map((surah) => surah.id)).toEqual([24, 1]);
  });

  it('matches a name from its start, never from its middle', () => {
    // surahName.ts's contract, kept: a fragment inside a name is a
    // coincidence far more often than an intention.
    const rows = [
      row(SURAHS, 2, { id: 99, nameTranslit: 'Abu-Yunus' }),
      row(SURAHS, 2),
    ];
    expect(matchSurahs(rows, 'yunus').map((surah) => surah.id)).toEqual([10]);
    expect(matchSurahs(rows, 'abuyunus').map((surah) => surah.id)).toEqual([99]);
  });

  it('returns every surah, in order, for an empty query', () => {
    expect(ids('')).toEqual([1, 2, 10, 24, 36, 71, 112]);
    expect(ids('   ')).toEqual([1, 2, 10, 24, 36, 71, 112]);
  });

  it('ignores a bare `the` on the way to `The Cow`', () => {
    // Three characters clears the meaning floor, and `the` opens the English
    // meaning of some eighty surahs -- so without the stopword the list went
    // to almost-everything, id-ordered, at exactly the keystroke before the
    // reader typed the word that means something.
    expect(ids('the')).toEqual([]);
    // And the floor still lets a real three-letter meaning through.
    expect(ids('cow')).toEqual([2]);
    expect(ids('the cow')).toEqual([2]);
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

describe('matchSurahs, under a Cyrillic name column', () => {
  // What the ru rows actually store: `surah_names.name` REPLACES
  // `surahs.name_translit`, so under a Russian UI the transliteration column
  // is Cyrillic and the English meaning is gone.
  const RU: SurahListItem[] = [
    { id: 1, nameArabic: 'الفاتحة', nameTranslit: 'Фатиха', nameTranslation: 'Открывающая книгу', ayahCount: 7 },
    { id: 2, nameArabic: 'البقرة', nameTranslit: 'Бакара', nameTranslation: 'Корова', ayahCount: 286 },
    { id: 24, nameArabic: 'النور', nameTranslit: 'Нур', nameTranslation: 'Свет', ayahCount: 64 },
    { id: 106, nameArabic: 'قريش', nameTranslit: 'Курайш', nameTranslation: 'Курейшиты', ayahCount: 4 },
  ];
  const ruIds = (query: string) => matchSurahs(RU, query).map((surah) => surah.id);

  it.each(['Бакара', 'бакара', 'бакар'])('finds al-Baqara typed in Cyrillic: %s', (query) => {
    expect(ruIds(query)[0]).toBe(2);
  });

  it('still finds it typed in Latin', () => {
    // The regression this guards: `[^a-z0-9]` empties a Cyrillic name, so
    // BOTH directions died at once -- the Latin query had nothing to match
    // against once the stored name stopped being Latin.
    expect(ruIds('baqara')[0]).toBe(2);
    expect(ruIds('bakara')[0]).toBe(2);
    expect(ruIds('kuraysh')[0]).toBe(106);
  });

  it('finds a surah by its Russian meaning', () => {
    expect(ruIds('корова')).toEqual([2]);
    expect(ruIds('свет')).toEqual([24]);
  });

  it('matches Uzbek Cyrillic through the same letters', () => {
    // `қ` -> `q` is what makes Бақара and Baqarah one name.
    const uzCyrl = [row(RU, 1, { nameTranslit: 'Бақара', nameTranslation: 'Сигир' })];
    expect(matchSurahs(uzCyrl, 'baqara').map((s) => s.id)).toEqual([2]);
    expect(matchSurahs(uzCyrl, 'Бақара').map((s) => s.id)).toEqual([2]);
  });

  it('leaves Latin text alone', () => {
    // latinize runs on every query, including the English ones above, so it
    // has to be the identity outside Cyrillic.
    expect(latinize('Al-Baqarah')).toBe('Al-Baqarah');
    expect(latinize('البقرة')).toBe('البقرة');
    expect(ids('baqara')).toEqual([2]);
  });

  it('still returns nothing for a miss', () => {
    expect(ruIds('ззз')).toEqual([]);
  });
});
