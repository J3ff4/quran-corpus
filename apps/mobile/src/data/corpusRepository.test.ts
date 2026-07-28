import { describe, expect, it } from 'vitest';
import type { MobileDataClient, MobileRow, SqlValue } from '@quran-corpus/mobile-data';
import { getM0SurahReader, getM0WordDetail } from './corpusRepository';
import { contentLanguages } from '../i18n/languages';

describe('contentLanguages', () => {
  it('ships English, Uzbek, and Russian in a scalable metadata shape', () => {
    expect(contentLanguages.map((l) => l.code)).toEqual(['en', 'uz', 'ru']);
    expect(contentLanguages.every((l) => l.label.length > 0)).toBe(true);
  });
});

function createFakeClient(): MobileDataClient {
  const ayahs: MobileRow[] = [
    {
      id: 101,
      surah_id: 1,
      ayah_number: 1,
      text_uthmani: 'بسم',
      text_simple: 'bism',
      juz: 1,
      page: 1,
      audio_url: null,
    },
    {
      id: 102,
      surah_id: 1,
      ayah_number: 2,
      text_uthmani: 'الحمد',
      text_simple: 'alhamd',
      juz: 1,
      page: 1,
      audio_url: null,
    },
  ];
  const words: MobileRow[] = [
    wordRow({ id: 1001, ayah_id: 101, position: 1, text_arabic: 'بسم' }),
    wordRow({ id: 1002, ayah_id: 101, position: 2, text_arabic: 'الله' }),
    wordRow({ id: 2001, ayah_id: 102, position: 1, text_arabic: 'الحمد' }),
  ];
  const translations: MobileRow[] = [
    {
      id: 301,
      ayah_id: 101,
      language_code: 'uz',
      translator: 'M0 translator',
      text: 'Uzbek ayah one',
    },
  ];
  const segments: MobileRow[] = [
    segmentRow({ id: 401, word_id: 1001, segment_index: 1, pos_tag: 'P', form_arabic: 'ب' }),
    segmentRow({ id: 402, word_id: 1001, segment_index: 2, pos_tag: 'N', form_arabic: 'سم' }),
  ];

  return {
    async execute(statement) {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      const args = typeof statement === 'string' ? [] : (statement.args ?? []);

      if (sql.includes('FROM ayahs WHERE surah_id')) {
        return { rows: ayahs.filter((ayah) => ayah['surah_id'] === args[0]) };
      }
      if (sql.includes('FROM words w')) {
        return { rows: words };
      }
      if (sql.includes('FROM translations t')) {
        const [surahId, languageCode] = args;
        return {
          rows: surahId === 1 ? translations.filter((row) => row['language_code'] === languageCode) : [],
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
              id: 501,
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

describe('getM0SurahReader', () => {
  it('groups Surah 1 translations and words under each ayah', async () => {
    const reader = await getM0SurahReader(createFakeClient(), 'uz');

    expect(reader).toEqual({
      surahId: 1,
      ayahs: [
        {
          ayah: {
            id: 101,
            surah_id: 1,
            ayah_number: 1,
            text_uthmani: 'بسم',
            text_simple: 'bism',
            juz: 1,
            page: 1,
            audio_url: null,
          },
          translation: {
            id: 301,
            ayah_id: 101,
            language_code: 'uz',
            translator: 'M0 translator',
            text: 'Uzbek ayah one',
          },
          words: [
            expect.objectContaining({ id: 1001, ayah_id: 101, position: 1, text_arabic: 'بسم' }),
            expect.objectContaining({ id: 1002, ayah_id: 101, position: 2, text_arabic: 'الله' }),
          ],
        },
        {
          ayah: {
            id: 102,
            surah_id: 1,
            ayah_number: 2,
            text_uthmani: 'الحمد',
            text_simple: 'alhamd',
            juz: 1,
            page: 1,
            audio_url: null,
          },
          translation: null,
          words: [expect.objectContaining({ id: 2001, ayah_id: 102, position: 1, text_arabic: 'الحمد' })],
        },
      ],
    });
  });
});

describe('getM0WordDetail', () => {
  it('returns the word detail and its ordered segments', async () => {
    const detail = await getM0WordDetail(createFakeClient(), 1001);

    expect(detail.detail?.word).toEqual(
      expect.objectContaining({ id: 1001, ayah_id: 101, position: 1, text_arabic: 'بسم' }),
    );
    expect(detail.detail?.segments).toEqual([
      expect.objectContaining({ id: 401, word_id: 1001, segment_index: 1, pos_tag: 'P' }),
      expect.objectContaining({ id: 402, word_id: 1001, segment_index: 2, pos_tag: 'N' }),
    ]);
    expect(detail.detail?.concept_tags).toEqual([
      { id: 501, word_id: 1001, tag_label: 'divine-name', tag_type: 'concept' },
    ]);
    expect(detail.segments).toEqual([
      expect.objectContaining({ id: 401, word_id: 1001, segment_index: 1, pos_tag: 'P' }),
      expect.objectContaining({ id: 402, word_id: 1001, segment_index: 2, pos_tag: 'N' }),
    ]);
  });
});
