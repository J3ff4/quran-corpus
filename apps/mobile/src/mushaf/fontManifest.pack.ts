// The pack build's stand-in for fontManifest.generated.ts.
//
// metro.config.js aliases the generated manifest to this file when
// EXPO_MUSHAF_ASSET_PACK is set. The point is the ABSENCE of 604 require()
// calls: Metro bundles what it can see, and RN's asset pipeline puts every
// required .ttf into the APK's res/raw -- 192.6 MB of it, measured on the vc55
// bundle. Nothing downstream of Metro can take them back out again (aapt's
// asset ignore patterns do not reach res/raw), so they have to never arrive.
//
// Empty rather than deleted, so mushafFontSource keeps one shape in both
// builds and the `asset === undefined` arm stays reachable and tested.
/** This build reads the fonts from the pack. See fontManifest.generated.ts. */
export const MUSHAF_FONTS_INLINE: boolean = false;

export const MUSHAF_FONT_ASSETS: Record<number, number> = {};
