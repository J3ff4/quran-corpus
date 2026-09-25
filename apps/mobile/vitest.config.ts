import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // src/ only, deliberately. A test file under app/ is matched by
    // expo-router's require.context and becomes both a route and a Metro
    // module, which ships vitest and react-dom to the device and breaks
    // `expo export` outright. Route tests live in src/test/routes/ and import
    // the route by relative path. Kept in step with tsconfig.test.json.
    // plugins/ is outside src/ for the same reason app/ is excluded -- it is
    // build tooling, not shipped code, and Metro must never see it -- but its
    // test still has to run: the env gate it covers is what keeps the 604
    // fonts from shipping twice.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'plugins/**/*.test.mjs'],
  },
});
