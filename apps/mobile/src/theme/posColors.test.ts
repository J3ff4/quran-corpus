import { describe, expect, it } from 'vitest';
import { posBucket, type PosBucket } from '@quran-corpus/data/mobile';
import { themeColors } from './tokens';

const BUCKETS: PosBucket[] = ['noun', 'verb', 'prep', 'pron', 'other'];

function contrast(hex: string, bg: string): number {
  const channel = (h: string, i: number) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const lum = (h: string) =>
    0.2126 * channel(h, 1) + 0.7152 * channel(h, 3) + 0.0722 * channel(h, 5);
  const [hi, lo] = [lum(hex), lum(bg)].sort((a, b) => b - a);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe('mobile POS colours', () => {
  it('covers every bucket posBucket can return, in both themes', () => {
    // A bucket with no colour renders `undefined` as a style value, which RN
    // silently ignores -- the pill loses its colour with no error anywhere.
    for (const bucket of BUCKETS) {
      expect(themeColors.light.pos[bucket]).toMatch(/^#[0-9a-f]{6}$/i);
      expect(themeColors.dark.pos[bucket]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('meets WCAG AA against each theme background', () => {
    // Mobile's dark background is #151412, warm -- NOT web's neutral #141414,
    // which is what the palette's ratios were measured against. A value that
    // passes on web is not automatically AA here.
    for (const bucket of BUCKETS) {
      expect(
        contrast(themeColors.light.pos[bucket], themeColors.light.background),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(themeColors.dark.pos[bucket], themeColors.dark.background),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('stays AA on a card as well as on the page', () => {
    // Pills sit on AyahCard's `surface`, not on the page background, and the
    // two are different colours in both themes. Measuring only the page is
    // the mistake paper-token-contrast has already produced once on web.
    for (const bucket of BUCKETS) {
      expect(contrast(themeColors.light.pos[bucket], themeColors.light.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(themeColors.dark.pos[bucket], themeColors.dark.surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('gives the buckets distinct colours', () => {
    // Two buckets sharing a hex makes the colour coding decorative rather
    // than informative -- the reader cannot tell a verb from a preposition.
    expect(new Set(BUCKETS.map((b) => themeColors.light.pos[b])).size).toBe(BUCKETS.length);
    expect(new Set(BUCKETS.map((b) => themeColors.dark.pos[b])).size).toBe(BUCKETS.length);
  });

  it('has a colour for every tag posBucket buckets', () => {
    // Guards the seam: if posBucket ever gains a sixth bucket, this fails
    // rather than rendering that bucket colourless.
    for (const tag of ['N', 'PN', 'ADJ', 'V', 'P', 'PRON', 'NEG', 'CONJ']) {
      const bucket = posBucket(tag);
      expect(bucket).not.toBeNull();
      expect(themeColors.light.pos[bucket!]).toBeDefined();
    }
  });
});
