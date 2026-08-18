import { describe, expect, it } from 'vitest';
import { parseLemmaParam, parseLetterParam } from './routeParams';

describe('parseLemmaParam', () => {
  it('is the shared decode-aware validator, not a local copy', () => {
    // The single most frequent lemma in the corpus (ٱللَّه, 2699 occurrences)
    // reaches a route still percent-encoded. A charset-only validator rejects
    // it -- that regression cost web 35% of its lemma pages once already.
    expect(parseLemmaParam('%7Bll~ah')).toBe('{ll~ah');
  });
});

describe('parseLetterParam', () => {
  it('accepts a letter the alphabet carries', () => {
    expect(parseLetterParam('ب')).toBe('ب');
  });

  it('rejects a letter it does not', () => {
    // rootFirstLetter folds hamza seats into ا, so أ is never a bucket of its
    // own and a screen for it could never have rows.
    expect(parseLetterParam('أ')).toBeNull();
  });

  it('rejects arbitrary text', () => {
    expect(parseLetterParam('../../etc')).toBeNull();
  });

  it('takes the first of a repeated param', () => {
    expect(parseLetterParam(['ب', 'ت'])).toBe('ب');
  });
});
