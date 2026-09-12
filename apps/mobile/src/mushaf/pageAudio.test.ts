import { describe, expect, it } from 'vitest';

import { ayahOnPage, firstAyahOnPage } from './pageAudio';

describe('firstAyahOnPage', () => {
  it('skips the tail carried over from the previous page', () => {
    // Page opens mid-2:25 -- its words start at position 40 -- and 2:26 is the
    // first thing that actually begins here. Starting on the tail would play an
    // ayah whose opening is on the page before.
    const lines = [
      { words: [{ surahId: 2, ayahNumber: 25, position: 40 }] },
      { words: [{ surahId: 2, ayahNumber: 26, position: 1 }] },
    ];
    expect(firstAyahOnPage(lines)).toEqual({ surahId: 2, ayahNumber: 26 });
  });

  it('answers null on a page that begins nothing', () => {
    // 2:282 alone fills more than a page. There is no ayah to start.
    const lines = [{ words: [{ surahId: 2, ayahNumber: 282, position: 60 }] }];
    expect(firstAyahOnPage(lines)).toBeNull();
  });

  it('finds a surah that begins part-way down the page', () => {
    // 17 surahs are never any page's opener (see pageJump). A rule keyed on the
    // page's startSurahId misses every one of them.
    const lines = [
      { words: [{ surahId: 93, ayahNumber: 11, position: 3 }] },
      { words: [{ surahId: 94, ayahNumber: 1, position: 1 }] },
    ];
    expect(firstAyahOnPage(lines)).toEqual({ surahId: 94, ayahNumber: 1 });
  });

  it('takes the first opener on the page, not the last', () => {
    // A page of short ayahs begins a dozen of them; play starts at the top.
    const lines = [
      { words: [{ surahId: 114, ayahNumber: 1, position: 1 }] },
      { words: [{ surahId: 114, ayahNumber: 2, position: 1 }] },
    ];
    expect(firstAyahOnPage(lines)).toEqual({ surahId: 114, ayahNumber: 1 });
  });

  it('answers null on an empty page', () => {
    expect(firstAyahOnPage([])).toBeNull();
  });
});

describe('ayahOnPage', () => {
  it('finds an ayah printed only as a carried-over tail', () => {
    // The playhead has not left the page just because the ayah began on the
    // page before -- its words are still on screen, and still being read.
    const lines = [{ words: [{ surahId: 2, ayahNumber: 25, position: 40 }] }];
    expect(ayahOnPage(lines, { surahId: 2, ayahNumber: 25 })).toBe(true);
  });

  it('does not match the same ayah number in another surah', () => {
    // 93:1 and 94:1 sit on the same page. Matching on ayahNumber alone would
    // call the playhead home on a page it has left.
    const lines = [{ words: [{ surahId: 94, ayahNumber: 1, position: 1 }] }];
    expect(ayahOnPage(lines, { surahId: 93, ayahNumber: 1 })).toBe(false);
  });

  it('says no when the playhead has run off the page', () => {
    const lines = [{ words: [{ surahId: 2, ayahNumber: 26, position: 1 }] }];
    expect(ayahOnPage(lines, { surahId: 2, ayahNumber: 27 })).toBe(false);
  });
});
