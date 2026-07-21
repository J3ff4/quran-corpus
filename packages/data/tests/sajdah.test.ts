import { describe, it, expect } from 'vitest';
import { isSajdahAyah } from '../src/text/sajdah.js';

describe('isSajdahAyah', () => {
  it('true when the Uthmani text contains the sajdah mark', () => {
    expect(isSajdahAyah('فَٱسْجُدُوا۟ لِلَّهِ وَٱعْبُدُوا۟ ۩')).toBe(true);
  });

  it('false when the text has no sajdah mark', () => {
    expect(isSajdahAyah('بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ')).toBe(false);
  });

  it('false for an empty string', () => {
    expect(isSajdahAyah('')).toBe(false);
  });
});
