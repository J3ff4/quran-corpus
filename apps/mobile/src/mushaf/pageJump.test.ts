import { describe, expect, it } from 'vitest';
import type { PageEntry } from '@quran-corpus/data/mobile';

import { pageForJump } from './pageJump';

const entry = (page: number, startSurahId: number, juz: number | null): [number, PageEntry] => [
  page,
  { page, startSurahId, startAyahNumber: 1, surahName: '', juz },
];

// Deliberately out of order: a Map iterates in insertion order, and nothing
// promises the index arrives sorted.
const pages = new Map([entry(108, 5, 6), entry(106, 5, 6), entry(107, 5, 7), entry(1, 1, 1)]);

describe('pageForJump', () => {
  it('takes a page that exists, and refuses one that does not', () => {
    expect(pageForJump(pages, 'page', 106)).toBe(106);
    expect(pageForJump(pages, 'page', 500)).toBeNull();
  });

  it('lands on a surah-s FIRST page, not whichever the index listed first', () => {
    // Al-Ma'idah opens on 106 here and 108 is listed before it. A jump that
    // took iteration order would land two pages into the surah, and only for
    // the surahs that span pages -- which is all the long ones.
    expect(pageForJump(pages, 'surah', 5)).toBe(106);
  });

  it('lands on a juz-s first page', () => {
    expect(pageForJump(pages, 'juz', 6)).toBe(106);
    expect(pageForJump(pages, 'juz', 7)).toBe(107);
  });

  it('answers null for a target the index cannot name', () => {
    expect(pageForJump(pages, 'surah', 99)).toBeNull();
    expect(pageForJump(pages, 'juz', 30)).toBeNull();
  });
});
