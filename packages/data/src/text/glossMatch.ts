import { highlightTerms } from './normalize.js';

// A token as unicode61 sees one: a run of letters and digits. Folding mirrors
// remove_diacritics 2, which strips marks from LATIN letters only (ё, й survive),
// plus case folding.
const TOKEN = /[\p{L}\p{N}]+/gu;
const fold = (s: string) =>
  s.normalize('NFD').replace(/(?<=[A-Za-z])\p{M}+/gu, '').normalize('NFC').toLowerCase();

/** Wrap each gloss token the query matched in \u0002…\u0003. Built from the same
 *  terms buildFtsMatch hands FTS: each whitespace term is one phrase, so only its
 *  LAST token is a prefix (and only when the whole term clears the length floor);
 *  every other token must match exactly. ponytail: phrase adjacency is not
 *  enforced, so a piece can mark outside the phrase that MATCHed -- cosmetic. */
export function markGlossMatches(gloss: string, query: string): string {
  const pieces = highlightTerms(query).flatMap(({ term, exact }) => {
    const tokens = (term.match(TOKEN) ?? []).map(fold);
    return tokens.map((t, i) => ({ t, prefix: !exact && i === tokens.length - 1 }));
  });
  if (pieces.length === 0) return gloss;
  return gloss.replace(TOKEN, (token) => {
    const g = fold(token);
    const hit = pieces.some((p) => (p.prefix ? g.startsWith(p.t) : g === p.t));
    return hit ? `\u0002${token}\u0003` : token;
  });
}
