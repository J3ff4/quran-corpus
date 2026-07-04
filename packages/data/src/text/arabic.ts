// Tim Buckwalter transliteration -> Arabic. Buckwalter is a machine encoding
// (used only for URL slugs + the scraped `word_segments.root`); it must never
// reach the UI. This maps it back to Arabic for display. See spec
// docs/superpowers/specs/2026-07-04-phase-08a-dictionary-letters-design.md.
const BUCKWALTER_TO_ARABIC: Record<string, string> = {
  "'": 'ء', // ء
  '|': 'آ', // آ
  '>': 'أ', // أ
  '&': 'ؤ', // ؤ
  '<': 'إ', // إ
  '}': 'ئ', // ئ
  A: 'ا', // ا
  b: 'ب', // ب
  p: 'ة', // ة
  t: 'ت', // ت
  v: 'ث', // ث
  j: 'ج', // ج
  H: 'ح', // ح
  x: 'خ', // خ
  d: 'د', // د
  '*': 'ذ', // ذ
  r: 'ر', // ر
  z: 'ز', // ز
  s: 'س', // س
  $: 'ش', // ش
  S: 'ص', // ص
  D: 'ض', // ض
  T: 'ط', // ط
  Z: 'ظ', // ظ
  E: 'ع', // ع
  g: 'غ', // غ
  _: 'ـ', // ـ tatweel
  f: 'ف', // ف
  q: 'ق', // ق
  k: 'ك', // ك
  l: 'ل', // ل
  m: 'م', // م
  n: 'ن', // ن
  h: 'ه', // ه
  w: 'و', // و
  Y: 'ى', // ى
  y: 'ي', // ي
  F: 'ً', // ً
  N: 'ٌ', // ٌ
  K: 'ٍ', // ٍ
  a: 'َ', // َ
  u: 'ُ', // ُ
  i: 'ِ', // ِ
  '~': 'ّ', // ّ
  o: 'ْ', // ْ
  '`': 'ٰ', // ٰ dagger alef
  '{': 'ٱ', // ٱ alef wasla
};

export function buckwalterToArabic(bw: string): string {
  let out = '';
  for (const ch of bw) out += BUCKWALTER_TO_ARABIC[ch] ?? ch;
  return out;
}

// Arabic hijāʾī (dictionary) letter order. Hamza (ء) sorts first, matching
// corpus.quran.com's dictionary index.
export const ARABIC_ALPHABET_ORDER: readonly string[] = [
  'ء', // ء
  'ا', // ا
  'ب', // ب
  'ت', // ت
  'ث', // ث
  'ج', // ج
  'ح', // ح
  'خ', // خ
  'د', // د
  'ذ', // ذ
  'ر', // ر
  'ز', // ز
  'س', // س
  'ش', // ش
  'ص', // ص
  'ض', // ض
  'ط', // ط
  'ظ', // ظ
  'ع', // ع
  'غ', // غ
  'ف', // ف
  'ق', // ق
  'ك', // ك
  'ل', // ل
  'م', // م
  'ن', // ن
  'ه', // ه
  'و', // و
  'ي', // ي
];

// Fold alef/ya variants a root string may carry to their base letter so
// collation is stable regardless of hamza seat. (أ إ آ ٱ -> ا, ى -> ي.)
const FOLD: Record<string, string> = {
  'آ': 'ا',
  'أ': 'ا',
  'إ': 'ا',
  'ٱ': 'ا',
  'ى': 'ي',
};

function orderKey(root: string): number[] {
  const key: number[] = [];
  for (const ch of root) {
    if (ch === ' ') continue;
    const folded = FOLD[ch] ?? ch;
    const idx = ARABIC_ALPHABET_ORDER.indexOf(folded);
    key.push(idx === -1 ? ARABIC_ALPHABET_ORDER.length : idx); // unknown last
  }
  return key;
}

// Compare two `root_arabic` strings (e.g. "ش أ م") in Arabic dictionary order.
export function compareRootsArabic(a: string, b: string): number {
  const ka = orderKey(a);
  const kb = orderKey(b);
  const n = Math.min(ka.length, kb.length);
  for (let i = 0; i < n; i++) {
    if (ka[i]! !== kb[i]!) return ka[i]! - kb[i]!;
  }
  return ka.length - kb.length;
}
