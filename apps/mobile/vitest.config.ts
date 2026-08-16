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
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
