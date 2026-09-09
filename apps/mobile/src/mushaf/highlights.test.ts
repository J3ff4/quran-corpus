import { describe, expect, it } from 'vitest';

import { themeColors } from '@/theme/tokens';

import { ayahKey, colorForAyah } from './highlights';

const theme = themeColors.light;
const base = { bookmarked: new Set<string>(), landing: null, playing: null, landingProgress: 0 };

describe('colorForAyah', () => {
  it('leaves an ordinary ayah in the page-s text colour', () => {
    expect(colorForAyah(base, theme)(2, 5)).toBe(theme.text);
  });

  it('tints a bookmarked ayah', () => {
    const c = colorForAyah({ ...base, bookmarked: new Set([ayahKey(2, 5)]) }, theme);
    expect(c(2, 5)).not.toBe(theme.text);
    expect(c(2, 6)).toBe(theme.text);
  });

  it('lets audio win over a landing pulse and a bookmark on the same ayah', () => {
    // Ruling 20 puts all three on one ayah. The playing ayah is the one that
    // moves, so it has to stay legible as it moves.
    const all = {
      bookmarked: new Set([ayahKey(2, 5)]),
      landing: ayahKey(2, 5),
      playing: ayahKey(2, 5),
      landingProgress: 1,
    };
    expect(colorForAyah(all, theme)(2, 5)).toBe(theme.accent);
  });

  it('lets a landing pulse win over a bookmark', () => {
    const bookmarked = new Set([ayahKey(2, 5)]);
    const c = colorForAyah({ ...base, bookmarked, landing: ayahKey(2, 5), landingProgress: 1 }, theme);
    expect(c(2, 5)).not.toBe(theme.text);
    expect(c(2, 5)).not.toBe(colorForAyah({ ...base, bookmarked }, theme)(2, 5));
    // Short of the accent, so a playing ayah is still the loudest thing there.
    expect(c(2, 5)).not.toBe(theme.accent);
  });

  it('returns the bookmark tint once the pulse has faded out', () => {
    const withBookmark = { ...base, bookmarked: new Set([ayahKey(2, 5)]) };
    const faded = colorForAyah({ ...withBookmark, landing: ayahKey(2, 5), landingProgress: 0 }, theme);
    expect(faded(2, 5)).toBe(colorForAyah(withBookmark, theme)(2, 5));
  });

  it('keys on the surah too, so a page crossing a boundary tints one ayah', () => {
    const c = colorForAyah({ ...base, playing: ayahKey(78, 5) }, theme);
    expect(c(78, 5)).toBe(theme.accent);
    expect(c(77, 5)).toBe(theme.text);
  });

  it('survives a spring overshooting past the pulse-s peak', () => {
    // landingProgress comes off a spring, which overshoots 1. Unclamped that
    // walks the channels past the accent and can leave the byte range, which
    // renders as an invalid colour rather than as a loud one.
    const c = colorForAyah({ ...base, landing: ayahKey(2, 5), landingProgress: 1.4 }, theme)(2, 5);
    expect(c).toMatch(/^#[0-9a-f]{6}$/);
    expect(c).toBe(colorForAyah({ ...base, landing: ayahKey(2, 5), landingProgress: 1 / 0.8 }, theme)(2, 5));
  });
});
