import type { SurahListItem } from '@/data/corpusRepository';

/**
 * Find a surah by name rather than by number.
 *
 * Pure, and deliberately not a query: the whole index is 114 rows the screens
 * already hold, so this filters what is in hand instead of asking the DB to
 * match user text (§3 OWASP -- untrusted input never reaches SQL through here).
 *
 * Matches the names the app is SHOWING. Under an Uzbek UI `nameTranslit` is
 * already `Fotiha` and `nameTranslation` the Uzbek meaning, so the arms below
 * follow the locale for free -- and equally, typing `Al-Fatihah` under an
 * Uzbek UI is not expected to hit, because that string is nowhere on screen.
 */

/** Everything a Latin query and a Latin name are compared through.
 *
 *  Both sides go through this, which is the point: `baqarah`, `Al-Baqara` and
 *  `bakara` are the same word spelled by three different conventions, and
 *  folding only the query would leave the name in a fourth. */
export function normalizeLatin(raw: string): string {
  let s = raw
    .toLowerCase()
    .normalize('NFD')
    // Combining marks: `ʿAbasa`, `Sād`, anything pasted with diacritics.
    .replace(/[\u0300-\u036f]/g, '')
    // Hyphens, apostrophes, the ayn/hamza letters, spaces. `Ya-Sin`, `Al-A'raf`,
    // `Aʿla` all lose theirs.
    .replace(/[^a-z0-9]/g, '');
  // Digraphs that transliterate one Arabic letter, folded to one Latin one:
  // th/dh/kh/gh and q are exactly where two spellings of the same name part
  // company (`baqara` / `bakara`, `Ikhlas` / `Ihlas`).
  s = s
    .replace(/th/g, 't')
    .replace(/dh/g, 'd')
    .replace(/kh/g, 'h')
    .replace(/gh/g, 'g')
    .replace(/sh/g, 's')
    .replace(/q/g, 'k');
  // Long vowels: `ee`->`i`, `oo`->`u` before the doubling collapse, so
  // `Yaseen` and `Yasin` meet.
  s = s.replace(/e/g, 'i').replace(/o/g, 'u');
  // The article, before the doubling collapse -- an assimilated one IS a
  // doubled letter (`an-Nur`, `ar-Rahman`, `as-Saff`), so collapsing first
  // would hide it and leave `nur` matching only as a substring of `anur`.
  // Half the index carries an article and nobody types it consistently.
  if (s.startsWith('al') && s.length > 3) s = s.slice(2);
  else if (s.length > 3 && /^a([bcdfghjklmnprstvwyz])\1/.test(s)) s = s.slice(2);
  // Any remaining doubled letter. `Yunus` / `Yoonus`, `Muhammad` / `Muhamad`.
  s = s.replace(/(.)\1+/g, '$1');
  // Final ta marbuta, romanized `-ah` by some conventions and `-a` by others.
  // Trimmed rather than a plain trailing `h`, which would eat Nuh and Ta-Ha.
  if (s.endsWith('ah')) s = s.slice(0, -1);
  return s;
}

/** Arabic query against an Arabic name.
 *
 *  NFC on BOTH sides in one pass. Composed and decomposed forms of the same
 *  word are different strings to every comparison JS has, and that is exactly
 *  how 49 form chips went dead once already -- there, one side was NFC and the
 *  other was not. */
export function normalizeArabic(raw: string): string {
  let s = raw
    .normalize('NFC')
    // Harakat, sukun, shadda, the superscript alef, and tatweel. A name typed
    // on a phone keyboard carries none of these; `surahs.name_arabic` does.
    .replace(/[\u064b-\u0652\u0670\u0640]/g, '')
    // Hamza seats and alef maddah all flatten to bare alef: the seat is the
    // one thing a typist is most likely to disagree with the corpus about.
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
    .replace(/\u0629/g, '\u0647')
    .replace(/\u0649/g, '\u064a')
    .replace(/\s/g, '');
  if (s.startsWith('ال') && s.length > 3) s = s.slice(2);
  return s;
}

/** Below this, a substring match is noise rather than a search: one folded
 *  letter is inside most of the 114 names, so it would "match" nearly the whole
 *  index while looking like a filter. A prefix is exempt -- typing `n` and
 *  seeing the names that START with it is the list doing what it should. */
const SUBSTRING_MIN = 2;

/** Below this, a meaning match is noise: `the`, `man`, `day` hit a dozen
 *  surahs and would bury the name the user actually typed. The same 3-char
 *  floor the dictionary's meaning arm settled on (#31). */
const MEANING_MIN = 3;

/** Lower sorts first. A transliteration hit always outranks a meaning hit --
 *  the name is what was asked for, the meaning is a convenience. */
const RANK = { number: 0, prefix: 1, substring: 2, arabic: 3, meaning: 4 } as const;

function rankOf(item: SurahListItem, latin: string, arabic: string, digits: number | null): number {
  if (digits !== null && item.id === digits) return RANK.number;
  if (latin.length > 0) {
    const name = normalizeLatin(item.nameTranslit);
    if (name.startsWith(latin)) return RANK.prefix;
    if (latin.length >= SUBSTRING_MIN && name.includes(latin)) return RANK.substring;
  }
  if (arabic.length > 0 && normalizeArabic(item.nameArabic).includes(arabic)) return RANK.arabic;
  if (latin.length >= MEANING_MIN && normalizeLatin(item.nameTranslation).includes(latin)) {
    return RANK.meaning;
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * The surahs matching `query`, best first.
 *
 * An empty query returns `items` untouched -- the picker opens showing all 114
 * in mushaf order, and typing narrows from there.
 */
export function matchSurahs(items: readonly SurahListItem[], query: string): SurahListItem[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [...items];

  const latin = normalizeLatin(trimmed);
  const arabic = normalizeArabic(trimmed);
  // A bare number still works inside the picker: someone who knows it should
  // not have to close the sheet to use it.
  const digits = /^\d{1,3}$/.test(trimmed) ? Number(trimmed) : null;

  return items
    .map((item) => ({ item, rank: rankOf(item, latin, arabic, digits) }))
    .filter((scored) => Number.isFinite(scored.rank))
    // Stable within a rank: mushaf order is the order the list is already in,
    // and a name match should not reshuffle it.
    .sort((a, b) => a.rank - b.rank || a.item.id - b.item.id)
    .map((scored) => scored.item);
}
