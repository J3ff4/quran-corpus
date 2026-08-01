import { describe, it, expect } from 'vitest';
import {
  isBuckwalter,
  isLemmaBuckwalter,
  isRootBuckwalter,
  parseLemmaParam,
  parseRootParam,
  LEMMA_BUCKWALTER_MAX,
  ROOT_BUCKWALTER_MAX,
} from '../src/text/buckwalter.js';

describe('isBuckwalter', () => {
  it('accepts plain ASCII-letter tokens', () => {
    expect(isBuckwalter('qaAla', 16)).toBe(true);
    expect(isBuckwalter('ktb', 12)).toBe(true);
  });

  it('accepts the corpus special chars the pre-fix regex omitted', () => {
    // Regression: `^ # , . @ [ _` and digits all occur in real lemma tokens
    // (e.g. samaA^', jaA^'a). A regex missing any of these 400s a common word.
    for (const s of ["samaA^'", "jaA^'a", "maA^'", '{ll~ah', 'x#y', 'a,b', 'a.b', 'a2b', 'a@b', 'a[b', 'a_b']) {
      expect(isBuckwalter(s, 16)).toBe(true);
    }
  });

  it('rejects empty, whitespace, and out-of-charset input', () => {
    expect(isBuckwalter('', 16)).toBe(false);
    expect(isBuckwalter('  ', 16)).toBe(false);
    expect(isBuckwalter('a b', 16)).toBe(false);
    expect(isBuckwalter('café', 16)).toBe(false); // non-ASCII letter
  });

  it('enforces the length cap', () => {
    expect(isBuckwalter('a'.repeat(16), 16)).toBe(true);
    expect(isBuckwalter('a'.repeat(17), 16)).toBe(false);
  });

  it('convenience wrappers apply the right caps (generous headroom over observed max)', () => {
    expect(LEMMA_BUCKWALTER_MAX).toBe(32);
    expect(ROOT_BUCKWALTER_MAX).toBe(24);
    // Real tokens (longest observed lemma = 15) are well within cap.
    expect(isLemmaBuckwalter("samaA^'")).toBe(true);
    expect(isLemmaBuckwalter('a'.repeat(LEMMA_BUCKWALTER_MAX))).toBe(true);
    expect(isLemmaBuckwalter('a'.repeat(LEMMA_BUCKWALTER_MAX + 1))).toBe(false);
    expect(isRootBuckwalter('a'.repeat(ROOT_BUCKWALTER_MAX))).toBe(true);
    expect(isRootBuckwalter('a'.repeat(ROOT_BUCKWALTER_MAX + 1))).toBe(false);
    // Same charset for both kinds.
    expect(isRootBuckwalter('samaA^')).toBe(true);
  });
});

describe('parseLemmaParam / parseRootParam', () => {
  it('decodes the escapes URL normalization leaves behind', () => {
    // The live 404: normalization decodes only the unreserved set, so `{`, `<`,
    // `^`, backtick and friends reach the route still percent-encoded, and `%`
    // is outside the Buckwalter charset -- so the validator rejected the whole
    // identifier. This hit 1669 of 4832 lemma pages, including the three most
    // frequent lemmas in the corpus.
    expect(parseLemmaParam('%7Bll~ah')).toBe('{ll~ah'); // ٱللَّه, 2699 occurrences
    expect(parseLemmaParam('%3Cin~')).toBe('<in~'); // إِنّ, 1682
    expect(parseLemmaParam('%7Bl~a*iY')).toBe('{l~a*iY'); // ٱلَّذِى, 1464
    expect(parseLemmaParam('samaA%5E%27')).toBe("samaA^'");
    expect(parseLemmaParam("samaA%5E'")).toBe("samaA^'"); // `'` needs no escape
    expect(parseRootParam('%24Am')).toBe('$Am');
  });

  it('passes through an already-decoded identifier unchanged', () => {
    // Decoding must be safe whether or not the caller's framework decoded
    // first, because that behaviour differs per character class and per
    // runtime. A decoded identifier holds no `%` -- the charset forbids it --
    // so the second pass is a no-op rather than a double decode.
    expect(parseLemmaParam('qaAla')).toBe('qaAla');
    expect(parseLemmaParam('{ll~ah')).toBe('{ll~ah');
    expect(parseRootParam('$Am')).toBe('$Am');
  });

  it('rejects a double-encoded identifier instead of aliasing it', () => {
    // `%` is outside the charset, so one decode is provably the right number:
    // `qa%2541la` becomes `qa%41la`, which still holds a `%` and is rejected
    // rather than resolving to `qaAla` under a non-canonical URL.
    expect(parseLemmaParam('qa%2541la')).toBeNull();
    expect(parseRootParam('%2524Am')).toBeNull();
  });

  it('returns null for malformed percent-escapes rather than throwing', () => {
    // decodeURIComponent throws URIError on these; an uncaught throw in a
    // server component is a 500 where the honest answer is 404.
    expect(parseLemmaParam('%')).toBeNull();
    expect(parseLemmaParam('%zz')).toBeNull();
    expect(parseLemmaParam('%E0%A4%A')).toBeNull();
    expect(parseRootParam('%')).toBeNull();
  });

  it('still enforces charset and length after decoding', () => {
    expect(parseLemmaParam('caf%C3%A9')).toBeNull(); // decodes to non-ASCII
    expect(parseLemmaParam('a%20b')).toBeNull(); // decodes to a space
    expect(parseLemmaParam('')).toBeNull();
    expect(parseLemmaParam('a'.repeat(LEMMA_BUCKWALTER_MAX + 1))).toBeNull();
    // Root cap is tighter than the lemma cap, and decoding does not relax it.
    expect(parseRootParam('a'.repeat(ROOT_BUCKWALTER_MAX + 1))).toBeNull();
  });
});
