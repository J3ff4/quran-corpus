import { describe, expect, it } from 'vitest';
import { paper } from '@quran-corpus/config/theme/palette';
import { contrast } from '@/testing/contrast';
import { bloom, colors, fonts, glass, themeColors } from './tokens';
import { composite } from '@/testing/rgb';

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

  it('keeps the accent readable on its own wash', () => {
    // accentWash exists so a tinted match is distinguished by more than hue --
    // the accent against surrounding muted text is ~1.26:1, invisible with a
    // colour-vision deficiency. The tint then has to clear AA on the wash it
    // sits on, which is a different background from the page.
    expect(contrast(themeColors.light.accent, themeColors.light.accentWash)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(themeColors.dark.accent, themeColors.dark.accentWash)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('fonts', () => {
  it('names every family the app loads', () => {
    // The strings here must match useCorpusFonts' keys exactly. RN resolves a
    // fontFamily by name at render time and silently falls back to the system
    // face when it misses, so a typo shows up as "the serif never applied" on a
    // device and as nothing at all in a test that only checks the token exists.
    expect(fonts).toEqual({
      arabic: 'Hafs',
      display: 'Newsreader',
      displaySemiBold: 'Newsreader-SemiBold',
    });
  });
});

describe('glass surfaces', () => {
  // The worst call site, not the page. A translucent card over the bloom's hot
  // stop is a different backdrop from theme.background, and it is the one the
  // eye actually reads text on. Measuring against the flat page is how a token
  // passes here and fails on the device.
  const worstBackdrop = {
    light: composite(bloom.light.stops[0], themeColors.light.background),
    dark: composite(bloom.dark.stops[0], themeColors.dark.background),
  } as const;

  for (const mode of ['light', 'dark'] as const) {
    const surface = composite(glass[mode].fill, worstBackdrop[mode]);

    it(`keeps ${mode} body text above AA on glass`, () => {
      expect(contrast(themeColors[mode].text, surface)).toBeGreaterThanOrEqual(4.5);
    });

    it(`keeps ${mode} muted text above AA on glass`, () => {
      expect(contrast(themeColors[mode].mutedText, surface)).toBeGreaterThanOrEqual(4.5);
    });

    it(`keeps ${mode} accent above AA on glass`, () => {
      // The tab bar's active label and every card link.
      expect(contrast(themeColors[mode].accent, surface)).toBeGreaterThanOrEqual(4.5);
    });

    it(`draws the ${mode} hairline visibly against its own fill`, () => {
      // Not an AA rule -- a 1px border is a non-text element, and a hairline
      // that vanishes is the single thing that makes fake glass read as a flat
      // rectangle.
      const border = composite(glass[mode].border, surface);
      expect(contrast(border, surface)).toBeGreaterThanOrEqual(1.2);
    });
  }
});
