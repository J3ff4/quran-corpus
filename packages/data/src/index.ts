export { createDatabase } from './db.js';
export { runMigrations } from './migrate.js';
export { getAllSurahs, getSurahById } from './queries/surahs.js';
export { getAyahsBySurah, getAyahWithWords } from './queries/ayahs.js';
export { getWordsByAyah, getWordsBySurah } from './queries/words.js';
export { getTranslationsByAyah, getTranslation, getTranslationsBySurahAndLang } from './queries/translations.js';
export { getGlossesBySurahAndLang } from './queries/glosses.js';
export {
  getRootByBuckwalter,
  getAllRoots,
  getRootsByFrequency,
  searchRoots,
  getRootForms,
  getRootDefinitions,
  getRootEntry,
  getRootConcordance,
} from './queries/roots.js';
export type {
  Surah,
  Ayah,
  Word,
  Language,
  Translation,
  WordGloss,
  Root,
  RootForm,
  RootDefinition,
  RootEntry,
  ConcordanceEntry,
} from './types.js';
export type { Client } from './db.js';
