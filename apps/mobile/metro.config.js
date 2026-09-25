const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.assetExts.push('db', 'woff2');

// The Play build ships the 604 mushaf page fonts as an install-time asset pack
// (plugins/withMushafAssetPack.js). Metro bundles what it can see, and RN's
// asset pipeline lands every required .ttf in the APK's res/raw -- 192.6 MB of
// it, measured on vc55 -- where nothing downstream can remove them again. So
// the exclusion has to happen here, by resolving the 604-require() manifest to
// an empty stand-in. Unset for F-Droid, which ships them inline.
if (process.env.EXPO_MUSHAF_ASSET_PACK === '1') {
  const generated = path.resolve(projectRoot, 'src/mushaf/fontManifest.generated.ts');
  const stub = path.resolve(projectRoot, 'src/mushaf/fontManifest.pack.ts');
  const upstream = config.resolver.resolveRequest;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const resolve = upstream ?? context.resolveRequest;
    const resolved = resolve(context, moduleName, platform);
    if (resolved.type === 'sourceFile' && path.resolve(resolved.filePath) === generated) {
      return { ...resolved, filePath: stub };
    }
    return resolved;
  };
}

module.exports = config;
