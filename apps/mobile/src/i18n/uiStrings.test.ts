import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentLanguages, uiLocales } from './languages';
import { strings, t, type UiStringKey } from './uiStrings';

// Keys legitimately identical across locales. Anything not listed here that
// collides with 'en' is an untranslated string that shipped by accident.
const ALLOWED_COLLISIONS: Partial<Record<UiStringKey, readonly ('uz' | 'ru')[]>> = {
  'dictionary.columnRank': ['uz'],
};

// Concatenate every .ts/.tsx source file under src/ and app/, except the
// i18n directory itself -- the UiStringKey union and locale tables declare
// every key there, which is not a use. Both roots matter: Expo Router's
// app/ holds route files (e.g. app/(tabs)/index.tsx, app/about.tsx) that
// call t() directly rather than through a src/screens component -- src/
// alone false-flags every key those routes are the only user of.
//
// Test files are excluded too: a key only a test names is still dead in the
// app, and counting it as live is how a deleted screen's strings survive.
// No key depends on this today -- it is here so that stops being luck.
function collectSourceText(dir: string): string {
  let text = '';
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === 'i18n') continue;
      text += collectSourceText(join(dir, entry.name));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.')) {
      text += readFileSync(join(dir, entry.name), 'utf8');
    }
  }
  return text;
}

const MOBILE_ROOT = join(__dirname, '../..');

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

  it('has no UiStringKey that nothing in the app actually uses', () => {
    const sourceText =
      collectSourceText(join(MOBILE_ROOT, 'src')) + collectSourceText(join(MOBILE_ROOT, 'app'));
    const keys = Object.keys(strings.en) as UiStringKey[];
    const deadKeys = keys.filter((key) => !sourceText.includes(`'${key}'`));
    expect(deadKeys).toEqual([]);
  });

  it('has no uz/ru value left untranslated as a copy of the en value', () => {
    const keys = Object.keys(strings.en) as UiStringKey[];
    for (const locale of ['uz', 'ru'] as const) {
      const collisions = keys.filter(
        (key) =>
          strings[locale][key] === strings.en[key] &&
          !(ALLOWED_COLLISIONS[key] ?? []).includes(locale),
      );
      expect(collisions, `${locale} has untranslated keys: ${collisions.join(', ')}`).toEqual([]);
    }
  });

  it('has no blank value in any locale', () => {
    for (const locale of ['en', 'uz', 'ru'] as const) {
      const keys = Object.keys(strings[locale]) as UiStringKey[];
      const blanks = keys.filter((key) => strings[locale][key].trim().length === 0);
      expect(blanks, `${locale} has blank values: ${blanks.join(', ')}`).toEqual([]);
    }
  });
});
