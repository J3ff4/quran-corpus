import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The real manifest's 604 requires resolve to .ttf files that are gitignored
// and produced by `uv run scraper mushaf-fonts`, so they exist on a developer
// machine and NOT on CI. Importing it for real passes locally and fails in the
// pipeline with "Cannot find module '../../assets/fonts/mushaf/p001.ttf'".
// pageFont.test.ts mocks it for the same reason.
vi.mock('./fontManifest.generated', () => ({
  MUSHAF_FONTS_INLINE: true,
  MUSHAF_FONT_ASSETS: { 1: 101, 50: 150, 302: 1302, 604: 1604 },
}));

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
    expect(mushafFontSource(1)).toBe(101);
  });

  it('resolves pages across the whole range, not just the first', () => {
    // Under Metro these are opaque numeric handles; the fixture stands in for
    // them. The point is the branch, not the value.
    expect(mushafFontSource(50)).toBe(150);
    expect(mushafFontSource(302)).toBe(1302);
    expect(mushafFontSource(604)).toBe(1604);
  });

  it('throws on a page the manifest has no entry for', () => {
    // Not "return a pack path": in an inline build a gap means the generator
    // did not run, and turning that into a path the device cannot find reports
    // it as a download failure three layers from the cause.
    expect(() => mushafFontSource(2)).toThrow(/generate:mushaf-manifest/);
  });

  describe('the pack build', () => {
    async function packBuild() {
      vi.doMock('./fontManifest.generated', () => ({
        MUSHAF_FONTS_INLINE: false,
        MUSHAF_FONT_ASSETS: {},
      }));
      return (await import('./mushafFontSource.js')).mushafFontSource;
    }

    it('returns a scheme-less asset-relative path, zero-padded', async () => {
      const fromPack = await packBuild();

      expect(fromPack(1)).toBe('mushaf_fonts/p001.ttf');
      expect(fromPack(604)).toBe('mushaf_fonts/p604.ttf');
    });

    it('never yields a path containing a colon', async () => {
      const fromPack = await packBuild();

      // Load-bearing, not cosmetic. expo-asset's Android downloadAsync routes a
      // colon-free string to the AssetManager and anything else (bar
      // file:///android_res/) to openRemoteStream -- so an `asset://` prefix
      // would be fetched over the network and fail on a device in airplane
      // mode, which is exactly what an install-time pack must survive.
      expect(String(fromPack(302))).not.toContain(':');
    });
  });

  describe('an older manifest with no delivery flag', () => {
    it('is treated as the inline build, not the pack build', async () => {
      // The dangerous default. A manifest predating MUSHAF_FONTS_INLINE -- or a
      // fixture written before it -- leaves the flag undefined, and a plain
      // falsiness check would send the INLINE build down the pack branch and
      // render every page as tofu with no error anywhere.
      //
      // `undefined` explicitly rather than an omitted key: vitest throws on a
      // named import the mock does not define, so the absent-export shape is
      // not expressible. The value is what the branch reads.
      vi.doMock('./fontManifest.generated', () => ({
        MUSHAF_FONTS_INLINE: undefined,
        MUSHAF_FONT_ASSETS: { 7: 107 },
      }));
      const { mushafFontSource: legacy } = await import('./mushafFontSource.js');

      expect(legacy(7)).toBe(107);
    });
  });
});

describe('fontManifest.generated', () => {
  it('covers all 604 pages', () => {
    // Read as TEXT, not imported: importing it executes 604 require() calls
    // against gitignored .ttf files. This is the check the mocked tests above
    // cannot make -- that the generator emitted every page -- and reading the
    // source is the only way to make it without the assets present.
    // From cwd rather than import.meta.url: tsconfig.test.json emits
    // CommonJS, where import.meta is a TS1470. Vitest's root is apps/mobile.
    const src = readFileSync(join(process.cwd(), 'src/mushaf/fontManifest.generated.ts'), 'utf8');
    const pages = [...src.matchAll(/^ {2}(\d+): require\(/gm)].map((m) => Number(m[1]));

    expect(pages).toHaveLength(604);
    expect(pages[0]).toBe(1);
    expect(pages[603]).toBe(604);
    // Contiguous, so a generator that skipped a page in the middle cannot pass
    // on the count and the endpoints alone.
    expect(pages.every((page, i) => page === i + 1)).toBe(true);
  });
});
