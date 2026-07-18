/**
 * Both surah-name-v2 and surah-name-v4 (quranfonts.com) map each surah to
 * a PUA glyph at 0xE000 + surah.id (verified against each font's own
 * cmap: codepoints 0xE001-0xE072, one per surah). v2 is missing the
 * glyph for surah 102 -- callers fall back to font-surah-name-v4 for it.
 */
export function surahNameGlyph(surahId: number): string {
  return String.fromCodePoint(0xe000 + surahId);
}
