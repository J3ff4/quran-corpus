import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_DIR = path.resolve(__dirname, '../../../app');

/** Every .ts/.tsx under app/, relative to app/. */
function sourceFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return sourceFiles(path.join(dir, entry.name), rel);
    return /\.tsx?$/.test(entry.name) ? [rel] : [];
  });
}

describe('app/ directory', () => {
  it('holds no test files', () => {
    // expo-router's require.context matches EVERY .ts/.tsx under app/ except
    // +api/+html/+middleware, so a test file colocated with a route becomes a
    // route *and* a Metro module: vitest, @testing-library/react and react-dom
    // ship to the device, and the export fails on the first import Metro cannot
    // resolve. That is exactly what happened -- lint, both tsc programs and the
    // whole suite stayed green while `expo export --platform android` was
    // broken, because nothing here reads the bundler's view of app/.
    // Route tests belong in this directory and import the route by path.
    expect(sourceFiles(APP_DIR).filter((f) => /\.test\.tsx?$/.test(f))).toEqual([]);
  });
});

describe('root stack', () => {
  it('anchors the stack on the tab group', async () => {
    // Read as source rather than imported: app/_layout.tsx pulls
    // expo-splash-screen, expo-router and the corpus DB into the module graph,
    // and this assertion is about a routing constant, not about mounting the
    // app.
    //
    // Without the anchor a cold deep link into /surah/:id leaves the reader as
    // the stack's only route: the header still draws a back arrow, and it
    // reports `GO_BACK was not handled by any navigator` and goes nowhere
    // (#35). This cannot prove the navigator's runtime behaviour -- only a
    // device can -- but it does pin the constant that produces it.
    const layout = await readFile(path.join(APP_DIR, '_layout.tsx'), 'utf8');

    expect(layout).toMatch(/export const unstable_settings = \{ anchor: '\(tabs\)' \}/);
  });
});
