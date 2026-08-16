import { describe, expect, it } from 'vitest';
import { paper } from '@quran-corpus/config/theme/palette';
import { colors, themeColors } from './tokens';

describe('themeColors', () => {
  it('takes its light neutrals from the shared paper scale', () => {
    expect(themeColors.light.background).toBe(paper[50]);
    expect(themeColors.light.text).toBe(paper[900]);
  });

  it('keeps a night-specific error colour rather than the brand red', () => {
    // #9f2d2d on night is 2.5:1, well under AA -- and error text is exactly
    // the text a user must be able to read. A palette refactor that flattens
    // this back to colors.danger is the failure this test exists to catch.
    expect(themeColors.dark.danger).not.toBe(colors.danger);
    expect(themeColors.dark.danger).toBe('#e88b8b');
  });

  it('keeps dark onAccent as night ink, not white', () => {
    // White on the night accent is 2.9:1; dark ink on that mint is the
    // readable pairing.
    expect(themeColors.dark.onAccent).toBe(colors.night);
    expect(themeColors.light.onAccent).toBe('#ffffff');
  });

  it('keeps the mobile accent off the web brand accent', () => {
    // Owner ruling 2026-08-16: the two products keep separate accents.
    expect(colors.accent).toBe('#1f6f5b');
    expect(themeColors.dark.accent).toBe('#5aa58d');
  });
});
