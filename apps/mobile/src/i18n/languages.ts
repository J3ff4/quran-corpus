export type ContentLanguageCode = 'en' | 'uz' | 'ru';

export interface ContentLanguage {
  code: ContentLanguageCode;
  label: string;
  nativeLabel: string;
  direction: 'ltr' | 'rtl';
}

export const contentLanguages: ContentLanguage[] = [
  { code: 'en', label: 'English', nativeLabel: 'English', direction: 'ltr' },
  { code: 'uz', label: 'Uzbek', nativeLabel: "O'zbek", direction: 'ltr' },
  { code: 'ru', label: 'Russian', nativeLabel: 'Русский', direction: 'ltr' },
];
