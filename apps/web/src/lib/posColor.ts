const NOUN = new Set(['N', 'PN', 'ADJ']);

/**
 * Maps a POS tag to a theme-aware CSS color reference (a `var(--pos-*)`), or
 * null for "no color" (render as plain default text). corpus.quran.com's own
 * wordbyword.jsp doesn't surface DET as a distinct grammatical category (an
 * assimilated determiner prefix is folded into its preposition's label), so
 * it gets no color here either rather than sharing the muted --pos-other
 * bucket with NEG/REM/CONJ/etc.
 */
export function posColor(posTag: string | null): string | null {
  if (posTag === 'DET') return null;
  if (posTag && NOUN.has(posTag)) return 'var(--pos-noun)';
  switch (posTag) {
    case 'V':
      return 'var(--pos-verb)';
    case 'P':
      return 'var(--pos-prep)';
    case 'PRON':
      return 'var(--pos-pron)';
    default:
      return 'var(--pos-other)';
  }
}
