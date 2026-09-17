import { describe, it, expect } from 'vitest';
import { contentLanguage, isScript, scripts } from './languages';

describe('contentLanguage', () => {
  it('maps Uzbek + cyrillic to the uz-Cyrl rows', () => {
    expect(contentLanguage('uz', 'cyrillic')).toBe('uz-Cyrl');
  });

  it('maps Uzbek + latin to uz', () => {
    expect(contentLanguage('uz', 'latin')).toBe('uz');
  });

  it('ignores the script for every language that has only one', () => {
    // There is no en-Cyrl or ru-Latn row anywhere in the corpus. Composing one
    // would name a language_code no table carries, and every content query
    // would return nothing -- an empty reader, not a fallback.
    expect(contentLanguage('en', 'cyrillic')).toBe('en');
    expect(contentLanguage('ru', 'cyrillic')).toBe('ru');
    expect(contentLanguage('en', 'latin')).toBe('en');
    expect(contentLanguage('ru', 'latin')).toBe('ru');
  });
});

describe('isScript', () => {
  it('accepts the two scripts and nothing else', () => {
    expect(isScript('latin')).toBe(true);
    expect(isScript('cyrillic')).toBe(true);
    expect(isScript('uz-Cyrl')).toBe(false);
    expect(isScript(null)).toBe(false);
    expect(isScript('')).toBe(false);
  });

  it('accepts every code the picker can offer', () => {
    // A script in the list that the validator rejects is a control that
    // resets itself on the next launch.
    for (const script of scripts) expect(isScript(script.code)).toBe(true);
  });
});
