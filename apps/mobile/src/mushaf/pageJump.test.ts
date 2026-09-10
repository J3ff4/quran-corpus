import { describe, expect, it } from 'vitest';
import type { PageEntry } from '@quran-corpus/data/mobile';

import { pageForAyah, pageForJump } from './pageJump';

const entry = (
  page: number,
  startSurahId: number,
  juz: number | null,
  startAyahNumber = 1,
): [number, PageEntry] => [page, { page, startSurahId, startAyahNumber, surahName: '', juz }];

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

  it('reaches a surah that opens part-way down a page, and never opens one', () => {
    // 17 surahs are never any page's opener -- 81, 85, 91, 93, 95, 97, 99,
    // 101, 102, 104, 105, 107, 108, 110, 111, 113 and 114 in the corpus --
    // because a page's `startSurahId` names the surah of its FIRST ayah.
    // Matching on that left "Go to -> Surah" silently dead for all of them.
    const spread = new Map([entry(1, 1, 1), entry(603, 105, 30), entry(604, 112, 30)]);

    // 106 through 111 are all printed on 603. It has to be reachable.
    expect(pageForJump(spread, 'surah', 108)).toBe(603);
    expect(pageForJump(spread, 'surah', 114)).toBe(604);
    // And the ones that DO open a page still land on their own page, not the
    // one before it.
    expect(pageForJump(spread, 'surah', 112)).toBe(604);
  });

  it('answers null for a juz the index cannot name, and for a surah before its first page', () => {
    expect(pageForJump(pages, 'juz', 30)).toBeNull();
    expect(pageForJump(new Map([entry(50, 20, 16)]), 'surah', 2)).toBeNull();
  });
});

describe('pageForAyah', () => {
  const spread = new Map([
    entry(1, 1, 1, 1),
    entry(106, 5, 6, 82),
    entry(107, 5, 7, 90),
    entry(108, 6, 7, 1),
  ]);

  it('takes the page a coordinate falls on, not the page that opens with it', () => {
    // 5:85 is printed on 106 and opens nothing.
    expect(pageForAyah(spread, 5, 85)).toBe(106);
    expect(pageForAyah(spread, 5, 82)).toBe(106);
  });

  it('moves on at the page boundary, on the ayah number and not the surah alone', () => {
    // Both pages open in Al-Ma'idah: a comparison that only looked at the
    // surah would put every ayah of it on whichever page it saw last.
    expect(pageForAyah(spread, 5, 89)).toBe(106);
    expect(pageForAyah(spread, 5, 90)).toBe(107);
    expect(pageForAyah(spread, 6, 1)).toBe(108);
  });

  it('answers null for a coordinate before the first page it knows', () => {
    expect(pageForAyah(new Map([entry(106, 5, 6, 82)]), 5, 81)).toBeNull();
  });
});
