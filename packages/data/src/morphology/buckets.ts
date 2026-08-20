/**
 * Groups a POS tag into the colour buckets both products share. Splitting the
 * tag→bucket decision (corpus data, here) from the bucket→colour decision
 * (design, in packages/config) is what lets web emit `var(--pos-noun)` and
 * mobile emit a hex from the same source of truth.
 */

export type PosBucket = 'noun' | 'verb' | 'prep' | 'pron' | 'other';

const NOMINAL = new Set(['N', 'PN', 'ADJ']);

/**
 * Bucket for a POS tag, or null for "no colour, render as default text".
 *
 * DET returns null rather than `other`: corpus.quran.com's own wordbyword.jsp
 * doesn't surface DET as a distinct grammatical category -- an assimilated
 * determiner prefix is folded into its preposition's label -- so giving it the
 * muted `other` colour would paint a category the source treats as invisible.
 */
export function posBucket(posTag: string | null | undefined): PosBucket | null {
  if (!posTag) return null;
  if (posTag === 'DET') return null;
  if (NOMINAL.has(posTag)) return 'noun';
  switch (posTag) {
    case 'V':
      return 'verb';
    case 'P':
      return 'prep';
    case 'PRON':
      return 'pron';
    default:
      return 'other';
  }
}
