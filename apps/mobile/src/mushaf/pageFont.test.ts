import { describe, it, expect, vi, beforeEach } from 'vitest';

const { loadAsync } = vi.hoisted(() => ({ loadAsync: vi.fn(async () => undefined) }));
vi.mock('expo-font', () => ({ loadAsync }));
// The manifest's 604 requires resolve to gitignored .ttf files that a test run
// has no reason to build, so it is mocked rather than imported.
vi.mock('./fontManifest.generated', () => ({
  MUSHAF_FONT_ASSETS: { 1: 101, 2: 102, 604: 1604 },
}));

import { loadMushafPageFont, mushafFontFamily, resetLoadedFontsForTest } from './pageFont';

beforeEach(() => {
  loadAsync.mockClear();
  resetLoadedFontsForTest();
});

describe('mushafFontFamily', () => {
  it('matches the font file own name table', () => {
    expect(mushafFontFamily(1)).toBe('QCF2001');
    expect(mushafFontFamily(106)).toBe('QCF2106');
    expect(mushafFontFamily(604)).toBe('QCF2604');
  });

  it.each([0, 605, 1.5, NaN])('rejects page %s', (page) => {
    expect(() => mushafFontFamily(page as number)).toThrow(RangeError);
  });
});

describe('loadMushafPageFont', () => {
  it('registers the page asset under its family', async () => {
    await expect(loadMushafPageFont(2)).resolves.toBe('QCF2002');
    expect(loadAsync).toHaveBeenCalledWith({ QCF2002: 102 });
  });

  it('loads a given page only once', async () => {
    await loadMushafPageFont(2);
    await loadMushafPageFont(2);
    expect(loadAsync).toHaveBeenCalledTimes(1);
  });

  it('names a stale manifest rather than registering nothing', async () => {
    // 3 is a valid page but absent from the mocked manifest. expo-font accepts
    // an undefined source and quietly registers no family for it.
    await expect(loadMushafPageFont(3)).rejects.toThrow('generate:mushaf-manifest');
    expect(loadAsync).not.toHaveBeenCalled();
  });

  it('does not cache a failure', async () => {
    loadAsync.mockRejectedValueOnce(new Error('nope'));
    await expect(loadMushafPageFont(1)).rejects.toThrow('nope');
    await expect(loadMushafPageFont(1)).resolves.toBe('QCF2001');
    expect(loadAsync).toHaveBeenCalledTimes(2);
  });
});
