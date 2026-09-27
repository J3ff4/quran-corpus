const { withDangerousMod } = require('expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Keeps the stack's `default` transition on react-native-screens' ZOOM on every
 * Android version, by overriding the library's own API-33+ resource variant.
 *
 * react-native-screens ships `rns_default_*` TWICE:
 *   - `res/base/anim/`    (API < 33) -- alpha plus a 0.85 -> 1 scale. A zoom.
 *   - `res/v33/anim-v33/` (API >= 33) -- alpha plus a 10% translate and an
 *     `<extend>`, over 450ms.
 *
 * The v33 set never fades the outgoing screen: `rns_default_enter_out` animates
 * alpha 1.0 -> 1.0. That is fine for an opaque screen, which is what it was
 * written for -- but every screen in this app sets
 * `contentStyle: { backgroundColor: 'transparent' }` so the Bloom shows
 * through, and two fully opaque-alpha transparent screens 10% apart are simply
 * both on screen at once. Measured on a Galaxy S24 (API 36): the surah list
 * stays readable under the reader for ~14 of 29 animation frames. A OnePlus 7
 * Pro (API 31) gets the base set and looks right, which is exactly the
 * device split the owner reported (2026-09-27).
 *
 * App resources beat library resources of the same name and qualifier, so
 * dropping the base bodies into the app's own `anim-v33/` is the whole fix. The
 * names are react-native-screens' internals; if a future version renames them
 * this plugin silently stops applying, which the sibling test guards by
 * asserting the four names still exist in the installed library.
 *
 * Not a `animation: 'slide_from_right'` override in JS, because that is a
 * different animation from the one the app has always had on Android 12 and
 * the owner asked for the zoom specifically.
 */

// Verbatim from react-native-screens' res/base/anim/, which is the pre-33 zoom.
const ANIMS = {
  rns_default_enter_in: `<?xml version="1.0" encoding="utf-8"?>
<set xmlns:android="http://schemas.android.com/apk/res/android">
    <alpha
        android:interpolator="@android:interpolator/accelerate_decelerate"
        android:fromAlpha="0"
        android:toAlpha="1.0"
        android:startOffset="100"
        android:duration="100"/>
    <scale
        android:interpolator="@android:interpolator/accelerate_decelerate"
        android:fromXScale="0.85"
        android:toXScale="1"
        android:fromYScale="0.85"
        android:toYScale="1"
        android:pivotX="50%"
        android:pivotY="50%"
        android:duration="200"/>
</set>
`,
  rns_default_enter_out: `<?xml version="1.0" encoding="utf-8"?>
<set xmlns:android="http://schemas.android.com/apk/res/android">
    <alpha
        android:fromAlpha="1"
        android:toAlpha="0.4"
        android:startOffset="100"
        android:duration="100"
        android:interpolator="@android:interpolator/accelerate_decelerate" />
    <scale
        android:interpolator="@android:interpolator/accelerate_decelerate"
        android:fromXScale="1"
        android:toXScale="1.15"
        android:fromYScale="1"
        android:toYScale="1.15"
        android:pivotX="50%"
        android:pivotY="50%"
        android:duration="200"/>
</set>
`,
  rns_default_exit_in: `<?xml version="1.0" encoding="utf-8"?>
<set xmlns:android="http://schemas.android.com/apk/res/android"
    android:shareInterpolator="false">
    <alpha
        android:fromAlpha="0.0"
        android:toAlpha="1"
        android:startOffset="50"
        android:duration="100"/>
    <scale
        android:fromXScale="1.15"
        android:toXScale="1"
        android:fromYScale="1.15"
        android:toYScale="1"
        android:pivotX="50%"
        android:pivotY="50%"
        android:duration="200"/>
</set>
`,
  rns_default_exit_out: `<?xml version="1.0" encoding="utf-8"?>
<set xmlns:android="http://schemas.android.com/apk/res/android"
    android:shareInterpolator="false"
    android:zAdjustment="top">
    <alpha
        android:fromAlpha="1"
        android:toAlpha="0.0"
        android:startOffset="50"
        android:duration="100"/>
    <scale
        android:fromXScale="1"
        android:toXScale="0.85"
        android:fromYScale="1"
        android:toYScale="0.85"
        android:pivotX="50%"
        android:pivotY="50%"
        android:duration="200"/>
</set>
`,
};

const withStackZoomTransition = (config) =>
  withDangerousMod(config, [
    'android',
    (cfg) => {
      const dir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'anim-v33',
      );
      fs.mkdirSync(dir, { recursive: true });
      for (const [name, body] of Object.entries(ANIMS)) {
        fs.writeFileSync(path.join(dir, `${name}.xml`), body);
      }
      return cfg;
    },
  ]);

module.exports = withStackZoomTransition;
module.exports.ANIMS = ANIMS;
