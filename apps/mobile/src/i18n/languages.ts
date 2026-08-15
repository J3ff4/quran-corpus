export type UiLocaleCode = 'en' | 'uz' | 'ru';
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
