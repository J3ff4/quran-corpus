import { describe, it, expect } from 'vitest';
import { surahNameGlyph } from '../components/reader/ornaments/surahNameGlyph';

describe('surahNameGlyph', () => {
  it('maps surah 1 (Al-Fatiha) to codepoint 0xE001', () => {
    expect(surahNameGlyph(1)).toBe(String.fromCodePoint(0xe001));
  });

  it('maps surah 114 (An-Nas) to codepoint 0xE072', () => {
    expect(surahNameGlyph(114)).toBe(String.fromCodePoint(0xe072));
  });

  it('maps every surah 1-114 to a distinct codepoint in range', () => {
    const glyphs = new Set(Array.from({ length: 114 }, (_, i) => surahNameGlyph(i + 1)));
    expect(glyphs.size).toBe(114);
  });
});
