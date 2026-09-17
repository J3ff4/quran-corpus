/** The interface locales and the content languages a reader can pick.
 *
 *  Moved here from apps/mobile/src/i18n/languages.ts in phase M10 (R2) so
 *  apps/web shares the mechanism rather than growing a second copy of it.
 *  The string TABLES stay per app -- see ./t.
 */

export type UiLocaleCode = 'en' | 'uz' | 'ru';

/** The content languages a reader can PICK. Deliberately not the set of
 *  `language_code` values the corpus carries: `uz-Cyrl` is reachable only by
 *  choosing Uzbek and then the Cyrillic script, because Latin and Cyrillic are
 *  two renderings of one language, not two languages to choose between. */
export type ContentLanguageCode = 'en' | 'uz' | 'ru';

export interface LanguageMetadata<TCode extends string> {
  code: TCode;
  label: string;
  nativeLabel: string;
  direction: 'ltr' | 'rtl';
}

export const uiLocales: LanguageMetadata<UiLocaleCode>[] = [
  { code: 'en', label: 'English', nativeLabel: 'English', direction: 'ltr' },
  { code: 'uz', label: 'Uzbek', nativeLabel: "O'zbek", direction: 'ltr' },
  { code: 'ru', label: 'Russian', nativeLabel: 'Русский', direction: 'ltr' },
];

export const contentLanguages: LanguageMetadata<ContentLanguageCode>[] = [...uiLocales];

export function isUiLocale(value: unknown): value is UiLocaleCode {
  return uiLocales.some((locale) => locale.code === value);
}
