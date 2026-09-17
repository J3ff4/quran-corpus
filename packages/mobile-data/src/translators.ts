// The one translator per `language_code` the reader shows.
//
// This has to be shared, not copied: create-m1-reader-db.ts validates the
// bundled DB against these translators, and corpusRepository.ts picks the row
// to render by matching against them. (The DB is copied whole, so it also
// carries the translator sets no language selects -- filtering it down is a
// bundle-size question, not a correctness one.) When the lists were separate,
// changing one and not the other produced a DB whose only translation for a
// language the reader silently refused to display — a blank translation pane
// with no error anywhere.
//
// Keyed by `language_code`, so Uzbek appears twice: the script toggle composes
// 'uz-Cyrl', and both entries name Tasnim deliberately. Tasnim is the only
// Uzbek work the corpus carries in both alphabets (the other two `uz` sets are
// Cyrillic-only), so flipping the script now re-renders the SAME translator's
// words in the other script instead of silently swapping to another scholar's
// translation -- and it matches the word-by-word glosses, which are Tasnim in
// both scripts too.
//
// Changing a name here means regenerating the DB (pnpm generate:m1-db) and
// re-checking the licence row in docs/data-sources-m1.md.
export const selectedTranslators = {
  en: 'Saheeh International',
  ru: 'Abu Adel',
  uz: 'Tasnim',
  'uz-Cyrl': 'Tasnim',
} as const;

export type SelectedTranslatorLanguage = keyof typeof selectedTranslators;
