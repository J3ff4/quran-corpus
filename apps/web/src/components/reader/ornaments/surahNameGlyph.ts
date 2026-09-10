/**
 * Re-exported from `@quran-corpus/config`: the mobile mushaf's surah band draws
 * the same glyph, and the mapping may not live in one app (CLAUDE.md §3).
 * Kept as a module here so the two call sites' imports do not have to move.
 */
export { needsSurahNameFallback, surahNameGlyph } from '@quran-corpus/config/ornaments/surahName';
