import { describe, it, expect } from 'vitest';
import { letterCounts } from '../app/dictionary/letters';

describe('letterCounts', () => {
  it('buckets roots by folded first letter', () => {
    const c = letterCounts(['ب أ ر', 'ب ت ر', 'أ ك ل']);
    expect(c['ب']).toBe(2);
    expect(c['ا']).toBe(1); // أ folds to ا
  });
});
