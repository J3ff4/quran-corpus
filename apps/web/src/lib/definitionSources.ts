/**
 * Names for `root_definitions.source` tags, as credited on /about.
 *
 * The tag is a database identifier; the label is a licence obligation (§11),
 * and both the root page and the lemma page render the same definition text,
 * so the two must credit it identically. Shared for that reason — when a new
 * source is imported it needs one entry here, not one per page.
 */
/* A Map, not an object literal: `source` is a DB column, so `constructor`,
   `toString` and `__proto__` are reachable keys, and a plain index lookup
   resolves those up the prototype chain to a function -- truthy, so a `??`
   fallback never fires, and TypeScript still types the result `string`. React
   throws when handed one as a child. Map has no prototype keys to shadow. */
const SOURCE_LABELS = new Map<string, string>([
  ['lane', "Lane's Lexicon"],
  ['qurandev-lane', "Lane's Lexicon"],
  ['corpus-forms', 'Quranic Arabic Corpus'],
]);

/**
 * Label for a definition source; the raw tag when it is unmapped, null when
 * there is no source at all.
 *
 * Falling back to the tag is deliberate, and it is the ugly option: `lane` is
 * meaningless to a reader and is not the credit the licence asks for. But the
 * alternative — rendering nothing — ships third-party licensed definition text
 * with *no* attribution on both the root and the lemma page, and does it
 * silently: nothing in the UI, the tests, or the logs says a source went
 * uncredited. An unmapped tag is an import that forgot its `SOURCE_LABELS`
 * entry, and a visible wrong-looking credit is what gets that noticed (§11).
 *
 * So: add the entry above when importing a new source. This is the net, not
 * the plan.
 */
export function definitionSourceLabel(source: string | null): string | null {
  return source ? (SOURCE_LABELS.get(source) ?? source) : null;
}
