import { describe, it, expect } from 'vitest';
import { parseSort } from '../app/dictionary/sort';

describe('parseSort', () => {
  it('defaults to alpha', () => expect(parseSort(undefined)).toBe('alpha'));
  it('accepts freq', () => expect(parseSort('freq')).toBe('freq'));
  it('rejects junk -> alpha', () => expect(parseSort('xyz')).toBe('alpha'));
});
