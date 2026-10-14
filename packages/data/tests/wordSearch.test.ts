import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, type Client } from '../src/db.js';
import { runMigrations } from '../src/migrate.js';
import { search } from '../src/queries/search.js';
import { searchWords, WORD_HIT_LIMIT } from '../src/queries/wordSearch.js';
import type { WordHit } from '../src/types.js';

const M = (s: string) => `\u0002${s}\u0003`;

let db: Client;
beforeEach(async () => {
  db = createDatabase('file::memory:');
  await runMigrations(db);
  await db.execute("INSERT INTO surahs VALUES (1,'الفاتحة','Al-Fatiha','The Opener','meccan',7,1)");
  for (const n of [1, 2, 3]) {
    await db.execute({
      sql: "INSERT INTO ayahs (id,surah_id,ayah_number,text_uthmani) VALUES (?,1,?,'بِسْمِ')",
      args: [n, n],
    });
  }
  for (const code of ['en', 'uz', 'uz-Cyrl', 'ru']) {
    await db.execute({ sql: "INSERT INTO languages VALUES (?,?,?,'ltr')", args: [code, code, code] });
  }
  // A verse hit for 'merc', so search() has verses to keep.
  await db.execute(
    "INSERT INTO translations (ayah_id,language_code,translator,text) VALUES (1,'en','T','the mercy of God')",
  );
});

/** One word at ayah 1:`ayah`, with its glosses keyed by language. */
async function word(
  id: number,
  ayah: number,
  position: number,
  text: string,
  lemma: [bw: string, arabic: string] | null,
  glosses: Record<string, string>,
  group: number | null = null,
): Promise<void> {
  await db.execute({
    sql: 'INSERT INTO words (id, ayah_id, position, text_arabic, lemma_buckwalter, lemma) VALUES (?,?,?,?,?,?)',
    args: [id, ayah, position, text, lemma?.[0] ?? null, lemma?.[1] ?? null],
  });
  for (const [lang, gloss] of Object.entries(glosses)) {
    await db.execute({
      sql: 'INSERT INTO word_glosses (word_id, language_code, gloss_text, gloss_group) VALUES (?,?,?,?)',
      args: [id, lang, gloss, group],
    });
  }
}

const hit = (h: Partial<WordHit> & Pick<WordHit, 'arabic' | 'gloss' | 'count'>): WordHit => ({
  lemma_buckwalter: null,
  gloss_lang: null,
  surah_id: 1,
  ayah_number: 1,
  position: 1,
  ...h,
});

const RAHMA: [string, string] = ['raHomap', 'رَحْمَة'];

describe('searchWords', () => {
  it('groups by lemma, counts distinct words, orders by count then key', async () => {
    // Word 10 matches in two languages: one word, counted once.
    await word(10, 1, 1, 'رَحْمَةً', RAHMA, { en: 'mercy', uz: 'mercy' });
    await word(11, 2, 1, 'رَحْمَتِ', RAHMA, { en: 'mercy' });
    await word(12, 2, 2, 'رَحْمَةٌ', RAHMA, { en: 'mercy' });
    await word(13, 3, 1, 'رَحِيمٌ', ['raHiym', 'رَحِيم'], { en: 'merciful' });
    await word(14, 3, 2, 'رَحِيمًا', ['raHiym', 'رَحِيم'], { en: 'merciful' });
    await word(15, 3, 3, 'حَنَانًا', ['Hanaan', 'حَنَان'], { en: 'mercifulness' });
    await word(16, 3, 4, 'حَنَانٍ', ['Hanaan', 'حَنَان'], { en: 'mercifulness' });
    // Lemma-less, tied at 2: SQL yields it first (NULL groups first), its `~` key sorts last.
    await word(17, 3, 5, 'هُوَ', null, { en: 'merchant' });
    await word(18, 3, 6, 'هُوَ', null, { en: 'merchant' });

    expect(await searchWords(db, 'merc', 'en')).toEqual([
      hit({ lemma_buckwalter: 'raHomap', arabic: 'رَحْمَة', gloss: M('mercy'), count: 3 }),
      hit({ lemma_buckwalter: 'Hanaan', arabic: 'حَنَان', gloss: M('mercifulness'), count: 2, ayah_number: 3, position: 3 }),
      hit({ lemma_buckwalter: 'raHiym', arabic: 'رَحِيم', gloss: M('merciful'), count: 2, ayah_number: 3, position: 1 }),
      hit({ arabic: 'هُوَ', gloss: M('merchant'), count: 2, ayah_number: 3, position: 5 }),
    ]);
  });

  it('every word of a span counts', async () => {
    // One phrase gloss on two words (shared gloss_group): each word is its own hit.
    // rayob's two glosses tie at 1; SQL reads 'no doubt' first (U+064D < U+064E), so
    // only the alphabetical tie-break picks 'doubt'.
    await word(20, 1, 1, 'لَا', ['laA', 'لَا'], { en: 'no doubt' }, 1);
    await word(21, 1, 2, 'رَيْبٍ', ['rayob', 'رَيْب'], { en: 'no doubt' }, 1);
    await word(22, 2, 1, 'رَيْبَ', ['rayob', 'رَيْب'], { en: 'doubt' });

    expect(await searchWords(db, 'doubt', 'en')).toEqual([
      hit({ lemma_buckwalter: 'rayob', arabic: 'رَيْب', gloss: M('doubt'), count: 2, position: 2 }),
      hit({ lemma_buckwalter: 'laA', arabic: 'لَا', gloss: `no ${M('doubt')}`, count: 1 }),
    ]);
  });

  it('folds two lemma-less surfaces that differ only in harakat into one row, summed, first = lowest id', async () => {
    // SQL groups 'هو' (id 31) before 'هُوَ' (ids 30, 32): first must still be id 30.
    await word(30, 2, 3, 'هُوَ', null, { en: 'himself' });
    await word(31, 1, 4, 'هو', null, { en: 'himself' });
    await word(32, 3, 3, 'هُوَ', null, { en: 'himself' });

    expect(await searchWords(db, 'himself', 'en')).toEqual([
      hit({ arabic: 'هُوَ', gloss: M('himself'), count: 3, ayah_number: 2, position: 3 }),
    ]);
  });

  it('prefers a content-language gloss and tags nothing', async () => {
    await word(10, 1, 1, 'رَحْمَةً', RAHMA, { en: 'mercy', uz: 'merhamat' });
    await word(11, 2, 1, 'رَحْمَتِ', RAHMA, { en: 'mercy', uz: 'merhamat' });
    await word(12, 2, 2, 'رَحْمَةٌ', RAHMA, { en: 'mercy', uz: 'merhamat' });
    const row = (gloss: string, gloss_lang: string | null) => [
      hit({ lemma_buckwalter: 'raHomap', arabic: 'رَحْمَة', gloss, gloss_lang, count: 3 }),
    ];

    // Equal counts: the content language wins, untagged.
    expect(await searchWords(db, 'mer', 'uz')).toEqual(row(M('merhamat'), null));
    expect(await searchWords(db, 'mer', 'en')).toEqual(row(M('mercy'), null));
    // No ru match: most frequent, tie by gloss ('mercy' < 'merhamat'), tagged.
    expect(await searchWords(db, 'mer', 'ru')).toEqual(row(M('mercy'), 'en'));
    // No content language: everything is tagged.
    expect(await searchWords(db, 'mer')).toEqual(row(M('mercy'), 'en'));
  });

  it('tags a gloss from another language; uz-Cyrl counts as uz', async () => {
    await word(40, 1, 1, 'مِيرَاث', ['miyraAv', 'مِيرَاث'], { 'uz-Cyrl': 'мерос', ru: 'мера' });
    await word(41, 2, 1, 'مِيرَاثُ', ['miyraAv', 'مِيرَاث'], { 'uz-Cyrl': 'мерос' });
    const row = (gloss: string, gloss_lang: string | null) => [
      hit({ lemma_buckwalter: 'miyraAv', arabic: 'مِيرَاث', gloss, gloss_lang, count: 2 }),
    ];

    expect(await searchWords(db, 'мер', 'en')).toEqual(row(M('мерос'), 'uz-Cyrl'));
    expect(await searchWords(db, 'мер', 'uz')).toEqual(row(M('мерос'), null));
    expect(await searchWords(db, 'мер', 'uz-Cyrl')).toEqual(row(M('мерос'), null));
    // The content language beats a more frequent gloss.
    expect(await searchWords(db, 'мер', 'ru')).toEqual(row(M('мера'), null));
  });

  it('returns [] for Arabic, for < 3 chars, for > 100 chars', async () => {
    // Every query below WOULD match this gloss without its guard.
    await word(50, 1, 1, 'هُوَ', null, { en: `al ab الله ${'x'.repeat(101)}` });
    for (const q of ['الله', 'al الله', 'ab', 'x'.repeat(101)]) {
      expect(await searchWords(db, q, 'en')).toEqual([]);
    }
  });

  it('trims the query', async () => {
    await word(10, 1, 1, 'رَحْمَةً', RAHMA, { en: 'mercy' });
    await word(11, 1, 2, 'لِي', null, { en: 'to me' });
    // '  me  ' passes the 3-char floor untrimmed, and FTS would then match 'me'.
    expect(await searchWords(db, '  me  ', 'en')).toEqual([]);
    expect(await searchWords(db, '  merc  ', 'en')).toEqual([
      hit({ lemma_buckwalter: 'raHomap', arabic: 'رَحْمَة', gloss: M('mercy'), count: 1 }),
    ]);
  });

  it('ignores fts syntax', async () => {
    await word(10, 1, 1, 'رَحْمَةً', RAHMA, { en: 'mercy' });
    const mercy = [hit({ lemma_buckwalter: 'raHomap', arabic: 'رَحْمَة', gloss: M('mercy'), count: 1 })];
    // Operators are literal text: punctuation drops out of the phrase, words stay words.
    const cases: [string, WordHit[]][] = [
      ['merc"', mercy],
      ['merc*', mercy],
      ['-merc', mercy],
      ['NEAR(merc)', []], // the phrase "near merc", not a NEAR query
      ['merc OR x', []], // "merc"* AND "OR"* AND "x", not a disjunction
      ['!!!', []],
      ['"""', []],
    ];
    for (const [q, want] of cases) expect(await searchWords(db, q, 'en'), q).toEqual(want);
  });

  it('keeps a row whose key is the empty string', async () => {
    // '' is a key like any other: the IN-lists must test for null, not truthiness.
    await word(60, 1, 1, 'كَلِمَةٌ', ['', 'كَلِمَة'], { en: 'mercy' });
    await word(61, 2, 1, '', null, { en: 'mercy' });
    expect(await searchWords(db, 'merc', 'en')).toEqual([
      hit({ lemma_buckwalter: '', arabic: 'كَلِمَة', gloss: M('mercy'), count: 1 }),
      hit({ arabic: '', gloss: M('mercy'), count: 1, ayah_number: 2 }),
    ]);
  });

  it('breaks a full gloss tie by language', async () => {
    // Same text, count and tier in two languages. SQL emits the uz row first (its word's
    // surface sorts first), so only the language tie-break picks en.
    await word(70, 1, 1, 'بَ', RAHMA, { uz: 'mercy' });
    await word(71, 2, 1, 'تَ', RAHMA, { en: 'mercy' });
    expect(await searchWords(db, 'merc', 'ru')).toEqual([
      hit({ lemma_buckwalter: 'raHomap', arabic: 'رَحْمَة', gloss: M('mercy'), gloss_lang: 'en', count: 2 }),
    ]);
  });

  it('caps at 50', async () => {
    for (let i = 0; i <= WORD_HIT_LIMIT; i += 1) {
      const bw = `L${String(i).padStart(2, '0')}`;
      await word(100 + i, 1, i + 1, 'كَلِمَة', [bw, 'كَلِمَة'], { en: 'mercy' });
    }
    const hits = await searchWords(db, 'merc', 'en');
    expect(WORD_HIT_LIMIT).toBe(50);
    expect(hits).toHaveLength(50);
    // Ties by key: L50, the last key, is the one dropped.
    expect(hits.map((h) => h.lemma_buckwalter)).toEqual(
      Array.from({ length: 50 }, (_, i) => `L${String(i).padStart(2, '0')}`),
    );
    expect(hits[49]).toEqual(
      hit({ lemma_buckwalter: 'L49', arabic: 'كَلِمَة', gloss: M('mercy'), count: 1, position: 50 }),
    );
  });
});

describe('search() with words', () => {
  beforeEach(async () => {
    await word(10, 1, 1, 'رَحْمَةً', RAHMA, { en: 'mercy' });
  });

  it('search() returns words between verses and roots, verses unchanged with or without glossLanguage', async () => {
    const withLang = await search(db, 'merc', { glossLanguage: 'en' });
    const without = await search(db, 'merc');
    expect(Object.keys(withLang)).toEqual(['jump', 'verses', 'words', 'roots']);
    expect(withLang.verses.length).toBeGreaterThan(0);
    expect(withLang.verses).toEqual(without.verses);
    const row = { lemma_buckwalter: 'raHomap', arabic: 'رَحْمَة', gloss: M('mercy'), count: 1 };
    expect(withLang.words).toEqual([hit(row)]);
    expect(without.words).toEqual([hit({ ...row, gloss_lang: 'en' })]);
  });

  it('search() still returns verses when word_gloss_fts is missing', async () => {
    await db.execute('DROP TABLE word_gloss_fts');
    const r = await search(db, 'merc', { glossLanguage: 'en' });
    expect(r.words).toEqual([]);
    expect(r.verses.length).toBeGreaterThan(0);
  });
});
