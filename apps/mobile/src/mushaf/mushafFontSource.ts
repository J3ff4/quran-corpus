import { MUSHAF_FONT_ASSETS, MUSHAF_FONTS_INLINE } from './fontManifest.generated';

/**
 * Where one page's font comes from, in whichever of the two shipping builds
 * this is.
 *
 * **Play** ships the 604 fonts as an install-time asset pack (192.6 MB of a
 * 206.3 MB bundle, against a 200 MB cap on the base download). **F-Droid**
 * ships them inline: no pack mechanism, no cap, and its artefact is the build
 * we already have. One function, so the two channels differ in one place.
 *
 * The return type is the difference. Inline gives a Metro asset handle (a
 * number); the pack gives a **scheme-less, asset-relative path**, and that
 * exact form is load-bearing. Traced through the installed modules
 * 2026-09-25:
 *
 *   - `Font.loadAsync` hands its source to `Asset.fromURI(...)` and then
 *     awaits `downloadAsync()`, using the resulting `localUri`.
 *   - expo-asset's Android `downloadAsync` returns early only for `file://`.
 *     Everything else goes to `URI.toInputStream()`, which routes a string
 *     with **no colon in it** to `openAssetResourceStream(context, ...)` --
 *     the app's own AssetManager -- and copies it to a cache file it then
 *     hands back as a `file://` URI.
 *   - Anything else containing a `:` that is not `file:///android_res/` falls
 *     through to `openRemoteStream`, i.e. it is treated as a URL.
 *
 * So `asset://mushaf_fonts/p001.ttf` would be fetched over the network and
 * fail, while `mushaf_fonts/p001.ttf` is read out of the pack. Install-time
 * packs are merged into the app's AssetManager namespace, which is what makes
 * that path resolve at all -- and is the one assumption here that source
 * reading cannot settle. Device checks 433-436 are what settle it.
 */
export function mushafFontSource(page: number): string | number {
  // `=== false`, not `!`: an absent flag -- an older manifest, a hand-edited
  // one, a test fixture written before this existed -- must mean the inline
  // build, which is the historical behaviour and the safe one. Falling to the
  // pack branch on undefined would render a mushaf of tofu in exactly the
  // build that has no pack to read from.
  if (MUSHAF_FONTS_INLINE === false) {
    return `mushaf_fonts/p${String(page).padStart(3, '0')}.ttf`;
  }

  const inline = MUSHAF_FONT_ASSETS[page];
  if (inline === undefined) {
    // Checked on the flag rather than inferred from a missing entry: in the
    // inline build a gap means the manifest is stale, and inferring "must be
    // the pack build" from it would turn that into a font the device cannot
    // find, reported as a download failure three layers away.
    throw new Error(
      `no bundled font for mushaf page ${page}; run \`pnpm generate:mushaf-manifest\``,
    );
  }
  return inline;
}
