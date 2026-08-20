import { readdirSync } from 'node:fs';
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
