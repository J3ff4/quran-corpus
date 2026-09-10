/**
 * The calligraphic surah-name glyph, as both products draw it.
 *
 * surah-name-v2 and surah-name-v4 (quranfonts.com) each map a surah to a
 * single PUA glyph at `0xE000 + surahId` -- verified against each font's own
 * cmap, codepoints 0xE001-0xE072, one per surah. The glyph draws the whole
 * name ("سورة البقرة") as one piece of calligraphy, so nothing about it is
 * derivable from the surah's own text.
 *
 * Lives here, not in either app, because web's reader header and the mobile
 * mushaf's surah band both draw it and CLAUDE.md §3 forbids the copy. The font
 * files themselves stay with each consumer -- web ships WOFF2, mobile has to
 * ship TTF (Android's Typeface cannot read WOFF2 and expo-font reports no
 * error when it fails; see the M7a findings).
 */

/** The PUA codepoint v2 and v4 both map this surah's calligraphy to. */
export function surahNameGlyph(surahId: number): string {
  return String.fromCodePoint(0xe000 + surahId);
}

/**
 * v2 has no glyph for surah 102 (At-Takathur) at all, so a consumer whose
 * primary face is v2 has to draw that one surah in v4.
 *
 * A predicate rather than an `=== 102` at each call site: it is a property of
 * the font, and the two call sites that check it are in different products.
 */
export function needsSurahNameFallback(surahId: number): boolean {
  return surahId === 102;
}
