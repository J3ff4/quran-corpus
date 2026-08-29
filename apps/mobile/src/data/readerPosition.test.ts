import { beforeEach, describe, expect, it } from 'vitest';
import { clearReaderPosition, getReaderPosition, setReaderPosition } from './readerPosition';

beforeEach(clearReaderPosition);

describe('readerPosition', () => {
  it('has no position before anything is read', () => {
    expect(getReaderPosition(2)).toBeNull();
  });

  it('answers only for the surah it was written for', () => {
    setReaderPosition(2, 50);

    expect(getReaderPosition(2)).toBe(50);
    // Not 50 for surah 3: an ayah number carried across surahs would open
    // Aal-Imran at 50 because al-Baqarah was left there.
    expect(getReaderPosition(3)).toBeNull();
  });

  it('keeps only the latest position', () => {
    setReaderPosition(2, 50);
    setReaderPosition(2, 55);

    expect(getReaderPosition(2)).toBe(55);
  });

  it('moves wholesale to another surah rather than keeping both', () => {
    setReaderPosition(2, 50);
    setReaderPosition(3, 4);

    expect(getReaderPosition(3)).toBe(4);
    // One slot, not a map: paging to another surah means the previous one is
    // no longer being read, and a remembered position there would re-land a
    // reader that returns to it on an ayah from a different session.
    expect(getReaderPosition(2)).toBeNull();
  });
});
