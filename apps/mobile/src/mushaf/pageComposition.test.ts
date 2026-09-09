import { describe, expect, it } from 'vitest';
import { composePage, PAGES_WITH_HEADER_ON_PREVIOUS_PAGE } from './pageComposition';

const w = (surahId: number, ayahNumber: number, position: number) => ({
  surahId,
  ayahNumber,
  position,
  charType: 'word' as const,
  glyph: '',
});

describe('composePage', () => {
  it('passes a full 15-line page through as words', () => {
    const lines = Array.from({ length: 15 }, (_, i) => ({ line: i + 1, words: [w(2, i + 1, 1)] }));
    const slots = composePage(50, lines);
    expect(slots).toHaveLength(15);
    expect(slots.every((s) => s.kind === 'words')).toBe(true);
  });

  it('fills a two-line gap before a surah start with a header and a bismillah', () => {
    // p106: lines 6-7 are missing, and line 8 starts surah 5.
    const lines = [
      { line: 5, words: [w(4, 176, 1)] },
      { line: 8, words: [w(5, 1, 1)] },
    ];
    const slots = composePage(106, lines);
    expect(slots.map((s) => `${s.line}:${s.kind}`)).toEqual([
      '1:blank',
      '2:blank',
      '3:blank',
      '4:blank',
      '5:words',
      '6:header',
      '7:bismillah',
      '8:words',
    ]);
    expect(slots[5]).toMatchObject({ kind: 'header', surahId: 5 });
  });

  it('gives surah 9 a header and no bismillah', () => {
    // p187 line 1 is the only gap, and 187 is not a header-on-previous-page page.
    const slots = composePage(187, [{ line: 2, words: [w(9, 1, 1)] }]);
    expect(slots.map((s) => s.kind)).toEqual(['header', 'words']);
  });

  it('gives a bismillah, not a header, when the band is on the previous page', () => {
    // p77 (surah 4): p76's line 15 carries the band, so p77's one gap is the
    // bismillah. Getting this backwards draws two headers and no bismillah.
    expect(PAGES_WITH_HEADER_ON_PREVIOUS_PAGE.has(77)).toBe(true);
    const slots = composePage(77, [{ line: 2, words: [w(4, 1, 1)] }]);
    expect(slots.map((s) => s.kind)).toEqual(['bismillah', 'words']);
  });

  it('leaves the tail of a short page blank', () => {
    const slots = composePage(1, [
      { line: 2, words: [w(1, 1, 1)] },
      { line: 3, words: [w(1, 2, 1)] },
    ]);
    expect(slots.map((s) => s.kind)).toEqual(['header', 'words', 'words']);
    // Nothing past the last word line: the page's own box centres what exists.
    expect(slots).toHaveLength(3);
  });

  it('draws the next page-s band on line 15 of a page that ends early', () => {
    // p76 ends at line 14; surah 4's band sits on its line 15, which is why
    // p77's own single gap is a bismillah. Without this the band vanishes.
    const lines = Array.from({ length: 14 }, (_, i) => ({ line: i + 1, words: [w(3, i + 1, 1)] }));
    const slots = composePage(76, lines);
    expect(slots).toHaveLength(15);
    expect(slots[14]).toMatchObject({ kind: 'header', line: 15, surahId: 4 });
  });

  it('never emits chrome for a gap that no surah start follows', () => {
    const slots = composePage(50, [
      { line: 1, words: [w(2, 5, 1)] },
      { line: 4, words: [w(2, 6, 1)] },
    ]);
    expect(slots.map((s) => s.kind)).toEqual(['words', 'blank', 'blank', 'words']);
  });
});
