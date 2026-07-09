// Plain (non-client) module: server components import VALID_LANG_CODES here.
// Keeping these constants out of the 'use client' LanguageBar avoids Next's
// client-reference proxying, which turns non-component exports into opaque
// refs (breaking array methods like .includes) when read on the server.
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'uz', label: 'Uzbek' },
  { code: 'ru', label: 'Russian' },
] as const;

export const VALID_LANG_CODES = LANGUAGES.map((l) => l.code);

export type ValidLang = (typeof VALID_LANG_CODES)[number];

export function isValidLang(v: string | undefined): v is ValidLang {
  return (VALID_LANG_CODES as ReadonlyArray<string>).includes(v ?? '');
}
