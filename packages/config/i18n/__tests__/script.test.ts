import { describe, it, expect } from 'vitest';
import { contentLanguage, isScript } from '../script';

describe('contentLanguage', () => {
  it('maps Uzbek + cyrillic to the uz-Cyrl rows', () => {
    expect(contentLanguage('uz', 'cyrillic')).toBe('uz-Cyrl');
  });

  it('maps Uzbek + latin to uz', () => {
    expect(contentLanguage('uz', 'latin')).toBe('uz');
  });

  it('ignores the script for every language that has only one', () => {
    // There is no en-Cyrl or ru-Cyrl row in the corpus; composing one would
    // name a language_code nothing carries, and the query returns nothing at
    // all rather than degrading to the Latin text.
    expect(contentLanguage('en', 'cyrillic')).toBe('en');
    expect(contentLanguage('ru', 'cyrillic')).toBe('ru');
  });
});

describe('isScript', () => {
  it('accepts the two scripts', () => {
    expect(isScript('latin')).toBe(true);
    expect(isScript('cyrillic')).toBe(true);
  });

  it('rejects anything else, so a hand-edited cookie cannot reach a query', () => {
    for (const junk of ['Latin', 'uz-Cyrl', '', null, undefined, 0, {}]) {
      expect(isScript(junk)).toBe(false);
    }
  });
});
