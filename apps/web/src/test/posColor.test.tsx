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
  it('falls back for null/unknown', () => {
    expect(posColor(null)).toBe(posColor('ZZZ'));
  });
  it('gives DET no color, unlike other minor tags', () => {
    expect(posColor('DET')).toBeNull();
    expect(posColor('NEG')).not.toBeNull();
  });
});
