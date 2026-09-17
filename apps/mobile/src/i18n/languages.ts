/** The mechanism moved to packages/config/i18n in phase M10 (R2) so apps/web
 *  can share it instead of growing a second copy. This file stays as the
 *  import path 48 call sites already use; the table of STRINGS is still local,
 *  in ./uiStrings.
 */
export type {
  UiLocaleCode,
  ContentLanguageCode,
  LanguageMetadata,
} from '@quran-corpus/config/i18n/locales';
export { uiLocales, contentLanguages, isUiLocale } from '@quran-corpus/config/i18n/locales';

export type { ScriptCode, QueryLanguageCode } from '@quran-corpus/config/i18n/script';
export { scripts, isScript, contentLanguage } from '@quran-corpus/config/i18n/script';
