import { describe, it, expect } from 'vitest';
import { wordLocation, wordHref } from '../lib/wordLocation';
import type { Ayah, Word } from '@quran-corpus/data';

const ayah = { id: 10, surah_id: 2, ayah_number: 5 } as Ayah;
const word = { id: 1, position: 3 } as Word;

describe('wordLocation', () => {
  it('derives surah/ayah/position', () => {
    expect(wordLocation(ayah, word)).toEqual({ surah: 2, ayah: 5, position: 3 });
  });
  it('builds href', () => {
    expect(wordHref({ surah: 2, ayah: 5, position: 3 })).toBe('/word/2/5/3');
  });
});
