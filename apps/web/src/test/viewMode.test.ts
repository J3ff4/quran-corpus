import { describe, it, expect } from 'vitest';
import { isViewMode } from '../components/wbw/viewMode';

describe('isViewMode', () => {
  it('accepts card and list', () => {
    expect(isViewMode('card')).toBe(true);
    expect(isViewMode('list')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isViewMode('grid')).toBe(false);
    expect(isViewMode(undefined)).toBe(false);
    expect(isViewMode(null)).toBe(false);
    expect(isViewMode(42)).toBe(false);
  });
});
