import { describe, it, expect, beforeEach } from 'vitest';
import { DEFAULT_SURAH_IDS, getFeaturedSurahIds, recordSurahVisit } from '../lib/reading-history';

describe('reading-history', () => {
  beforeEach(() => localStorage.clear());

  it('returns the defaults for a new user', () => {
    expect(getFeaturedSurahIds()).toEqual(DEFAULT_SURAH_IDS);
  });

  it('most-recently-visited surah comes first', () => {
    recordSurahVisit(114);
    recordSurahVisit(36);
    expect(getFeaturedSurahIds()[0]).toBe(36);
    expect(getFeaturedSurahIds()[1]).toBe(114);
  });

  it('re-visiting a surah moves it to the front without duplicating it', () => {
    recordSurahVisit(114);
    recordSurahVisit(36);
    recordSurahVisit(114);
    const ids = getFeaturedSurahIds();
    expect(ids[0]).toBe(114);
    expect(ids.filter((id) => id === 114)).toHaveLength(1);
  });

  it('backfills remaining slots with defaults, skipping ones already visited', () => {
    recordSurahVisit(114);
    const ids = getFeaturedSurahIds();
    expect(ids[0]).toBe(114);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    for (const id of ids) {
      expect(id === 114 || DEFAULT_SURAH_IDS.includes(id)).toBe(true);
    }
  });

  it('does not duplicate a default that is already in history', () => {
    recordSurahVisit(1);
    const ids = getFeaturedSurahIds();
    expect(ids.filter((id) => id === 1)).toHaveLength(1);
    expect(ids).toHaveLength(4);
  });

  it('caps history at 4 distinct surahs', () => {
    recordSurahVisit(1);
    recordSurahVisit(2);
    recordSurahVisit(3);
    recordSurahVisit(4);
    recordSurahVisit(5);
    expect(getFeaturedSurahIds()).toEqual([5, 4, 3, 2]);
  });

  it('tolerates malformed localStorage JSON', () => {
    localStorage.setItem('reading-history', '{not json');
    expect(getFeaturedSurahIds()).toEqual(DEFAULT_SURAH_IDS);
  });
});
