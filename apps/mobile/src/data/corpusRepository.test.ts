import { describe, expect, it } from 'vitest';
import type { MobileDataClient, MobileRow, SqlValue } from '@quran-corpus/mobile-data';
import {
  getAyahReaderLocation,
  getM0WordDetail,
  getRootScreen,
  getSurahGlosses,
  getSurahList,
  getSurahReader,
  getWbwRange,
  getWbwScreen,
  getWordAtLocation,
  getWordsForAyah,
  getWordSummary,
} from './corpusRepository';
import { contentLanguages } from '../i18n/languages';

describe('contentLanguages', () => {
  it('ships English, Uzbek, and Russian in a scalable metadata shape', () => {
    expect(contentLanguages.map((l) => l.code)).toEqual(['en', 'uz', 'ru']);
    expect(contentLanguages.every((l) => l.label.length > 0)).toBe(true);
  });
});

describe('getSurahList', () => {
  it('returns ordered surah list items', async () => {
    const list = await getSurahList(createFakeClient());

    expect(list).toEqual([
      { id: 1, nameArabic: 'الفاتحة', nameTranslit: 'Al-Fatihah', nameTranslation: 'The Opener', ayahCount: 7 },
      { id: 2, nameArabic: 'البقرة', nameTranslit: 'Al-Baqarah', nameTranslation: 'The Cow', ayahCount: 286 },
    ]);
  });
});

describe('getSurahReader', () => {
  it('groups ayahs and selected language translations for any surah', async () => {
    const reader = await getSurahReader(createFakeClient(), 2, 'ru');

    expect(reader.surah.id).toBe(2);
    expect(reader.ayahs).toHaveLength(2);
    expect(reader.ayahs[0]?.translation?.language_code).toBe('ru');
    expect(reader.ayahs[0]?.translation?.translator).toBe('Abu Adel');
  });

  it('reports a bundled DB whose rows use a different translator', async () => {
    // Rows exist for the language, but none by the translator this build
    // selects. Previously every ayah filtered out and the reader showed a
    // blank translation pane with no explanation.
    const client = createFakeClient({ ruTranslator: 'Someone Else' });

    await expect(getSurahReader(client, 2, 'ru')).rejects.toThrow(/No ru translation by/);
  });
});

describe('getAyahReaderLocation', () => {
  it('returns one ayah in reader shape by surah and ayah number', async () => {
    const ayah = await getAyahReaderLocation(createFakeClient(), 2, 1, 'ru');

    expect(ayah?.ayah.ayah_number).toBe(1);
    expect(ayah?.translation?.text).toBe('Russian ayah one');
  });
});

interface FakeClientOptions {
  ruTranslator?: string;
  /** Replace the word fixture wholesale -- used to hand the repository rows in
   *  an order the real ORDER BY would never produce. */
  words?: MobileRow[];
  segments?: MobileRow[];
  glosses?: MobileRow[];
}

function createFakeClient({
  ruTranslator = 'Abu Adel',
  words: wordFixture,
  segments: segmentFixture,
  glosses: glossFixture,
}: FakeClientOptions = {}): MobileDataClient {
  const surahs: MobileRow[] = [
    surahRow({
      id: 1,
      name_arabic: 'الفاتحة',
      name_translit: 'Al-Fatihah',
      name_translation: 'The Opener',
      ayah_count: 7,
    }),
    surahRow({
      id: 2,
      name_arabic: 'البقرة',
      name_translit: 'Al-Baqarah',
      name_translation: 'The Cow',
      ayah_count: 286,
    }),
  ];
  const ayahs: MobileRow[] = [
    ayahRow({ id: 101, surah_id: 1, ayah_number: 1, text_uthmani: 'بسم', text_simple: 'bism' }),
    ayahRow({ id: 102, surah_id: 1, ayah_number: 2, text_uthmani: 'الحمد', text_simple: 'alhamd' }),
    ayahRow({ id: 201, surah_id: 2, ayah_number: 1, text_uthmani: 'الم', text_simple: 'alm' }),
    ayahRow({ id: 202, surah_id: 2, ayah_number: 2, text_uthmani: 'ذلك', text_simple: 'dhalik' }),
  ];
  const words: MobileRow[] = wordFixture ?? [
    wordRow({ id: 1001, ayah_id: 101, position: 1, text_arabic: 'بسم' }),
    wordRow({ id: 1002, ayah_id: 101, position: 2, text_arabic: 'الله' }),
    wordRow({ id: 2001, ayah_id: 201, position: 1, text_arabic: 'الم' }),
    wordRow({ id: 2002, ayah_id: 201, position: 2, text_arabic: 'ذلك' }),
    wordRow({ id: 2003, ayah_id: 202, position: 1, text_arabic: 'الكتاب' }),
  ];
  const translations: MobileRow[] = [
    translationRow({ id: 301, ayah_id: 101, language_code: 'uz', translator: 'M0 translator', text: 'Uzbek ayah one' }),
    translationRow({ id: 400, ayah_id: 201, language_code: 'ru', translator: 'Elmir Kuliev', text: 'Wrong Russian ayah one' }),
    translationRow({ id: 401, ayah_id: 201, language_code: 'ru', translator: ruTranslator, text: 'Russian ayah one' }),
    translationRow({ id: 402, ayah_id: 202, language_code: 'ru', translator: ruTranslator, text: 'Russian ayah two' }),
  ];
  const segments: MobileRow[] = segmentFixture ?? [
    segmentRow({ id: 501, word_id: 1001, segment_index: 1, pos_tag: 'P', form_arabic: 'ب' }),
    segmentRow({ id: 502, word_id: 1001, segment_index: 2, pos_tag: 'N', form_arabic: 'سم' }),
    segmentRow({ id: 503, word_id: 2001, segment_index: 1, pos_tag: 'N', form_arabic: 'ال' }),
    segmentRow({ id: 504, word_id: 2001, segment_index: 2, pos_tag: 'N', form_arabic: 'م' }),
    segmentRow({ id: 505, word_id: 2002, segment_index: 1, pos_tag: 'DEM', form_arabic: 'ذلك' }),
  ];
  const glosses: MobileRow[] = glossFixture ?? [
    { id: 701, word_id: 2001, language_code: 'en', gloss_text: 'Alif Lam Meem' },
    { id: 702, word_id: 2002, language_code: 'en', gloss_text: 'that' },
    { id: 703, word_id: 2002, language_code: 'ru', gloss_text: 'это' },
  ];
  const roots: MobileRow[] = [{ id: 7, root_buckwalter: 'rHm', root_arabic: 'رحم', occurrence_count: 339 }];
  const rootForms: MobileRow[] = [
    {
      id: 11,
      root_id: 7,
      sort_order: 1,
      pos_label: 'noun',
      form_arabic: 'رَحْمَة',
      form_translit: 'raHmap',
      gloss: 'mercy',
      occurrence_count: 114,
    },
  ];
  const rootDefinitions: MobileRow[] = [
    { id: 21, root_id: 7, source: 'hanswehr', definition: 'to have mercy' },
  ];

  return {
    async execute(statement) {
      // Normalized, and matched on WHERE predicates rather than table aliases.
      // The shared queries are authored as indented template literals, so
      // matching raw text couples this fake to their line breaks; and the
      // word-detail query ('FROM words WHERE id = ?') differs from the
      // surah-words query ('FROM words w JOIN ...') only by the alias, so an
      // alias match routed a word ID into the surah branch as soon as either
      // query was reformatted.
      const rawSql = typeof statement === 'string' ? statement : statement.sql;
      const sql = rawSql.replace(/\s+/g, ' ').trim();
      const args = typeof statement === 'string' ? [] : (statement.args ?? []);

      if (sql.includes('FROM surahs ORDER BY id')) {
        return { rows: surahs };
      }
      if (sql.includes('FROM surahs WHERE id')) {
        return { rows: surahs.filter((surah) => surah['id'] === args[0]) };
      }
      if (sql.includes('FROM ayahs WHERE surah_id')) {
        return { rows: ayahs.filter((ayah) => ayah['surah_id'] === args[0]) };
      }
      if (sql.includes('FROM words WHERE id = ?')) {
        return { rows: words.filter((word) => word['id'] === args[0]) };
      }
      // Tripwire, not a stub: the whole-surah word fetch is 6116 rows for
      // al-Baqarah that no screen reads, and it was the heaviest work on the
      // reader's open path. Any test that opens a reader fails if it returns.
      // Matched through ORDER BY so the ayah-range query -- same table, same
      // join, the on-demand fetch word-by-word display will use -- is not
      // caught by this too.
      if (sql.includes('FROM words w JOIN ayahs a') && sql.includes('WHERE a.surah_id = ? ORDER BY')) {
        throw new Error('Reader must not fetch every word of a surah; nothing renders them');
      }
      // Deliberately unsorted, even though the real query ends in ORDER BY
      // position: the repository sorts again because alignAyahTokens maps
      // tokens to words by array index, and a wrong order renders perfectly
      // while showing every word the next word's grammar. Returning the
      // fixture as-is is what puts that second sort under test.
      if (sql.includes('FROM words WHERE ayah_id = ?')) {
        return { rows: words.filter((word) => word['ayah_id'] === args[0]) };
      }
      if (sql.includes('FROM words w JOIN ayahs a') && sql.includes('a.ayah_number BETWEEN')) {
        const [surahId, lo, hi] = args;
        const inRange = ayahs.filter(
          (ayah) =>
            ayah['surah_id'] === surahId &&
            (ayah['ayah_number'] as number) >= (lo as number) &&
            (ayah['ayah_number'] as number) <= (hi as number),
        );
        const numberById = new Map(inRange.map((ayah) => [ayah['id'], ayah['ayah_number'] as number]));
        // Fixture order, not ORDER BY order -- same reasoning as the per-ayah
        // branch above. getWbwRange groups these into pages itself, and both
        // its sorts are invisible if the fake hands them back pre-sorted.
        return { rows: words.filter((word) => numberById.has(word['ayah_id'])) };
      }
      if (sql.includes('FROM words w JOIN ayahs a') && sql.includes('w.position = ?')) {
        const [surahId, ayahNumber, position] = args;
        const ayah = ayahs.find(
          (row) => row['surah_id'] === surahId && row['ayah_number'] === ayahNumber,
        );
        return {
          rows: words.filter(
            (word) => ayah !== undefined && word['ayah_id'] === ayah['id'] && word['position'] === position,
          ),
        };
      }
      // COALESCE(pref, fallback) per word, mirroring getGlossesWithFallback --
      // args are [lang, fallback, lang, fallback, surahId].
      if (sql.includes('word_glosses')) {
        const [lang, fallback, , , surahId] = args;
        const ayahIds = new Set(ayahs.filter((ayah) => ayah['surah_id'] === surahId).map((ayah) => ayah['id']));
        const rows: MobileRow[] = [];
        for (const word of words) {
          if (!ayahIds.has(word['ayah_id'])) continue;
          const pref = glosses.find((g) => g['word_id'] === word['id'] && g['language_code'] === lang);
          const fb = glosses.find((g) => g['word_id'] === word['id'] && g['language_code'] === fallback);
          const chosen = pref ?? fb;
          if (!chosen) continue;
          rows.push({
            word_id: word['id'] as SqlValue,
            gloss_text: chosen['gloss_text'] as SqlValue,
            gloss_lang: (pref ? lang : fallback) as SqlValue,
          });
        }
        return { rows };
      }
      if (sql.includes('FROM roots WHERE root_buckwalter')) {
        return { rows: roots.filter((root) => root['root_buckwalter'] === args[0]) };
      }
      if (sql.includes('FROM root_forms')) {
        return { rows: rootForms.filter((form) => form['root_id'] === args[0]) };
      }
      if (sql.includes('FROM root_definitions')) {
        return { rows: rootDefinitions.filter((definition) => definition['root_id'] === args[0]) };
      }
      if (sql.includes('FROM translations t')) {
        const [surahId, languageCode] = args;
        const ayahIds = new Set(ayahs.filter((ayah) => ayah['surah_id'] === surahId).map((ayah) => ayah['id']));
        return {
          rows: translations.filter(
            (row) => ayahIds.has(row['ayah_id']) && row['language_code'] === languageCode,
          ),
        };
      }
      if (sql.includes('FROM word_segments WHERE word_id IN')) {
        return { rows: segments.filter((segment) => args.includes(segment['word_id'] as SqlValue)) };
      }
      if (sql.includes('FROM word_segments WHERE word_id')) {
        return { rows: segments.filter((segment) => segment['word_id'] === args[0]) };
      }
      if (sql.includes('FROM word_concept_tags')) {
        return {
          rows: [
            {
              id: 601,
              word_id: 1001,
              tag_label: 'divine-name',
              tag_type: 'concept',
            },
          ],
        };
      }

      throw new Error(`Unhandled SQL in fake client: ${sql}`);
    },
  };
}

function surahRow(
  overrides: Pick<MobileRow, 'id' | 'name_arabic' | 'name_translit' | 'name_translation' | 'ayah_count'>,
): MobileRow {
  return {
    revelation_type: 'meccan',
    order_number: overrides.id,
    ...overrides,
  };
}

function ayahRow(
  overrides: Pick<MobileRow, 'id' | 'surah_id' | 'ayah_number' | 'text_uthmani' | 'text_simple'>,
): MobileRow {
  return {
    juz: 1,
    page: 1,
    audio_url: null,
    ...overrides,
  };
}

function translationRow(
  overrides: Pick<MobileRow, 'id' | 'ayah_id' | 'language_code' | 'translator' | 'text'>,
): MobileRow {
  return overrides;
}

function wordRow(overrides: Pick<MobileRow, 'id' | 'ayah_id' | 'position' | 'text_arabic'>): MobileRow {
  return {
    transliteration: null,
    root: null,
    lemma: null,
    root_buckwalter: null,
    lemma_buckwalter: null,
    pos_tag: null,
    morphology_json: null,
    morphology_description: null,
    grammar_arabic: null,
    grammar_note: null,
    audio_url: null,
    ...overrides,
  };
}

function segmentRow(
  overrides: Pick<MobileRow, 'id' | 'word_id' | 'segment_index' | 'pos_tag' | 'form_arabic'>,
): MobileRow {
  return {
    segment_type: null,
    form_buckwalter: null,
    features_json: null,
    lemma: null,
    root: null,
    ...overrides,
  };
}

describe('getWordsForAyah', () => {
  it('returns the ayah words in position order', async () => {
    // The reader aligns these to Uthmani tokens by array index, so an
    // out-of-order list attaches every word's morphology to the wrong word --
    // and the result still renders, which is what makes it worth asserting.
    const client = createFakeClient({
      words: [
        wordRow({ id: 3, ayah_id: 101, position: 3, text_arabic: 'ج' }),
        wordRow({ id: 1, ayah_id: 101, position: 1, text_arabic: 'أ' }),
        wordRow({ id: 2, ayah_id: 101, position: 2, text_arabic: 'ب' }),
      ],
    });

    expect((await getWordsForAyah(client, 101)).map((word) => word.position)).toEqual([1, 2, 3]);
  });

  it('returns an empty list for an ayah with no word rows', async () => {
    // Not an error: the caller falls back to the raw Uthmani text.
    expect(await getWordsForAyah(createFakeClient(), 102)).toEqual([]);
  });
});

describe('getSurahGlosses', () => {
  it('keys the glosses by word id, reading gloss_text', async () => {
    // getGlossesWithFallback returns GlossWithLang, whose column is
    // `gloss_text`. Reading `.text` yields undefined for every word and the
    // sheet shows "no translation" for the entire corpus -- with no error.
    const glosses = await getSurahGlosses(createFakeClient(), 2, 'en');

    expect(glosses.get(2002)).toBe('that');
    expect(glosses.size).toBeGreaterThan(0);
    expect([...glosses.values()].every((value) => typeof value === 'string')).toBe(true);
  });

  it('prefers the requested language over the English fallback', async () => {
    expect((await getSurahGlosses(createFakeClient(), 2, 'ru')).get(2002)).toBe('это');
  });

  it('returns an empty map for a surah with no glosses at all', async () => {
    expect((await getSurahGlosses(createFakeClient({ glosses: [] }), 2, 'ru')).size).toBe(0);
  });
});

describe('getWordSummary', () => {
  it('bundles the word, its segments and the gloss it was given', async () => {
    const client = createFakeClient();
    const [word] = await getWordsForAyah(client, 201);

    const summary = await getWordSummary(client, word!, 'Alif Lam Meem');

    expect(summary.word.id).toBe(2001);
    expect(summary.segments).toHaveLength(2);
    expect(summary.gloss).toBe('Alif Lam Meem');
  });

  it('returns the segments in segment_index order', async () => {
    // The sheet renders pills left to right in array order; a prefix rendered
    // after its stem misdescribes the word's structure.
    const client = createFakeClient({
      segments: [
        segmentRow({ id: 504, word_id: 2001, segment_index: 2, pos_tag: 'N', form_arabic: 'م' }),
        segmentRow({ id: 503, word_id: 2001, segment_index: 1, pos_tag: 'N', form_arabic: 'ال' }),
      ],
    });
    const [word] = await getWordsForAyah(client, 201);

    const summary = await getWordSummary(client, word!, null);

    expect(summary.segments.map((segment) => segment.segment_index)).toEqual([1, 2]);
  });

  it('still returns the morphology when there is no gloss', async () => {
    // Plenty of words have no gloss in a given language. Refusing to build a
    // summary would make the sheet decline to open on those words, hiding the
    // morphology too -- which is the part that always exists.
    const client = createFakeClient();
    const [word] = await getWordsForAyah(client, 201);

    const summary = await getWordSummary(client, word!, null);

    expect(summary.gloss).toBeNull();
    expect(summary.segments).toHaveLength(2);
  });
});

describe('getWordAtLocation', () => {
  it('resolves a surah:ayah:position triple to that word', async () => {
    // The word-detail route is reached by coordinates from a deep link; the
    // sheet reaches the same word by holding the Word object. Both must land
    // on the same row.
    const byLocation = await getWordAtLocation(createFakeClient(), 2, 1, 1, 'en');

    expect(byLocation!.word.id).toBe(2001);
    expect(byLocation!.segments).toHaveLength(2);
    expect(byLocation!.gloss).toBe('Alif Lam Meem');
  });

  it('returns null for coordinates that do not exist', async () => {
    expect(await getWordAtLocation(createFakeClient(), 2, 1, 99, 'en')).toBeNull();
  });
});

describe('getWbwRange', () => {
  it('groups words by ayah and attaches each word its own segments', async () => {
    const pages = await getWbwRange(createFakeClient(), 2, 1, 2);

    expect(pages.map((page) => page.ayahNumber)).toEqual([1, 2]);
    expect(pages[0]!.words.map((word) => word.id)).toEqual([2001, 2002]);
    // One batched segment query for the whole range, fanned back out by
    // word_id. Attaching every segment to every word renders a plausible-
    // looking grid with the wrong grammar on every cell.
    expect(pages[0]!.segments.get(2001)).toHaveLength(2);
    expect(pages[0]!.segments.get(2002)).toHaveLength(1);
  });

  it('orders pages by ayah and words by position whatever order the rows arrive in', async () => {
    // The grid is read top to bottom, so a page order taken from Map insertion
    // order rather than the ayah number puts ayah 2 above ayah 1 -- correct
    // content, wrong sequence, and nothing about it looks broken.
    const client = createFakeClient({
      words: [
        wordRow({ id: 2003, ayah_id: 202, position: 1, text_arabic: 'الكتاب' }),
        wordRow({ id: 2002, ayah_id: 201, position: 2, text_arabic: 'ذلك' }),
        wordRow({ id: 2001, ayah_id: 201, position: 1, text_arabic: 'الم' }),
      ],
    });

    const pages = await getWbwRange(client, 2, 1, 2);

    expect(pages.map((page) => page.ayahNumber)).toEqual([1, 2]);
    expect(pages[0]!.words.map((word) => word.id)).toEqual([2001, 2002]);
  });

  it("scopes each page's segment map to that page's own words", async () => {
    // The segments are fetched once for the whole range, so the obvious
    // implementation hands every page the same map. Lookups still work --
    // word_id is unique across the corpus -- but anything that iterates
    // `page.segments` reads the neighbouring ayahs' grammar as this ayah's.
    const pages = await getWbwRange(createFakeClient(), 2, 1, 2);

    expect([...pages[0]!.segments.keys()]).toEqual([2001, 2002]);
    expect([...pages[1]!.segments.keys()]).toEqual([2003]);
  });

  it('returns an empty list for a range with no ayahs', async () => {
    expect(await getWbwRange(createFakeClient(), 2, 900, 910)).toEqual([]);
  });
});

describe('getWbwScreen', () => {
  it('returns the surah alongside the range it served', async () => {
    const screen = await getWbwScreen(createFakeClient(), 2, 1);

    // ayah_count is what bounds the pager, so a screen that renders without it
    // offers a next page past the end of the surah.
    expect(screen.surah.ayah_count).toBe(286);
    expect([screen.from, screen.to]).toEqual([1, 10]);
    expect(screen.pages.map((page) => page.ayahNumber)).toEqual([1, 2]);
  });

  it('clamps a start past the end of the surah', async () => {
    // parseAyahNumber caps at 286 -- al-Baqarah's length -- so `/surah/1/words
    // ?from=200` is a link a user can actually follow. Unclamped it queries
    // ayahs 200-209 of al-Fatihah and renders an empty screen with a pager
    // that cannot get back.
    const screen = await getWbwScreen(createFakeClient(), 1, 200);

    expect([screen.from, screen.to]).toEqual([7, 7]);
  });

  it('rejects for a surah that is not in the bundled DB', async () => {
    await expect(getWbwScreen(createFakeClient(), 99, 1)).rejects.toThrow(/Surah not found/);
  });
});

describe('getRootScreen', () => {
  it('returns the root with its forms and definitions', async () => {
    const entry = await getRootScreen(createFakeClient(), 'rHm');

    expect(entry!.root.root_buckwalter).toBe('rHm');
    expect(entry!.forms.length).toBeGreaterThan(0);
    expect(entry!.definitions.length).toBeGreaterThan(0);
  });

  it('returns null for a root the corpus does not carry', async () => {
    // The sheet's root link is only rendered when the word HAS a root, but a
    // hand-typed deep link can carry anything.
    expect(await getRootScreen(createFakeClient(), 'zzz')).toBeNull();
  });
});

describe('getM0WordDetail', () => {
  it('returns the word detail and its ordered segments', async () => {
    const detail = await getM0WordDetail(createFakeClient(), 1001);

    expect(detail.detail?.word).toEqual(
      expect.objectContaining({ id: 1001, ayah_id: 101, position: 1, text_arabic: 'بسم' }),
    );
    expect(detail.detail?.segments).toEqual([
      expect.objectContaining({ id: 501, word_id: 1001, segment_index: 1, pos_tag: 'P' }),
      expect.objectContaining({ id: 502, word_id: 1001, segment_index: 2, pos_tag: 'N' }),
    ]);
    expect(detail.detail?.concept_tags).toEqual([
      { id: 601, word_id: 1001, tag_label: 'divine-name', tag_type: 'concept' },
    ]);
    expect(detail.segments).toEqual([
      expect.objectContaining({ id: 501, word_id: 1001, segment_index: 1, pos_tag: 'P' }),
      expect.objectContaining({ id: 502, word_id: 1001, segment_index: 2, pos_tag: 'N' }),
    ]);
  });
});
