import { describe, expect, it } from 'vitest';

import { pluralCategory } from './plural';
import { strings } from './uiStrings';

describe('pluralCategory', () => {
  it('gives English a singular at exactly one', () => {
    // The bug this exists for: a single bookmark rendered `1 ayahs`, and one
    // bookmark in one surah is the state right after the first tap.
    expect(pluralCategory('en', 1)).toBe('one');
    expect(pluralCategory('en', 0)).toBe('many');
    expect(pluralCategory('en', 2)).toBe('many');
    expect(pluralCategory('en', 11)).toBe('many');
  });

  it('gives Uzbek one form, because a numeral takes no agreement', () => {
    for (const n of [0, 1, 2, 5, 11, 21, 100]) expect(pluralCategory('uz', n)).toBe('one');
  });

  it('splits Russian three ways and keeps the teens out of it', () => {
    // 1/21/31 take the singular but 11 does not; 2-4 take `few` but 12-14 do
    // not. An `=== 1` branch gets 11, 12, 13, 14, 21, 22 and 101 all wrong, so
    // these are the rows that matter.
    expect([1, 21, 31, 101, 1001].map((n) => pluralCategory('ru', n))).toEqual(
      ['one', 'one', 'one', 'one', 'one'],
    );
    expect([2, 3, 4, 22, 23, 24, 104].map((n) => pluralCategory('ru', n))).toEqual(
      ['few', 'few', 'few', 'few', 'few', 'few', 'few'],
    );
    expect([0, 5, 9, 10, 11, 12, 13, 14, 15, 20, 25, 111, 112].map((n) => pluralCategory('ru', n))).toEqual(
      ['many', 'many', 'many', 'many', 'many', 'many', 'many', 'many', 'many', 'many', 'many', 'many', 'many'],
    );
  });

  it('reads the same for a negative or fractional count as its magnitude', () => {
    // Neither reaches the header today, but the function is total and a caller
    // passing a computed count should not fall off the end of the rules.
    expect(pluralCategory('ru', -2)).toBe('few');
    expect(pluralCategory('en', 1.5)).toBe('one');
  });
});

describe('the counted labels each category selects', () => {
  it('renders the real Russian forms the issue asked for', () => {
    const form = (n: number) => strings.ru[`bookmarks.ayahsLabel.${pluralCategory('ru', n)}`];
    expect(form(1)).toBe('аят');
    expect(form(2)).toBe('аята');
    expect(form(5)).toBe('аятов');
    // `2 аятов` was the observed wrong output; make sure it cannot come back.
    expect(form(2)).not.toBe('аятов');
  });

  it('renders the English singular the device run caught', () => {
    expect(strings.en[`bookmarks.ayahsLabel.${pluralCategory('en', 1)}`]).toBe('ayah');
    expect(strings.en[`bookmarks.surahsLabel.${pluralCategory('en', 1)}`]).toBe('surah');
    expect(strings.en[`bookmarks.ayahsLabel.${pluralCategory('en', 3)}`]).toBe('ayahs');
  });
});
