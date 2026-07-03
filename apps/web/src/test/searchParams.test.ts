import { describe, it, expect } from 'vitest';
import { parseSearchQuery } from '../app/search/params';

describe('parseSearchQuery', () => {
  it('trims and returns a query', () => expect(parseSearchQuery('  throne ')).toBe('throne'));
  it('returns null for undefined', () => expect(parseSearchQuery(undefined)).toBeNull());
  it('returns null for blank', () => expect(parseSearchQuery('   ')).toBeNull());
  it('caps length at 100', () => expect(parseSearchQuery('x'.repeat(200))).toHaveLength(100));
  it('coerces array to first element', () => expect(parseSearchQuery(['a', 'b'])).toBe('a'));
});
