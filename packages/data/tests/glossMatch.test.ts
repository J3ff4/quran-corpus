import { describe, it, expect } from 'vitest';
import { markGlossMatches } from '../src/text/glossMatch.js';

const M = (s: string) => `\u0002${s}\u0003`;

describe('markGlossMatches', () => {
  it('prefix-matches a term of 3+ chars, case-folded', () =>
    expect(markGlossMatches('The Merciful', 'merc')).toBe(`The ${M('Merciful')}`));
  it('exact-matches a term under 3 chars, like termToMatch', () =>
    // `inside` is the load-bearing word: a prefix match would mark it too.
    expect(markGlossMatches('in it, inside', 'in')).toBe(`${M('in')} it, inside`));
  // unicode61 remove_diacritics 2 folds LATIN diacritics only. Verified 2026-10-07:
  // "cafe" matches café; "елк"* does NOT match ёлка; "мои" does NOT match мой.
  it('folds Latin diacritics like the tokenizer', () =>
    expect(markGlossMatches('café', 'cafe')).toBe(M('café')));
  it('does not fold Cyrillic ё/й, because FTS does not', () => {
    expect(markGlossMatches('ёлка', 'елк')).toBe('ёлка');
    expect(markGlossMatches('мой мои', 'мои')).toBe(`мой ${M('мои')}`);
  });
  it('marks every term of a multi-term query', () =>
    expect(markGlossMatches('милостивый Господь', 'мил господ')).toBe(
      `${M('милостивый')} ${M('Господь')}`,
    ));
  it('leaves brackets and punctuation outside the mark', () =>
    expect(markGlossMatches('(the) Lord,', 'lord')).toBe(`(the) ${M('Lord')},`));
  it('returns the gloss untouched for a query with no letters', () =>
    expect(markGlossMatches('слово', '"*')).toBe('слово'));
});
