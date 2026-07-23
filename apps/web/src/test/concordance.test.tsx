import { describe, it, expect } from 'vitest';
import { verseRef, concordanceHref } from '../lib/concordance';
import type { ConcordanceEntry } from '@quran-corpus/data';

const e = {
  surah_id: 2,
  ayah_number: 79,
  position: 3,
  word_id: 5,
  text_arabic: 'يَكْتُبُونَ',
  transliteration: 'yaktubūna',
  gloss: 'they write',
  form_id: null,
  verse_words: [],
} as ConcordanceEntry;

describe('concordance helpers', () => {
  it('verseRef', () => expect(verseRef(e)).toBe('2:79:3'));
  it('concordanceHref', () => expect(concordanceHref(e)).toBe('/word/2/79/3'));
});
