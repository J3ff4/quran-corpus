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

// U+06DF ARABIC SMALL HIGH ROUNDED ZERO -- marks a silent elided letter,
// common at the end of "...wa" plural verb endings. The UI Arabic font
// (Amiri) lacks working anchor/positioning data for it, so instead of
// sitting as a tiny mark above the previous letter it renders as an
// oversized baseline circle -- visually a stray "medallion" between words,
// or splitting the word it's attached to. Deliberately narrow: the wider
// U+06D6-06ED block also contains the waqf/pause signs, which render fine
// and carry real recitation-guidance meaning -- only the one
// confirmed-broken mark is stripped.
const QURANIC_ANNOTATION_MARKS = /\u06df/g;

export function stripQuranicAnnotations(s: string): string {
  return s.replace(QURANIC_ANNOTATION_MARKS, '');
}

// Arabic proclitics: particles that fuse to the FRONT of the following word
// rather than standing as words of their own -- the definite article, the
// conjunctions, and the prepositions that combine with it. FTS5 matches whole
// tokens, so on the live corpus a reader typing `ارض` reaches 4 verses while
// `الارض` reaches 275: the article is part of the token, and no amount of
// diacritic folding separates it. Expanding the query over this list brings
// `ارض` to 444.
//
// ponytail: query expansion, not morphology. The linguistically correct search
// is over word_segments.root/lemma, which the corpus already carries; this is
// the cheap half, and it overmatches (`بارض` also prefixes unrelated words).
// Single-letter proclitics are included because they are the common ones (و ف
// ب ل ك) and the length floor below keeps the resulting prefix queries from
// being short enough to match everything.
const ARABIC_PROCLITICS = [
  '',
  'ال',
  'و',
  'ف',
  'ب',
  'ل',
  'ك',
  'وال',
  'فال',
  'بال',
  'كال',
  'لل',
  'ولل',
  'فلل',
];

// Arabic letters proper (not the combining marks normalizeArabic strips, and
// not the PUA range the mushaf page fonts use).
const ARABIC_LETTER = /[\u0621-\u064A\u066E-\u06D3]/;

// Below this, a trailing-wildcard term matches a large fraction of the corpus
// and the proclitic arms match nearly all of it. Two-letter Arabic queries are
// mostly particles, and two-letter Latin ones are mostly stopwords, so neither
// loses a real result by staying exact.
const MIN_PREFIX_LENGTH = 3;

/** One FTS5 phrase, with embedded double quotes doubled per FTS5's escaping
 *  rules. Quoting is what keeps FTS operators (* OR NEAR ^) in user input
 *  literal text rather than syntax. */
function ftsPhrase(term: string): string {
  return `"${term.replace(/"/g, '""')}"`;
}

// A phrase followed by `*` is FTS5's prefix query. The `*` sits OUTSIDE the
// quotes deliberately: inside, it is a literal character in the phrase.
function termToMatch(term: string): string {
  if (term.length < MIN_PREFIX_LENGTH) return ftsPhrase(term);
  if (!ARABIC_LETTER.test(term)) return `${ftsPhrase(term)}*`;
  // Parenthesized: the arms are alternatives for ONE term, and without them
  // the OR would bind across the ANDs that join separate terms.
  return `(${ARABIC_PROCLITICS.map((p) => `${ftsPhrase(p + term)}*`).join(' OR ')})`;
}

/**
 * Build an FTS5 MATCH expression from a user query: split on whitespace and
 * require every term (AND).
 *
 * Each term becomes a prefix query, which is what makes "star" find "stars"
 * and "рахм" find "рахмат" -- SQLite ships a stemmer for neither Russian nor
 * Uzbek, and Porter would only ever touch the English arm. Arabic terms
 * additionally expand over the proclitics above, because Arabic glues its
 * article and conjunctions into the token itself.
 */
export function buildFtsMatch(s: string): string {
  return s
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map(termToMatch)
    .join(' AND ');
}

// Two of the three `uz` translation sets are Cyrillic-only (Alauddin Mansour,
// Muhammad Sodik Muhammad Yusuf), so a Latin-typed Uzbek query never matches
// them. (The set the reader actually shows, Tasnim, is Latin under `uz` and
// Cyrillic under `uz-Cyrl` -- both reachable by their own script without this.)
// Best-effort Latin -> Cyrillic transliteration so search still hits: covers
// the standard letters/digraphs and the oʻ/gʻ special letters (several
// apostrophe glyphs accepted). Not a full orthography (loanword c/w, and the
// tutuq belgisi glottal stop, are approximated) -- good enough for search,
// not for round-tripping arbitrary text.
// ponytail: lookup-table transliteration, not a real Uzbek morphology pass —
// revisit if mismatches show up in practice.
const UZ_APOSTROPHE = /['‘’ʻʼ]/g;
const UZ_DIGRAPHS: [RegExp, string][] = [
  [/o['‘’ʻʼ]/g, 'ў'],
  [/g['‘’ʻʼ]/g, 'ғ'],
  [/sh/g, 'ш'],
  [/ch/g, 'ч'],
  [/yo/g, 'ё'],
  [/yu/g, 'ю'],
  [/ya/g, 'я'],
];
const UZ_LATIN_TO_CYRILLIC: Record<string, string> = {
  a: 'а', b: 'б', c: 'ц', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'ҳ', i: 'и',
  j: 'ж', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', q: 'қ', r: 'р',
  s: 'с', t: 'т', u: 'у', v: 'в', w: 'в', x: 'х', y: 'й', z: 'з',
};

export function transliterateUzbekLatinToCyrillic(s: string): string {
  let out = s.toLowerCase();
  for (const [pattern, replacement] of UZ_DIGRAPHS) {
    out = out.replace(pattern, replacement);
  }
  out = out.replace(UZ_APOSTROPHE, '');
  return out.replace(/[a-z]/g, (ch) => UZ_LATIN_TO_CYRILLIC[ch] ?? ch);
}
