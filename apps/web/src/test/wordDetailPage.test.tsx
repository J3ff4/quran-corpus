import { describe, it, expect } from 'vitest';
import { parseWordParams } from '../app/word/[surah]/[ayah]/[position]/page';

describe('parseWordParams', () => {
  it('parses numeric params', () => {
    expect(parseWordParams({ surah: '1', ayah: '1', position: '1' })).toEqual({
      surah: 1,
      ayah: 1,
      position: 1,
    });
  });
  it('rejects non-numeric', () => {
    expect(parseWordParams({ surah: 'x', ayah: '1', position: '1' })).toBeNull();
  });
  it('rejects out-of-range surah', () => {
    expect(parseWordParams({ surah: '200', ayah: '1', position: '1' })).toBeNull();
  });
});
