// Dictionary URL builders. One owner per route shape so a Buckwalter
// identifier is never interpolated into a path raw.
//
// This matters more than it looks: the Buckwalter charset includes `#`, and
// **43 lemmas actually contain it** (`$aTo_#`, `haniy^_#`, `ma$o_#amap`, …).
// Unencoded, everything from the `#` on becomes a URL fragment and the route
// receives a truncated identifier -- a 404 on a real dictionary entry. Roots
// are luckier (only `$` ever needs encoding, and `$` is legal in a path), which
// is exactly why three root call sites had drifted to raw interpolation without
// anything breaking.
//
// These live in apps/web rather than packages/ on purpose: they encode this
// app's Next.js route layout, not data-layer knowledge. packages/data must stay
// free of web-specific concepts so it remains portable to apps/mobile
// (CLAUDE.md §2) -- a mobile client has no `/dictionary/lemma/...` URL.

/** Path to a root entry page. */
export function rootPath(rootBuckwalter: string): string {
  return `/dictionary/${encodeURIComponent(rootBuckwalter)}`;
}

/** Path to a lemma entry page. */
export function lemmaPath(lemmaBuckwalter: string): string {
  return `/dictionary/lemma/${encodeURIComponent(lemmaBuckwalter)}`;
}

/** Paging endpoint for a lemma's concordance (consumed by ConcordanceList). */
export function lemmaConcordanceEndpoint(lemmaBuckwalter: string): string {
  return `/api/lemma/${encodeURIComponent(lemmaBuckwalter)}/concordance`;
}

/** Paging endpoint for a root's concordance (consumed by ConcordanceList). */
export function rootConcordanceEndpoint(rootBuckwalter: string): string {
  return `/api/roots/${encodeURIComponent(rootBuckwalter)}/concordance`;
}
