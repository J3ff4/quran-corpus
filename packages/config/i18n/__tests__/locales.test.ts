import { describe, it, expect } from 'vitest';
import { contentLanguages, isUiLocale, uiLocales } from '../locales';

describe('uiLocales', () => {
  it('lists the three interface locales', () => {
    expect(uiLocales.map((locale) => locale.code)).toEqual(['en', 'uz', 'ru']);
  });
});

describe('contentLanguages', () => {
  it('holds only the languages a reader may PICK, never the composed uz-Cyrl', () => {
    // uz-Cyrl is reachable by choosing Uzbek and then Cyrillic -- it is a
    // rendering of Uzbek, not a fourth language to select. Widening this list
    // would put it in the settings picker as a peer of Uzbek.
    expect(contentLanguages.map((language) => language.code)).toEqual(['en', 'uz', 'ru']);
  });
});

describe('isUiLocale', () => {
  it('accepts the three locales', () => {
    expect(['en', 'uz', 'ru'].every(isUiLocale)).toBe(true);
  });

  it('rejects anything else, including the composed query code', () => {
    for (const junk of ['uz-Cyrl', 'EN', 'fr', '', null, undefined, 7, []]) {
      expect(isUiLocale(junk)).toBe(false);
    }
  });
});
