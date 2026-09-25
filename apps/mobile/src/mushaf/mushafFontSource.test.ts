import { describe, expect, it, vi, afterEach } from 'vitest';

import { MUSHAF_FONT_ASSETS } from './fontManifest.generated';
import { mushafFontSource } from './mushafFontSource';

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('./fontManifest.generated');
});

describe('mushafFontSource', () => {
  it('hands back the bundled asset when no pack is present', () => {
    // The F-Droid artefact ships every font inline and has no asset pack at
    // all, so this is not a degraded path -- it is one of the two shipping
    // configurations, and the only one nothing else in the suite covers.
    //
    // Compared against the manifest's own entry rather than asserted to be a
    // number: under Metro a required .ttf is an opaque numeric handle, but the
    // test runner resolves it to a path string, so a `typeof` check would be
    // testing the harness instead of the branch.
    expect(mushafFontSource(1)).toBe(MUSHAF_FONT_ASSETS[1]);
  });

  it('resolves every page inline, not just the first', () => {
    // 604 entries come out of a loop, so a bug that dropped the tail would
    // still pass a page-1 check. The bands matter too: p604 is the entry a
    // stale manifest loses first.
    for (const page of [1, 50, 302, 604]) {
      expect(mushafFontSource(page)).toBe(MUSHAF_FONT_ASSETS[page]);
      expect(mushafFontSource(page)).not.toBe(`mushaf_fonts/p${String(page).padStart(3, '0')}.ttf`);
    }
  });

  it('throws on a page the manifest has no entry for', async () => {
    vi.doMock('./fontManifest.generated', () => ({
      MUSHAF_FONTS_INLINE: true,
      MUSHAF_FONT_ASSETS: { 1: 42 },
    }));
    const { mushafFontSource: withGap } = await import('./mushafFontSource.js');
    // Not "return a pack path": in an inline build a gap means the generator
    // did not run, and turning that into a path the device cannot find reports
    // it as a download failure three layers from the cause.
    expect(() => withGap(2)).toThrow(/generate:mushaf-manifest/);
  });

  describe('the pack build', () => {
    it('returns a scheme-less asset-relative path, zero-padded', async () => {
      vi.doMock('./fontManifest.generated', () => ({
        MUSHAF_FONTS_INLINE: false,
        MUSHAF_FONT_ASSETS: {},
      }));
      const { mushafFontSource: fromPack } = await import('./mushafFontSource.js');

      expect(fromPack(1)).toBe('mushaf_fonts/p001.ttf');
      expect(fromPack(604)).toBe('mushaf_fonts/p604.ttf');
    });

    it('never yields a path containing a colon', async () => {
      vi.doMock('./fontManifest.generated', () => ({
        MUSHAF_FONTS_INLINE: false,
        MUSHAF_FONT_ASSETS: {},
      }));
      const { mushafFontSource: fromPack } = await import('./mushafFontSource.js');

      // Load-bearing, not cosmetic. expo-asset's Android downloadAsync routes a
      // colon-free string to the AssetManager and anything else (bar
      // file:///android_res/) to openRemoteStream -- so an `asset://` prefix
      // would be fetched over the network and fail on a device in airplane
      // mode, which is exactly what an install-time pack must survive.
      expect(String(fromPack(302))).not.toContain(':');
    });
  });
});

describe('an older manifest with no delivery flag', () => {
  it('is treated as the inline build, not the pack build', async () => {
    // The dangerous default. A manifest predating MUSHAF_FONTS_INLINE -- or a
    // fixture written before it -- leaves the flag undefined, and a plain
    // falsiness check would send the INLINE build down the pack branch and
    // render every page as tofu with no error anywhere.
    // `undefined` explicitly rather than an omitted key: vitest throws on a
    // named import the mock does not define, so the absent-export shape is not
    // expressible here. The value is what the branch reads, and undefined is
    // what it would be.
    vi.doMock('./fontManifest.generated', () => ({
      MUSHAF_FONTS_INLINE: undefined,
      MUSHAF_FONT_ASSETS: { 7: 107 },
    }));
    const { mushafFontSource: legacy } = await import('./mushafFontSource.js');

    expect(legacy(7)).toBe(107);
  });
});
