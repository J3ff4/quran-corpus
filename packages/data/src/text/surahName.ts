/**
 * Matching keys for a surah name typed by a human.
 *
 * The corpus stores one Latin spelling per surah ("Al-Baqara", "Ar-Rahman",
 * "Al-Ikhlas"), but readers type the name they know: without the article
 * ("baqara", "najm"), in Uzbek or Turkish orthography ("rahmon", "ihlos",
 * "fotiha"), or with the -h that some romanizations add ("baqarah"). Comparing
 * the raw strings resolves exactly one of those and rejects the rest, which is
 * what device check 30 caught.
 *
 * So both sides are reduced to a small set of keys and compared as sets. The
 * folding is deliberately lossy and deliberately symmetric -- it is applied to
 * the stored name and to the query by the same function, so it can never
 * "improve" one side into something the other cannot reach.
 *
 * Pure string work, no imports: safe for the client and mobile entry points.
 */

/** Article prefixes that assimilate to the following sun letter. Longest
 *  first, so "ash" is tried before "as" and never leaves a stray "h". */
const ARTICLES = ['ash', 'adh', 'ath', 'al', 'an', 'ar', 'as', 'ad', 'at', 'az'];

/** Minimum length for a prefix (rather than whole-key) match. Two letters
 *  prefix a dozen surahs; the caller would rather show search results than
 *  guess. */
export const SURAH_NAME_MIN_PREFIX = 3;

/** Shortest key the trailing-h rule may leave behind. Below this the rule
 *  stops removing a romanization artefact and starts inventing collisions:
 *  "Nuh" would become "nu" and "Ta-Ha" "ta", each a two-letter key that whole-
 *  matches on any stray typing, and "allah" (-> "alah" -> "ala") would answer
 *  to Al-A'la. */
const MIN_H_STRIPPED = 4;

function collapse(key: string): string {
  // Assimilated articles double the sun letter ("Ar-Rahman"), and only some
  // romanizations keep the doubling ("Muzzammil" ~ "Muzammil").
  const single = key.replace(/(.)\1+/g, '$1');
  // Trailing -h is a romanization choice, not a sound: Baqarah ~ Baqara.
  const stripped = single.replace(/h$/, '');
  return stripped.length >= MIN_H_STRIPPED ? stripped : single;
}

/**
 * One or two folded keys for a bare Latin key.
 *
 * Two, not one, because Uzbek writes `o` for both of Arabic's long a and short
 * u -- Rahmon is Rahman but Mo'minun is Muminun. A single mapping serves one
 * of those and breaks the other, so a key containing `o` yields both readings
 * and matching succeeds if either lands.
 */
function foldLatin(key: string): string[] {
  const base = key
    // Digraphs first: Uzbek and Turkish drop the h that English keeps.
    .replace(/kh/g, 'h') // Ikhlas ~ Ihlos
    .replace(/gh/g, 'g') // Ghashiya ~ Goshiya
    .replace(/th/g, 't') // Thariyat ~ Tariyot
    .replace(/q/g, 'k') // Baqara ~ Bakara
    .replace(/w/g, 'v'); // Tawba ~ Tavba
  if (!base.includes('o')) return [collapse(base)];
  const asA = collapse(base.replace(/o/g, 'a')); // Rahmon ~ Rahman
  const asU = collapse(base.replace(/o/g, 'u')); // Mo'minun ~ Muminun
  return asA === asU ? [asA] : [asA, asU];
}

/**
 * Every key a name can be matched by: the folded name, plus the folded name
 * with a leading definite article removed. Both are kept rather than only the
 * stripped one, because a name can legitimately start with the same letters
 * ("Al-Alaq" -> "alalaq" and "alaq", so a reader typing either one lands).
 *
 * Returns an empty array for a name with no Latin letters at all (an Arabic
 * name, handled separately by the caller).
 */
export function surahNameKeys(name: string): string[] {
  const bare = name
    // ā/ṭ/ʿ decompose, then the combining marks go: the corpus is plain ASCII
    // today, but a future translit column need not be.
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (bare.length === 0) return [];

  const keys = foldLatin(bare);
  for (const article of ARTICLES) {
    if (!bare.startsWith(article) || bare.length <= article.length) continue;
    for (const stripped of foldLatin(bare.slice(article.length))) {
      // Guard the degenerate case: stripping must leave a real name behind, or
      // "Ad" would match every surah through the prefix rule below, and "asr"
      // -- whose own first two letters are an article -- would emit "r".
      if (stripped.length >= SURAH_NAME_MIN_PREFIX && !keys.includes(stripped)) keys.push(stripped);
    }
    break;
  }
  return keys;
}

/** True when `queryKeys` names `nameKeys` outright. */
export function surahNameExactMatch(queryKeys: string[], nameKeys: string[]): boolean {
  return queryKeys.some((q) => nameKeys.includes(q));
}

/** True when a query key is a leading fragment of a name key -- "baqar" for
 *  "baqara". Only whole-key matches are trusted above; the caller resolves a
 *  prefix hit only when exactly one surah has one. */
export function surahNamePrefixMatch(queryKeys: string[], nameKeys: string[]): boolean {
  return queryKeys.some(
    (q) => q.length >= SURAH_NAME_MIN_PREFIX && nameKeys.some((n) => n.startsWith(q)),
  );
}

/**
 * Keys for a stored English name ("The Cow") or an English query.
 *
 * Deliberately *not* the fold above: those rules exist for Arabic sounds and
 * only do damage on English. Run through them, "moon" folds to the same key as
 * surah 76's "The Man" (o -> a, doubles collapsed) and a reader searching for
 * Al-Qamar is sent confidently to Al-Insan instead. Case, punctuation and a
 * leading "the" are the only things an English name should forgive.
 */
export function surahTranslationKeys(name: string): string[] {
  const bare = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (bare.length === 0) return [];

  const keys = [bare];
  const rest = bare.slice(3);
  if (bare.startsWith('the') && rest.length >= SURAH_NAME_MIN_PREFIX) keys.push(rest);
  return keys;
}
