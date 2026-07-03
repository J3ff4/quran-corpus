// Arabic harakat, Quranic annotation signs, tatweel, and the BOM. Written with
// explicit \u escapes (not literal glyphs) -- these ranges are byte-for-byte
// hard to distinguish as Arabic glyphs in an editor/diff, and a range that
// bleeds one codepoint into the Arabic letters block (U+0621-064A) silently
// strips base consonants instead of just marks. See normalize.test.ts
// (Al-Fatiha 1:1) for the regression case this guards against.
//
// Ranges: U+0610-061A (Quranic annotation signs), U+064B-065F (harakat +
// small marks), U+0670 (superscript/dagger alef), U+06D6-06ED (Quranic
// waqf/annotation signs), U+08D3-08FF (Arabic Extended-A combining marks),
// U+0640 (tatweel), U+FEFF (BOM).
//
// The FTS5 tokenizer's remove_diacritics folds Latin/Cyrillic but NOT these
// Arabic combining marks (verified), so we strip them in app code -- applied
// to both the indexed body and the user query so a bare query hits
// diacritized verses.
const ARABIC_MARKS =
  /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF\u0640\uFEFF]/g;

// Alef variants a user won't type (U+0622 madda, U+0623 hamza above,
// U+0625 hamza below, U+0671 wasla) -> bare alef (U+0627).
const ALEF_VARIANTS = /[\u0622\u0623\u0625\u0671]/g;

export function normalizeArabic(s: string): string {
  return s.replace(ARABIC_MARKS, '').replace(ALEF_VARIANTS, '\u0627');
}

export function escapeFtsQuery(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}
