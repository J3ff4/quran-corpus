export { createDatabase } from './db.js';
export { runMigrations } from './migrate.js';
export { getAllSurahs, getSurahById } from './queries/surahs.js';
export { getAyahsBySurah, getAyahWithWords } from './queries/ayahs.js';
export { getWordsByAyah, getWordsBySurah } from './queries/words.js';
export { getTranslationsByAyah, getTranslation, getTranslationsBySurahAndLang } from './queries/translations.js';
export type { Surah, Ayah, Word, Language, Translation, WordGloss } from './types.js';
export type { Client } from './db.js';
