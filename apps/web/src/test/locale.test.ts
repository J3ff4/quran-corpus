import { describe, it, expect } from 'vitest';
import { resolveLocale, UI_LOCALE_COOKIE, SCRIPT_COOKIE } from '../lib/locale';

const jar = (o: Record<string, string>) => ({
  get: (k: string) => (k in o ? { value: o[k]! } : undefined),
});

describe('resolveLocale', () => {
  it('defaults to English in Latin when nothing is stored', () => {
    expect(resolveLocale(jar({}))).toEqual({ locale: 'en', script: 'latin', content: 'en' });
  });

  it('resolves Uzbek + Cyrillic to the uz-Cyrl content rows', () => {
    expect(
      resolveLocale(jar({ [UI_LOCALE_COOKIE]: 'uz', [SCRIPT_COOKIE]: 'cyrillic' })).content,
    ).toBe('uz-Cyrl');
  });

  it('rejects a cookie value that is not a locale', () => {
    // The cookie is user-controlled input (§3 OWASP): an unvalidated value
    // reaches a SQL parameter and an <html lang> attribute.
    expect(resolveLocale(jar({ [UI_LOCALE_COOKIE]: "ru'; DROP" })).locale).toBe('en');
  });

  it('rejects a script cookie that is not a script', () => {
    expect(resolveLocale(jar({ [UI_LOCALE_COOKIE]: 'uz', [SCRIPT_COOKIE]: 'glagolitic' })).script)
      .toBe('latin');
  });

  it('ignores a stored cyrillic script for a locale that has no Cyrillic', () => {
    expect(
      resolveLocale(jar({ [UI_LOCALE_COOKIE]: 'en', [SCRIPT_COOKIE]: 'cyrillic' })).content,
    ).toBe('en');
  });
});
