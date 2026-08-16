import { describe, it, expect } from 'vitest';
import { posColor } from '../lib/posColor';

describe('posColor', () => {
  it('returns a CSS var reference', () => {
    expect(posColor('N')).toMatch(/^var\(--pos-/);
  });
  it('maps distinct categories to distinct colors', () => {
    expect(posColor('N')).not.toBe(posColor('V'));
    expect(posColor('P')).not.toBe(posColor('N'));
  });
  it('groups the noun family together', () => {
    expect(posColor('PN')).toBe(posColor('N'));
    expect(posColor('ADJ')).toBe(posColor('N'));
  });
  it('falls back to the muted bucket for a tag it does not know', () => {
    expect(posColor('ZZZ')).toBe(posColor('NEG'));
    expect(posColor('ZZZ')).not.toBeNull();
  });
  it('gives an absent tag no colour rather than the muted bucket', () => {
    // Changed in M3 when the tag→bucket half moved to packages/data. An absent
    // tag is missing data, not an unrecognised category, so painting it with
    // the `other` colour asserts a grammatical category that is not there.
    // Unreachable through the corpus either way: 0 of 128,219 word_segments
    // and 0 of 77,429 words have a null or empty pos_tag.
    expect(posColor(null)).toBeNull();
  });
  it('gives DET no color, unlike other minor tags', () => {
    expect(posColor('DET')).toBeNull();
    expect(posColor('NEG')).not.toBeNull();
  });
});
