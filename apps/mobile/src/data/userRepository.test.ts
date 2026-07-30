import { describe, expect, it } from 'vitest';
import { createMemoryUserClient } from './userRepository.testHelpers';
import {
  getBookmarks,
  getLastReadingPosition,
  getSetting,
  recordReadingPosition,
  saveSetting,
  setBookmark,
} from './userRepository';

describe('userRepository', () => {
  it('stores bookmarks locally by surah and ayah', async () => {
    const client = createMemoryUserClient();
    await setBookmark(client, 2, 255, true);
    await setBookmark(client, 1, 1, true);
    await setBookmark(client, 2, 255, false);

    expect(await getBookmarks(client)).toEqual([{ surahId: 1, ayahNumber: 1 }]);
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
