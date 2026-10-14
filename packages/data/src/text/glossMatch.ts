// A token as unicode61 sees one: a run of letters and digits. Folding mirrors
// remove_diacritics 2, which strips marks from LATIN letters only (ё, й survive),
// plus case folding -- so the mark lands on exactly what MATCHed.
const TOKEN = /[\p{L}\p{N}]+/gu;
const fold = (s: string) =>
  s.normalize('NFD').replace(/(?<=[A-Za-z])\p{M}+/gu, '').normalize('NFC').toLowerCase();
// Same floor as normalize.ts MIN_PREFIX_LENGTH: below it FTS is given an exact phrase.
const MIN_PREFIX = 3;

/** Wrap each gloss token the query matched in \u0002…\u0003. ponytail: per-token,
 *  so an apostrophe term ("o'g'il") marks its pieces, not the whole word. Cosmetic
 *  only; tokenizing the query like FTS's phrase would fix it if it ever matters. */
export function markGlossMatches(gloss: string, query: string): string {
  const terms = (query.match(TOKEN) ?? []).map(fold);
  if (terms.length === 0) return gloss;
  return gloss.replace(TOKEN, (token) => {
    const t = fold(token);
    const hit = terms.some((q) => (q.length < MIN_PREFIX ? t === q : t.startsWith(q)));
    return hit ? `\u0002${token}\u0003` : token;
  });
}
