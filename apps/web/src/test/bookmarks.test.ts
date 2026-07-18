import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getBookmarks, isBookmarked, toggleBookmark } from '../lib/bookmarks';

describe('bookmarks', () => {
  beforeEach(() => localStorage.clear());

  it('is not bookmarked by default', () => {
    expect(isBookmarked(2, 255, 'reading')).toBe(false);
  });

  it('toggleBookmark adds then removes', () => {
    expect(toggleBookmark(2, 255, 'reading')).toBe(true);
    expect(isBookmarked(2, 255, 'reading')).toBe(true);
    expect(toggleBookmark(2, 255, 'reading')).toBe(false);
    expect(isBookmarked(2, 255, 'reading')).toBe(false);
  });

  it('reading and wbw bookmarks for the same verse are independent', () => {
    toggleBookmark(2, 255, 'reading');
    expect(isBookmarked(2, 255, 'wbw')).toBe(false);
    toggleBookmark(2, 255, 'wbw');
    expect(isBookmarked(2, 255, 'reading')).toBe(true);
    expect(isBookmarked(2, 255, 'wbw')).toBe(true);
  });

  it('getBookmarks sorts most-recently-bookmarked first', async () => {
    toggleBookmark(1, 1, 'reading');
    await new Promise((r) => setTimeout(r, 2));
    toggleBookmark(2, 255, 'wbw');
    const all = getBookmarks();
    expect(all[0]).toMatchObject({ surahId: 2, ayahNumber: 255, view: 'wbw' });
    expect(all[1]).toMatchObject({ surahId: 1, ayahNumber: 1, view: 'reading' });
  });

  it('tolerates malformed localStorage JSON', () => {
    localStorage.setItem('bookmarks', '{not json');
    expect(getBookmarks()).toEqual([]);
    expect(isBookmarked(1, 1, 'reading')).toBe(false);
  });

  it('tolerates valid JSON that is not an array', () => {
    localStorage.setItem('bookmarks', '{"foo":"bar"}');
    expect(getBookmarks()).toEqual([]);
  });

  it('reports the pre-toggle state, not the flipped one, when the write fails', () => {
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
    try {
      expect(toggleBookmark(2, 255, 'reading')).toBe(false);
      expect(isBookmarked(2, 255, 'reading')).toBe(false);
    } finally {
      setItem.mockRestore();
    }
  });
});
