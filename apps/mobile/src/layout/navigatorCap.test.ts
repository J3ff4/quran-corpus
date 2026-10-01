import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PR #104 capped content at the navigator, so every screen in the app became a
 * 640dp strip with dead bands either side on any display wider than a phone
 * (owner, Tab S10+, 2026-09-28). A reading measure belongs to the content that
 * wants one -- the reader column, the prose screens -- never to a navigator,
 * which cannot know what the screen below it is drawing.
 */
describe('no width cap on a navigator', () => {
  const root = join(__dirname, '..', '..');

  for (const file of ['app/_layout.tsx', 'app/(tabs)/_layout.tsx']) {
    it(`${file} does not cap scene width`, () => {
      const source = readFileSync(join(root, file), 'utf8');
      // Whole file, not a `{[^}]*}` slice of it: that slice stops at the
      // first `}`, so a style holding any nested object truncates before a
      // maxWidth further down and the assertion passes over the very cap it
      // was written to catch (review, 2026-10-01).
      expect(source).toMatch(/(?:contentStyle|sceneStyle):/);
      expect(source).not.toMatch(/maxWidth|centredContent/);
    });
  }
});
