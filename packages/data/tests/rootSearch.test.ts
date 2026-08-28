import { describe, it, expect } from 'vitest';
import { MEANING_MIN_CHARS, matchesRootQuery, type RootSearchKeys } from '../src/text/rootSearch.js';
import { foldRootArabic } from '../src/text/arabic.js';

/** رحم as the dictionary indexes it: folded Arabic, lowercased Buckwalter,
 *  lowercased definition blob. */
const rHm: RootSearchKeys = {
  folded: foldRootArabic('رحم'),
  bw: 'rhm',
  gloss: 'uterus; womb; relationship, kinship to love, have tenderness, mercy, pity',
};

const match = (keys: RootSearchKeys, q: string): boolean =>
  matchesRootQuery(keys, q, foldRootArabic(q));

describe('matchesRootQuery', () => {
  it('matches the Buckwalter arm from the first character', () => {
    expect(match(rHm, 'r')).toBe(true);
    expect(match(rHm, 'rh')).toBe(true);
  });

  it('matches Arabic typed with a bare alef against a seated one', () => {
    const ArD: RootSearchKeys = { folded: foldRootArabic('أرض'), bw: 'ard', gloss: 'earth, land' };
    expect(match(ArD, 'ارض')).toBe(true);
  });

  it('matches the meaning arm at the floor and above it', () => {
    expect(match(rHm, 'mercy')).toBe(true);
    expect('pit'.length).toBe(MEANING_MIN_CHARS);
    expect(match(rHm, 'pit')).toBe(true);
  });

  it('ignores the meaning arm below the floor', () => {
    // `womb` is in the blob and nowhere else, so `wo` can only match through
    // the meaning arm — and must not, or a two-letter query returns most of
    // the corpus.
    expect(match(rHm, 'wom')).toBe(true);
    expect(match(rHm, 'wo')).toBe(false);
  });

  it('still answers a short query on the root arms', () => {
    // The floor is the meaning arm's alone: `hm` is two characters and must
    // still find رحم by its Buckwalter spelling.
    expect(match(rHm, 'hm')).toBe(true);
  });

  it('misses a root that carries the needle nowhere', () => {
    expect(match(rHm, 'camel')).toBe(false);
  });

  it('treats an empty gloss as no meaning arm rather than a wildcard', () => {
    // ''.includes('') is true, so a root with no definitions must not answer
    // every query — and does not, because the floor rejects '' first.
    const bare: RootSearchKeys = { folded: 'ktb', bw: 'ktb', gloss: '' };
    expect(match(bare, 'mercy')).toBe(false);
  });
});
