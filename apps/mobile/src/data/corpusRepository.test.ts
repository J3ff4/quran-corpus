import { describe, expect, it } from 'vitest';
import type { MobileDataClient, MobileRow, SqlValue } from '@quran-corpus/mobile-data';
import { getAyahReaderLocation, getM0WordDetail, getSurahList, getSurahReader } from './corpusRepository';
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
  it('groups ayahs, words, and selected language translations for any surah', async () => {
    const reader = await getSurahReader(createFakeClient(), 2, 'ru');

    expect(reader.surah.id).toBe(2);
    expect(reader.ayahs).toHaveLength(2);
    expect(reader.ayahs[0]?.translation?.language_code).toBe('ru');
    expect(reader.ayahs[0]?.translation?.translator).toBe('Abu Adel');
    expect(reader.ayahs[0]?.words.map((word) => word.position)).toEqual([1, 2]);
  });
});

describe('getAyahReaderLocation', () => {
  it('returns one ayah in reader shape by surah and ayah number', async () => {
    const ayah = await getAyahReaderLocation(createFakeClient(), 2, 1, 'ru');

    expect(ayah?.ayah.ayah_number).toBe(1);
    expect(ayah?.words).toHaveLength(2);
  });
});

function createFakeClient(): MobileDataClient {
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
  const words: MobileRow[] = [
    wordRow({ id: 1001, ayah_id: 101, position: 1, text_arabic: 'بسم' }),
    wordRow({ id: 1002, ayah_id: 101, position: 2, text_arabic: 'الله' }),
    wordRow({ id: 2001, ayah_id: 201, position: 1, text_arabic: 'الم' }),
    wordRow({ id: 2002, ayah_id: 201, position: 2, text_arabic: 'ذلك' }),
    wordRow({ id: 2003, ayah_id: 202, position: 1, text_arabic: 'الكتاب' }),
  ];
  const translations: MobileRow[] = [
    translationRow({ id: 301, ayah_id: 101, language_code: 'uz', translator: 'M0 translator', text: 'Uzbek ayah one' }),
    translationRow({ id: 400, ayah_id: 201, language_code: 'ru', translator: 'Elmir Kuliev', text: 'Wrong Russian ayah one' }),
    translationRow({ id: 401, ayah_id: 201, language_code: 'ru', translator: 'Abu Adel', text: 'Russian ayah one' }),
    translationRow({ id: 402, ayah_id: 202, language_code: 'ru', translator: 'Abu Adel', text: 'Russian ayah two' }),
  ];
  const segments: MobileRow[] = [
    segmentRow({ id: 501, word_id: 1001, segment_index: 1, pos_tag: 'P', form_arabic: 'ب' }),
    segmentRow({ id: 502, word_id: 1001, segment_index: 2, pos_tag: 'N', form_arabic: 'سم' }),
  ];

  return {
    async execute(statement) {
      const sql = typeof statement === 'string' ? statement : statement.sql;
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
      if (sql.includes('FROM words w')) {
        const [surahId] = args;
        const ayahIds = new Set(ayahs.filter((ayah) => ayah['surah_id'] === surahId).map((ayah) => ayah['id']));
        return { rows: words.filter((word) => ayahIds.has(word['ayah_id'])) };
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
      if (sql.includes('FROM words WHERE id')) {
        return { rows: words.filter((word) => word['id'] === args[0]) };
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
