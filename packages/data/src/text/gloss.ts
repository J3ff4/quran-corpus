// Word-by-word glosses are *contextual translations*, not lexical meanings:
// the corpus renders each word as it reads in its verse, so a gloss carries
// whatever the sentence needed -- a leading conjunction from an attached
// prefix ("And not"), a pronoun suffix ("and consult them"), parenthetical
// scaffolding supplied by the translator ("(the) Symbols"), and the quote
// marks and sentence punctuation of the surrounding ayah ('"Strike').
//
// Audited over all 4833 lemmas: 63.4% of the single most-frequent gloss per
// lemma trips at least one of those. That is why the lemma page shows a *set*
// of glosses under "Translated as" rather than one line claiming to be the
// definition -- these functions only tidy the presentation, they cannot turn
// a contextual gloss into a dictionary sense.

// Everything that can sit at a gloss boundary without being part of the word:
// the quote glyphs the corpus carries over from ayah-level speech marks
// (straight + curly, single + double), sentence punctuation left over from the
// verse, the dash it uses as a trailing connector ("your enemy -"), and
// whitespace.
//
// One combined class rather than a quote pass followed by a punctuation pass:
// run separately, neither sees a character the other is hiding, so `  ",. `
// cleans to a bare `"` -- the leading space keeps the quote off the edge for
// the first pass, and the second only removes punctuation. Anchored to the
// ends, so an interior apostrophe ("one's", "Allah's") always survives, and an
// opening parenthesis -- which is meaningful, see cleanGloss -- is not in the
// class at all.
const EDGE_NOISE = /^[\s"'‘’“”,.;:!?—–-]+|[\s"'‘’“”,.;:!?—–-]+$/g;

// A leading coordinating conjunction is almost always the translation of an
// attached wa-/fa- prefix, not part of the lemma: مَا is glossed "and what"
// wherever it appears as وَمَا. Stripped so those do not occupy a chip each
// ("Allah sets forth" and "And Allah sets forth" are one meaning, and ضرب
// spent two of its five chips saying it twice).
//
// One list, two derived forms, so the strip and the ownership test below can
// never drift apart.
const CONJUNCTIONS = ['and', 'but', 'so', 'or', 'then', 'nor', 'yet'] as const;
const LEADING_CONJUNCTION = new RegExp(`^(${CONJUNCTIONS.join('|')})\\s+`, 'i');
const CONJUNCTION_WORDS: ReadonlySet<string> = new Set(CONJUNCTIONS);

/** Edge noise off, inner whitespace collapsed. The half of the clean that is
 *  always safe -- no word is ever removed, so it is also what decides the
 *  head gloss in cleanGlossList before any stripping happens. */
function tidy(gloss: string): string {
  return gloss.replace(EDGE_NOISE, '').replace(/\s+/g, ' ').trim();
}

/**
 * Tidy one word-by-word gloss for display as a chip.
 *
 * Strips edge quotes and sentence punctuation, drops a leading coordinating
 * conjunction, and collapses inner whitespace.
 *
 * Parentheses are deliberately **kept** — "(the) Symbols" without them
 * misreads as a definite noun the Arabic need not carry.
 *
 * `ownWord` is the caller's answer to "is this conjunction the lemma *itself*?"
 * — see cleanGlossList, which derives it. When the leading conjunction matches
 * it the gloss is returned untouched, because for a lemma that *means* "or",
 * stripping the "or" does not remove an attached prefix, it removes the
 * translation and promotes the next word of the verse in its place. أم
 * ("or", CONJ) was rendering chips reading "Who", "what" and "Who is", and
 * لٰكِن ("but") was rendering "I am" and "We" — the exact class of false
 * statement the lemma page exists to avoid. Only 4 of 4832 lemmas are
 * affected, all of them conjunctions.
 *
 * The single-word case is still caught by the `|| tidied` fallback rather than
 * by `ownWord`: a gloss that is *nothing but* the conjunction would strip to
 * "" for any lemma, ownership or not.
 *
 * Returns "" only when nothing printable was there; callers drop those.
 */
export function cleanGloss(gloss: string, ownWord?: string): string {
  const tidied = tidy(gloss);
  const match = LEADING_CONJUNCTION.exec(tidied);
  if (!match) return tidied;
  if (match[1]!.toLowerCase() === ownWord) return tidied;
  return tidied.replace(LEADING_CONJUNCTION, '').trim() || tidied;
}

/**
 * Clean, de-duplicate and cap a frequency-ordered gloss list for the
 * "Translated as" chips.
 *
 * Input must already be ordered most-frequent-first; that order is preserved,
 * and each chip lands at the rank of the *first* raw gloss that produced it.
 * De-duplication is case-insensitive and keeps the first (most frequent)
 * spelling, which is what collapses the corpus's `"what"` / `"What"` /
 * `"what,"` variants into one chip.
 *
 * Note this is the rank of the merged chip's best-selling *variant*, not of the
 * merged total: given `Y`(450), `And X`(300), `X`(250) the output is
 * `["Y", "X"]` even though X totals 550. Summing would mean threading counts
 * through this signature and every one of its tests, to reorder a set of at
 * most five chips that display no counts at all — so the ranking is
 * deliberately approximate. If counts ever appear on the chips they stop being
 * approximate and this has to take `{text, count}[]` instead.
 *
 * That same ordering contract is what identifies a conjunction lemma: if the
 * single most frequent gloss *is* "or" or "but", the word means "or" or "but",
 * and cleanGloss must not strip that word off its other glosses. Derived from
 * the data rather than from a POS-tag list on purpose — مَا carries SUB and SUP
 * senses yet is dominantly a relative pronoun, so a tag-based test would stop
 * stripping for the very lemma the strip was written for.
 */
export function cleanGlossList(glosses: string[], limit: number): string[] {
  // The cap is an exact-equality break, so a non-positive limit would never
  // match and the function would return *every* gloss — the opposite of what
  // the caller asked for. Covers 0, negatives and NaN in one condition.
  if (!(limit > 0)) return [];
  const head = glosses[0] === undefined ? '' : tidy(glosses[0]).toLowerCase();
  const ownWord = CONJUNCTION_WORDS.has(head) ? head : undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of glosses) {
    const g = cleanGloss(raw, ownWord);
    if (!g) continue;
    const key = g.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(g);
    if (out.length === limit) break;
  }
  return out;
}
