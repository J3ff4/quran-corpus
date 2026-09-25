const { withDangerousMod, withSettingsGradle, withAppBuildGradle } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const PACK = 'mushaf_fonts';

/**
 * Ships the 604 mushaf page fonts as a Play install-time asset pack instead of
 * inside the base APK.
 *
 * Measured 2026-09-25: the fonts are 192.6 MB of the 206.3 MB AAB, and Play's
 * 200 MB cap is on the base download. Moving them out is the whole of this
 * plugin's reason to exist.
 *
 * WHY A PACK MODULE AND NOT `ignoreAssetsPattern`: the plan assumed the fonts
 * sit in the APK's `assets/`. They do not. React Native's asset pipeline puts
 * non-image assets in `res/raw/` with flattened names
 * (`assets_fonts_mushaf_p001.ttf`), where aapt's asset ignore patterns cannot
 * reach them. The only way to keep them out of the base module is to keep them
 * out of Metro's graph, which is what the `fontManifest` alias in
 * metro.config.js does -- this plugin puts them back, on the other side, as a
 * pack.
 *
 * DELIVERY TYPE is install-time, per the owner's 2026-09-24 ruling: present
 * before first launch, no progress UI, no resumption, no network at runtime.
 * That also means the files are reachable through the app's own AssetManager
 * rather than as a filesystem path, which is why `mushafFontSource` returns a
 * scheme-less asset-relative path -- see its docstring for the expo-asset
 * routing that makes that the one loadable form.
 *
 * NOT APPLIED FOR F-DROID. F-Droid has no pack mechanism and no size cap, so
 * its artefact is the inline build: leave EXPO_MUSHAF_ASSET_PACK unset and the
 * next prebuild is that build.
 */
const withMushafAssetPack = (config) => {
  config = withSettingsGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(`include ':${PACK}'`)) {
      cfg.modResults.contents += `\ninclude ':${PACK}'\n`;
    }
    return cfg;
  });

  config = withAppBuildGradle(config, (cfg) => {
    const contents = cfg.modResults.contents;
    if (contents.includes('assetPacks')) return cfg;
    // Into the app module's own `android {` block -- the first one in the file.
    cfg.modResults.contents = contents.replace(
      /^android \{/m,
      `android {\n    assetPacks = [":${PACK}"]`,
    );
    return cfg;
  });

  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const android = cfg.modRequest.platformProjectRoot;
      const source = path.join(cfg.modRequest.projectRoot, 'assets/fonts/mushaf');
      const assets = path.join(android, PACK, 'src/main/assets', PACK);

      fs.mkdirSync(assets, { recursive: true });

      const fonts = fs.readdirSync(source).filter((f) => f.endsWith('.ttf'));
      if (fonts.length === 0) {
        // The .ttf files are gitignored and produced by `uv run scraper
        // mushaf-fonts`. An empty pack builds clean and ships a mushaf of tofu,
        // so fail here instead.
        throw new Error(
          `no .ttf files in ${source}; run \`uv run scraper mushaf-fonts\` before prebuild`,
        );
      }

      // Hard-link rather than copy: 183 MB, and prebuild runs often enough that
      // the duplication is worth avoiding. Falls back to a copy across devices.
      for (const font of fonts) {
        const to = path.join(assets, font);
        if (fs.existsSync(to)) continue;
        try {
          fs.linkSync(path.join(source, font), to);
        } catch {
          fs.copyFileSync(path.join(source, font), to);
        }
      }

      fs.writeFileSync(
        path.join(android, PACK, 'build.gradle'),
        [
          "apply plugin: 'com.android.asset-pack'",
          '',
          'assetPack {',
          `    packName = "${PACK}"`,
          '    dynamicDelivery {',
          '        deliveryType = "install-time"',
          '    }',
          '}',
          '',
        ].join('\n'),
      );

      return cfg;
    },
  ]);
};

module.exports = withMushafAssetPack;
