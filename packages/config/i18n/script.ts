import type { ContentLanguageCode, LanguageMetadata } from './locales';

/** Which alphabet the Uzbek content is written in. */
export type ScriptCode = 'latin' | 'cyrillic';

/** What actually reaches a query's `language_code`. Distinct from
 *  ContentLanguageCode because `uz-Cyrl` is composed, never selected.
 *
 *  Keeping the two apart is what stops a script from being applied to a
 *  language that has only one: 'en' + cyrillic must stay 'en', since no table
 *  carries an `en-Cyrl` row and a query for one returns nothing at all. */
export type QueryLanguageCode = ContentLanguageCode | 'uz-Cyrl';

export const scripts: LanguageMetadata<ScriptCode>[] = [
  { code: 'latin', label: 'Latin', nativeLabel: 'Lotin', direction: 'ltr' },
  { code: 'cyrillic', label: 'Cyrillic', nativeLabel: 'Кирилл', direction: 'ltr' },
];

export function isScript(value: unknown): value is ScriptCode {
  return scripts.some((script) => script.code === value);
}

/** The `language_code` to query for a (content language, script) pair.
 *
 *  Uzbek is the only language with two scripts in the corpus, so this is the
 *  one place that knows the script means anything at all. Everything else
 *  ignores it -- see QueryLanguageCode for why composing 'en-Cyrl' would empty
 *  the screen rather than degrade it.
 *
 *  Uzbek's two scripts are NOT equally stocked: `uz` carries three verse
 *  translators and `uz-Cyrl` only Tasnim. Glosses, surah names and root
 *  glosses are complete in both. */
export function contentLanguage(
  language: ContentLanguageCode,
  script: ScriptCode,
): QueryLanguageCode {
  return language === 'uz' && script === 'cyrillic' ? 'uz-Cyrl' : language;
}
