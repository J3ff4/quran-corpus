const NOUN = new Set(['N', 'PN', 'ADJ']);

/**
 * Maps a POS tag to a theme-aware CSS color reference (a `var(--pos-*)`).
 * Grouped by grammatical category (corpus-style color-coding); the light/dark
 * values live in the CSS custom property so the same reference adapts.
 */
export function posColor(posTag: string | null): string {
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
