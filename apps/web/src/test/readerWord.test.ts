import { describe, expect, it } from 'vitest';
import type { Word } from '@quran-corpus/data/client';
import { toReaderWord } from '../lib/readerWord';

// Every key of a corpus `Word`, so a column added to the row shows up here as a
// failure rather than silently riding into the reader's payload.
const full: Word = {
  id: 1,
  ayah_id: 2,
  position: 3,
  text_arabic: 'بِسْمِ',
  transliteration: 'bismi',
  root: 'سمو',
  lemma: 'ٱسْم',
  root_buckwalter: 'smw',
  lemma_buckwalter: 'Aism',
  pos_tag: 'N',
  morphology_json: '["P","N"]',
  morphology_description: 'prefixed preposition bi + noun',
  grammar_arabic: 'جار ومجرور',
  grammar_note: 'PREFIXED PREPOSITION',
  audio_url: 'https://example.invalid/1.mp3',
};

describe('toReaderWord', () => {
  it('carries exactly the fields the reader renders', () => {
    // The assertion is the KEY SET, not the values: this is a payload guard, so
    // what matters is that nothing extra survives the projection. On surah 2 the
    // dropped columns are 1.74 MB of the 2.00 MB words payload, and
    // morphology_description alone is 1.33 MB of it.
    expect(Object.keys(toReaderWord(full)).sort()).toEqual([
      'ayah_id',
      'id',
      'lemma',
      'pos_tag',
      'position',
      'root',
      'text_arabic',
      'transliteration',
    ]);
  });

  it('drops the prose columns the reader has no code path to render', () => {
    // Named one by one rather than left to the key-set check above, so a
    // reviewer can see WHICH fields this phase decided the reader does not
    // need. MorphologySummary -- the popover's whole body -- reads
    // transliteration, pos_tag, root and lemma; the prose lives on /word/...,
    // which fetches its own row.
    const projected = toReaderWord(full) as Record<string, unknown>;
    for (const dropped of [
      'morphology_description',
      'grammar_note',
      'grammar_arabic',
      'morphology_json',
      'root_buckwalter',
      'lemma_buckwalter',
      'audio_url',
    ]) {
      expect(projected[dropped]).toBeUndefined();
    }
  });

  it('keeps the values intact, not just the keys', () => {
    // A projection that returned the right keys with null values would satisfy
    // the checks above and render an empty reader.
    expect(toReaderWord(full)).toEqual({
      id: 1,
      ayah_id: 2,
      position: 3,
      text_arabic: 'بِسْمِ',
      transliteration: 'bismi',
      root: 'سمو',
      lemma: 'ٱسْم',
      pos_tag: 'N',
    });
  });
});
