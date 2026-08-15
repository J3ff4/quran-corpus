import { describe, expect, it } from 'vitest';
import { contentLanguages, uiLocales } from './languages';
import { t } from './uiStrings';

describe('M1 i18n', () => {
  it('keeps UI locales separate from content languages', () => {
    expect(uiLocales.map((locale) => locale.code)).toEqual(['en', 'uz', 'ru']);
    expect(contentLanguages.map((language) => language.code)).toEqual(['en', 'uz', 'ru']);
  });

  it('returns translated UI labels for every shipped locale', () => {
    expect(t('en', 'tabs.surahs')).toBe('Surahs');
    expect(t('uz', 'tabs.surahs').length).toBeGreaterThan(0);
    expect(t('ru', 'tabs.surahs').length).toBeGreaterThan(0);
  });
});
