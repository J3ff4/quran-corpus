import { describe, it, expect } from 'vitest';
import { parseScrollAyah } from '../app/surah/[id]/params';

describe('parseScrollAyah', () => {
  it('accepts a valid in-range ayah number', () => {
    expect(parseScrollAyah('255', 286)).toBe(255);
  });

  it('rejects out-of-range, non-numeric, and missing values', () => {
    expect(parseScrollAyah('0', 286)).toBeNull();
    expect(parseScrollAyah('287', 286)).toBeNull();
    expect(parseScrollAyah('abc', 286)).toBeNull();
    expect(parseScrollAyah(undefined, 286)).toBeNull();
  });
});
