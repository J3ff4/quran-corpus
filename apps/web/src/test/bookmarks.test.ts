import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BOOKMARKS_COOKIE,
  bookmarkedAyahsIn,
  getBookmarks,
  getBookmarksFromCookie,
  isBookmarked,
  migrateLegacyBookmarks,
  toggleBookmark,
} from '../lib/bookmarks';

function clearCookies() {
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  });
}

function readCookie(): string | undefined {
  return document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${BOOKMARKS_COOKIE}=`))
    ?.slice(BOOKMARKS_COOKIE.length + 1);
}

describe('bookmarks', () => {
  beforeEach(() => {
    localStorage.clear();
    clearCookies();
  });

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

  it('getBookmarks lists most-recently-bookmarked first', () => {
    toggleBookmark(1, 1, 'reading');
    toggleBookmark(2, 255, 'wbw');
    const all = getBookmarks();
    expect(all[0]).toEqual({ surahId: 2, ayahNumber: 255, view: 'wbw' });
    expect(all[1]).toEqual({ surahId: 1, ayahNumber: 1, view: 'reading' });
  });

  it('writes a cookie the server can parse', () => {
    toggleBookmark(2, 255, 'wbw');
    expect(getBookmarksFromCookie(readCookie())).toEqual([
      { surahId: 2, ayahNumber: 255, view: 'wbw' },
    ]);
  });

  it('reports the pre-toggle state, not the flipped one, when the write fails', () => {
    // Simulates a browser silently rejecting the write (blocked cookies, size cap):
    // the assignment is swallowed, so reading it back still shows no bookmark.
    const cookie = vi
      .spyOn(document, 'cookie', 'set')
      .mockImplementation(() => {});
    try {
      expect(toggleBookmark(2, 255, 'reading')).toBe(false);
    } finally {
      cookie.mockRestore();
    }
    expect(isBookmarked(2, 255, 'reading')).toBe(false);
  });

  describe('getBookmarksFromCookie', () => {
    it('returns nothing for a missing or malformed cookie', () => {
      expect(getBookmarksFromCookie(undefined)).toEqual([]);
      expect(getBookmarksFromCookie('not-a-bookmark,,x')).toEqual([]);
    });

    it('drops out-of-range surah/ayah numbers and unknown views', () => {
      expect(getBookmarksFromCookie('0-1-r,115-1-r,2-0-r,2-999-r,2-255-x,2-255-w')).toEqual([
        { surahId: 2, ayahNumber: 255, view: 'wbw' },
      ]);
    });

    it('drops duplicates so rows never collide on the React key', () => {
      expect(getBookmarksFromCookie('2-255-w,2-255-w')).toEqual([
        { surahId: 2, ayahNumber: 255, view: 'wbw' },
      ]);
    });
  });

  describe('migrateLegacyBookmarks', () => {
    it('moves localStorage bookmarks into the cookie, most-recent first', () => {
      localStorage.setItem(
        'bookmarks',
        JSON.stringify([
          { surahId: 1, ayahNumber: 1, view: 'reading', bookmarkedAt: 1 },
          { surahId: 2, ayahNumber: 255, view: 'wbw', bookmarkedAt: 2 },
        ]),
      );
      expect(migrateLegacyBookmarks()).toBe(true);
      expect(getBookmarks()).toEqual([
        { surahId: 2, ayahNumber: 255, view: 'wbw' },
        { surahId: 1, ayahNumber: 1, view: 'reading' },
      ]);
      expect(localStorage.getItem('bookmarks')).toBeNull();
    });

    it('is a no-op with nothing to migrate, or on a malformed legacy value', () => {
      expect(migrateLegacyBookmarks()).toBe(false);
      localStorage.setItem('bookmarks', '{not json');
      expect(migrateLegacyBookmarks()).toBe(false);
      localStorage.setItem('bookmarks', '{"foo":"bar"}');
      expect(migrateLegacyBookmarks()).toBe(false);
      expect(getBookmarks()).toEqual([]);
    });

    it('leaves an existing cookie alone rather than merging two stores', () => {
      toggleBookmark(2, 255, 'wbw');
      localStorage.setItem(
        'bookmarks',
        JSON.stringify([{ surahId: 1, ayahNumber: 1, view: 'reading', bookmarkedAt: 1 }]),
      );
      expect(migrateLegacyBookmarks()).toBe(false);
      expect(getBookmarks()).toEqual([{ surahId: 2, ayahNumber: 255, view: 'wbw' }]);
      expect(localStorage.getItem('bookmarks')).toBeNull();
    });

    it('keeps the legacy data when the cookie write fails, so a retry can still find it', () => {
      localStorage.setItem(
        'bookmarks',
        JSON.stringify([{ surahId: 1, ayahNumber: 1, view: 'reading', bookmarkedAt: 1 }]),
      );
      const cookie = vi.spyOn(document, 'cookie', 'set').mockImplementation(() => {});
      try {
        expect(migrateLegacyBookmarks()).toBe(false);
      } finally {
        cookie.mockRestore();
      }
      expect(localStorage.getItem('bookmarks')).not.toBeNull();
    });
  });

  describe('bookmarkedAyahsIn', () => {
    const cookie = '2-255-w,2-255-r,2-1-r,1-1-r';

    it('keeps only the given surah and view', () => {
      expect(bookmarkedAyahsIn(cookie, 2, 'reading')).toEqual([255, 1]);
      expect(bookmarkedAyahsIn(cookie, 2, 'wbw')).toEqual([255]);
      expect(bookmarkedAyahsIn(cookie, 1, 'wbw')).toEqual([]);
    });

    it('returns nothing without a cookie', () => {
      expect(bookmarkedAyahsIn(undefined, 2, 'reading')).toEqual([]);
    });
  });
});
