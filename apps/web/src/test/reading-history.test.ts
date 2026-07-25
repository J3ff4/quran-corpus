import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_SURAH_IDS,
  FEATURED_SURAHS_COOKIE,
  getFeaturedIdsFromCookie,
  recordSurahVisit,
} from '../lib/reading-history';

function readCookie(name: string): string | undefined {
  return document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function clearCookies() {
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  });
}

describe('reading-history', () => {
  beforeEach(clearCookies);

  it('getFeaturedIdsFromCookie returns the defaults when no cookie is set', () => {
    expect(getFeaturedIdsFromCookie(undefined)).toEqual(DEFAULT_SURAH_IDS);
  });

  it('recordSurahVisit writes a cookie the server can read, most-recent first', () => {
    recordSurahVisit(114);
    recordSurahVisit(36);
    const ids = getFeaturedIdsFromCookie(readCookie(FEATURED_SURAHS_COOKIE));
    expect(ids[0]).toBe(36);
    expect(ids[1]).toBe(114);
  });

  it('re-visiting a surah moves it to the front without duplicating it', () => {
    recordSurahVisit(114);
    recordSurahVisit(36);
    recordSurahVisit(114);
    const ids = getFeaturedIdsFromCookie(readCookie(FEATURED_SURAHS_COOKIE));
    expect(ids[0]).toBe(114);
    expect(ids.filter((id) => id === 114)).toHaveLength(1);
  });

  it('backfills remaining slots with defaults, skipping ones already visited', () => {
    recordSurahVisit(114);
    const ids = getFeaturedIdsFromCookie(readCookie(FEATURED_SURAHS_COOKIE));
    expect(ids[0]).toBe(114);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    for (const id of ids) {
      expect(id === 114 || DEFAULT_SURAH_IDS.includes(id)).toBe(true);
    }
  });

  it('does not duplicate a default that is already in history', () => {
    recordSurahVisit(1);
    const ids = getFeaturedIdsFromCookie(readCookie(FEATURED_SURAHS_COOKIE));
    expect(ids.filter((id) => id === 1)).toHaveLength(1);
    expect(ids).toHaveLength(4);
  });

  it('caps history at 4 distinct surahs', () => {
    recordSurahVisit(1);
    recordSurahVisit(2);
    recordSurahVisit(3);
    recordSurahVisit(4);
    recordSurahVisit(5);
    expect(getFeaturedIdsFromCookie(readCookie(FEATURED_SURAHS_COOKIE))).toEqual([5, 4, 3, 2]);
  });

  it('tolerates a malformed cookie value', () => {
    expect(getFeaturedIdsFromCookie('not,a,number')).toEqual(DEFAULT_SURAH_IDS);
  });

  it('drops out-of-range ids from a hand-edited cookie', () => {
    expect(getFeaturedIdsFromCookie('0,115,-3,2.5,36')).toEqual([36, 1, 2, 18]);
  });

  it('drops duplicates from a hand-edited cookie so cards never repeat', () => {
    expect(getFeaturedIdsFromCookie('36,36,36')).toEqual([36, 1, 2, 18]);
  });
});
