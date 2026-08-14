// The one translator per content language that M1 ships.
//
// This has to be shared, not copied: create-m1-reader-db.ts filters the bundled
// DB down to these three translators, and corpusRepository.ts picks the row to
// render by matching against them. When the two lists were separate constants,
// changing one and not the other produced a DB whose only translation for a
// language the reader silently refused to display — a blank translation pane
// with no error anywhere.
//
// Changing a name here means regenerating the DB (pnpm generate:m1-db) and
// re-checking the licence row in docs/data-sources-m1.md.
export const selectedTranslators = {
  en: 'Saheeh International',
  ru: 'Abu Adel',
  uz: 'Muhammad Sodik Muhammad Yusuf',
} as const;

export type SelectedTranslatorLanguage = keyof typeof selectedTranslators;
