import { isUiLocale, type UiLocaleCode } from '@quran-corpus/config/i18n/locales';
import {
  contentLanguage,
  isScript,
  type QueryLanguageCode,
  type ScriptCode,
} from '@quran-corpus/config/i18n/script';

export const UI_LOCALE_COOKIE = 'ui-locale';
export const SCRIPT_COOKIE = 'ui-script';

/**
 * The shape both `next/headers`' `cookies()` store and a test stub satisfy --
 * narrow on purpose so nothing but a cookie jar can be passed in.
 */
export interface CookieJar {
  get(name: string): { value: string } | undefined;
}

export interface ResolvedLocale {
  /** Drives the UI chrome and `<html lang>`. Never `uz-Cyrl` (not a UI locale). */
  locale: UiLocaleCode;
  script: ScriptCode;
  /** Drives the content queries: the locale composed with the script. This is
   *  the only place `uz-Cyrl` appears -- it is a query code, never a UI one. */
  content: QueryLanguageCode;
}

/**
 * Resolves the stored UI preference on the server, before the first paint.
 *
 * Both cookies are user-controlled input (§3 OWASP): the values reach a SQL
 * parameter and an `<html lang>` attribute, so each is validated through its
 * own guard and anything unrecognised falls back to the default rather than
 * passing through.
 */
export function resolveLocale(jar: CookieJar): ResolvedLocale {
  const storedLocale = jar.get(UI_LOCALE_COOKIE)?.value;
  const storedScript = jar.get(SCRIPT_COOKIE)?.value;

  const locale: UiLocaleCode = isUiLocale(storedLocale) ? storedLocale : 'en';
  const script: ScriptCode = isScript(storedScript) ? storedScript : 'latin';

  return { locale, script, content: contentLanguage(locale, script) };
}
