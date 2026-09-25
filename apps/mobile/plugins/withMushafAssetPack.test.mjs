import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';

// The plugin is CommonJS, because that is what `expo prebuild` loads it as.
// Required rather than imported so the test exercises the same module shape.
const plugin = createRequire(import.meta.url)('./withMushafAssetPack.js');

const before = process.env.EXPO_MUSHAF_ASSET_PACK;
afterEach(() => {
  if (before === undefined) delete process.env.EXPO_MUSHAF_ASSET_PACK;
  else process.env.EXPO_MUSHAF_ASSET_PACK = before;
});

describe('withMushafAssetPack', () => {
  it('no-ops for the inline build, so the fonts cannot ship twice', () => {
    // The pairing with metro.config.js is the safety property: Metro decides
    // whether the 604 require() calls exist, the plugin decides whether the
    // pack exists, and one env var has to drive both. A plugin that ran
    // unconditionally would put 189.7 MB of pack on top of 192.6 MB of
    // res/raw -- a doubled download, with a green build.
    delete process.env.EXPO_MUSHAF_ASSET_PACK;
    // Asserted on the registered mods, not object identity: expo's
    // withSettingsGradle and friends mutate and hand back the SAME config
    // object, so `toBe` passes either way and proves nothing.
    expect(plugin({ name: 'x', plugins: [] }).mods).toBeUndefined();
  });

  it('is off unless the variable is exactly "1"', () => {
    // Not truthiness: "0" and "false" are what someone reaches for when they
    // mean off, and both are truthy strings.
    for (const value of ['0', 'false', 'yes']) {
      process.env.EXPO_MUSHAF_ASSET_PACK = value;
      expect(plugin({ name: 'x', plugins: [] }).mods).toBeUndefined();
    }
  });

  it('engages for the pack build', () => {
    process.env.EXPO_MUSHAF_ASSET_PACK = '1';
    const mods = plugin({ name: 'x', plugins: [] }).mods;

    // settings.gradle and app/build.gradle get the pack wired in, and the
    // dangerous mod is what copies 604 files and writes the pack's own
    // build.gradle. All three are android mods.
    expect(mods?.android).toBeDefined();
  });
});
