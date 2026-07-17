/**
 * surah-name-v4 (quranfonts.com) maps each surah to a PUA glyph at
 * 0xE000 + surah.id (verified against the font's own cmap: codepoints
 * 0xE001-0xE072 present, one per surah, matching the known example
 * An-Nas = surah 114 = 0xE072).
 */
export function surahNameGlyph(surahId: number): string {
  return String.fromCodePoint(0xe000 + surahId);
}
