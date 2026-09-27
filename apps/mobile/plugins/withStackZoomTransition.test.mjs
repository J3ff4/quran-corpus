import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
// CommonJS, because that is what `expo prebuild` loads it as.
const plugin = require_('./withStackZoomTransition.js');

describe('withStackZoomTransition', () => {
  it('overrides names react-native-screens actually ships', () => {
    // The override works by resource-name collision, so a rename upstream
    // turns it into a silent no-op: the build stays green, the files are
    // packaged, and nothing points at them. This is the only thing that
    // notices.
    const rns = path.dirname(require_.resolve('react-native-screens/package.json'));
    for (const name of Object.keys(plugin.ANIMS)) {
      const shipped = path.join(rns, 'android/src/main/res/v33/anim-v33', `${name}.xml`);
      expect(fs.existsSync(shipped), `${name} is no longer in react-native-screens`).toBe(true);
    }
  });

  it('writes the zoom, not the v33 translate', () => {
    // The whole point is the 0.85 scale. A body without it would be the
    // animation being replaced, copied over itself.
    expect(plugin.ANIMS.rns_default_enter_in).toContain('android:fromXScale="0.85"');
    expect(plugin.ANIMS.rns_default_exit_out).toContain('android:toXScale="0.85"');
    for (const body of Object.values(plugin.ANIMS)) {
      expect(body).not.toContain('<extend');
      expect(body).not.toContain('<translate');
    }
  });

  it('lands them in anim-v33, where the library variant they replace lives', () => {
    // anim/ would be a second, unused copy: API 33+ resolves anim-v33 first,
    // and API < 33 already gets the zoom from the library.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zoom-'));
    const mod = plugin({ name: 'x', plugins: [] }).mods.android.dangerous;
    mod({ modRequest: { platformProjectRoot: root } });

    const dir = path.join(root, 'app/src/main/res/anim-v33');
    expect(fs.readdirSync(dir).sort()).toEqual(
      Object.keys(plugin.ANIMS)
        .map((n) => `${n}.xml`)
        .sort(),
    );
    fs.rmSync(root, { recursive: true, force: true });
  });
});
