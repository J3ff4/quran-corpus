import { describe, expect, it } from 'vitest';
import type { QueryClient } from '../src/queryClient.js';
import { recordReadingPosition, setBookmark } from '../src/userData.js';

/** Records what reached the driver, so a rejected write can be shown to have
 *  produced no statement at all rather than a harmless one. */
function recordingClient() {
  const statements: string[] = [];
  const client: QueryClient = {
    async execute(statement) {
      statements.push(typeof statement === 'string' ? statement : statement.sql);
      return { rows: [] };
    },
  };
  return { client, statements };
}

describe('user-data write validation', () => {
  // `INTEGER NOT NULL` accepts every one of these, which is the whole point:
  // the column type is not a range check, so a bad coordinate would persist and
  // only surface later as a bookmark that opens nothing.
  const badCoordinates: Array<[string, number, number]> = [
    ['surah zero', 0, 1],
    ['negative surah', -1, 1],
    ['surah past the last one', 115, 1],
    ['ayah zero', 1, 0],
    ['negative ayah', 1, -5],
    ['ayah past the longest surah', 1, 287],
    ['fractional surah', 1.5, 1],
    ['fractional ayah', 1, 2.5],
    ['NaN', Number.NaN, 1],
    ['Infinity', 1, Number.POSITIVE_INFINITY],
  ];

  it.each(badCoordinates)('rejects a bookmark with %s', async (_label, surahId, ayahNumber) => {
    const { client, statements } = recordingClient();

    await expect(setBookmark(client, surahId, ayahNumber, true)).rejects.toThrow(RangeError);
    expect(statements).toEqual([]);
  });

  it.each(badCoordinates)('rejects a reading position with %s', async (_label, surahId, ayahNumber) => {
    const { client, statements } = recordingClient();

    await expect(recordReadingPosition(client, surahId, ayahNumber)).rejects.toThrow(RangeError);
    expect(statements).toEqual([]);
  });

  it('rejects a non-boolean bookmarked flag', async () => {
    const { client, statements } = recordingClient();

    // The branch is `if (bookmarked)`, so a JS caller passing '' would delete
    // and 'false' would insert -- the opposite operation, silently.
    await expect(setBookmark(client, 2, 255, 'false' as never)).rejects.toThrow(TypeError);
    expect(statements).toEqual([]);
  });

  it('writes the boundary coordinates that are actually valid', async () => {
    const { client, statements } = recordingClient();

    await setBookmark(client, 1, 1, true);
    await setBookmark(client, 114, 286, false);
    await recordReadingPosition(client, 2, 286);

    expect(statements).toHaveLength(3);
    expect(statements[0]).toContain('INSERT INTO bookmarks');
    expect(statements[1]).toContain('DELETE FROM bookmarks');
    expect(statements[2]).toContain('INSERT INTO reading_history');
  });
});
