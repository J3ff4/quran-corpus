import { describe, it, expect } from 'vitest';
import {
  isBuckwalter,
  isLemmaBuckwalter,
  isRootBuckwalter,
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
