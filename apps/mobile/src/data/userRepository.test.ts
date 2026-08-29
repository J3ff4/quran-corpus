import { describe, expect, it } from 'vitest';
import { createMemoryUserClient } from './userRepository.testHelpers';
import {
  getBookmarks,
  getLastReadingPosition,
  getSetting,
  recordReadingPosition,
  saveSetting,
  setBookmark,
  setBookmarkNote,
} from './userRepository';

describe('userRepository', () => {
  it('stores bookmarks locally by surah and ayah', async () => {
    const client = createMemoryUserClient();
    await setBookmark(client, 2, 255, true);
    await setBookmark(client, 1, 1, true);
    await setBookmark(client, 2, 255, false);

    expect(await getBookmarks(client)).toEqual([
      { surahId: 1, ayahNumber: 1, note: null, createdAt: expect.any(String) },
    ]);
  });

  it('attaches a note to a bookmark without creating one', async () => {
    const client = createMemoryUserClient();
    await setBookmark(client, 2, 255, true);
    await setBookmarkNote(client, 2, 255, '  the throne verse  ');
    // 1:1 is not bookmarked, so this write must land nowhere.
    await setBookmarkNote(client, 1, 1, 'orphan');

    expect(await getBookmarks(client)).toEqual([
      { surahId: 2, ayahNumber: 255, note: 'the throne verse', createdAt: expect.any(String) },
    ]);
  });

  it('stores the latest reading position', async () => {
    const client = createMemoryUserClient();
    await recordReadingPosition(client, 1, 7);
    await recordReadingPosition(client, 2, 10);

    expect(await getLastReadingPosition(client)).toEqual({ surahId: 2, ayahNumber: 10 });
  });

  it('stores string settings by key', async () => {
    const client = createMemoryUserClient();
    await saveSetting(client, 'contentLanguage', 'ru');

    expect(await getSetting(client, 'contentLanguage')).toBe('ru');
    expect(await getSetting(client, 'theme')).toBeNull();
  });
});
