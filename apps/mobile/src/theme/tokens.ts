import { paper as paperScale, posColors } from '@quran-corpus/config/theme/palette';
import type { PosBucket } from '@quran-corpus/data/mobile';

// Widened out of the palette's `as const` literal types on purpose. Two
// reasons: ThemeProvider types its context as `typeof themeColors.light`, and
// literal hexes make the dark theme fail to match the light one; and this
// annotation is what makes the compiler check that the palette covers every
// bucket posBucket can return, rather than leaving it to the runtime test.
const pos: { light: Record<PosBucket, string>; dark: Record<PosBucket, string> } = posColors;

export const colors = {
  paper: paperScale[50],
  ink: paperScale[900],
  muted: '#7b7165',
  // Deliberately NOT the web brand accent (terracotta, accent-500 #bd5f30).
  // Owner ruling 2026-08-16: the two products keep separate accents, and
  // parity covers the paper/night neutrals only. Do not "fix" this to match.
  accent: '#1f6f5b',
  // Warm near-miss of the shared night-400 (#141414), which is pure grey.
  // Not the same colour and not rounded to it -- the warmth is the night
  // mode's character.
  night: '#151412',
  nightText: '#f1ede4',
  border: '#ded6c9',
  danger: '#9f2d2d',
  success: '#2f7a4f',
};

// Contrast ratios below are against each palette's own `background`, computed
// from the WCAG relative-luminance formula. AA body text needs 4.5:1.
export const themeColors = {
  light: {
    background: colors.paper,
    surface: '#fffdf8',
    text: colors.ink,
    mutedText: colors.muted,
    border: colors.border,
    accent: colors.accent,
    // The accent at 12% over the page. Carries the tint that hue alone cannot:
    // accent on it is 4.82:1, so a tinted match clears AA for body text.
    accentWash: '#e0e8e1',
    danger: colors.danger, // 6.9:1 on paper
    onAccent: '#ffffff', // 6.0:1 on accent
    // Same hexes web uses, and the same background (#faf8f3 = paper-50), so
    // the light-mode ratios in packages/config/theme/palette.ts carry over
    // unchanged. Lowest is 5.79:1 on the page, 6.05:1 on a card.
    pos: pos.light,
  },
  dark: {
    background: colors.night,
    surface: '#1d1b18',
    text: colors.nightText,
    mutedText: '#aaa196',
    border: '#39342f',
    accent: '#5aa58d',
    // The night accent at 18% over night -- a heavier mix than light's 12%,
    // which is what it takes to be visible on #151412. Accent on it is 4.85:1.
    accentWash: '#212e28',
    // Not colors.danger: #9f2d2d on night is 2.5:1, well under AA. Error text
    // is exactly the text a user must be able to read, so the night palette
    // takes a lighter red rather than reusing the brand one.
    danger: '#e88b8b', // 7.4:1 on night
    // Not white: white on the night accent is 2.9:1. Dark ink on that mint is
    // the readable pairing.
    onAccent: colors.night, // 6.3:1 on accent
    // Re-measured against mobile's warm #151412, not web's neutral #141414:
    // noun 8.38, verb 9.00, prep 10.78, pron 9.90, other 7.92:1. All clear AA
    // on the #1d1b18 card surface too, where the lowest is 7.4:1.
    pos: pos.dark,
  },
};

export const typography = {
  // Was 34/48. Owner ruling 2026-08-16 after the M3 device run: the Arabic ran
  // much larger than web's reader (30px) and dominated the card. These are the
  // 'medium' step; useArabicSizes multiplies them.
  arabicReader: 28,
  arabicTitle: 36,
  title: 24,
  body: 16,
  caption: 13,
};

/** Reader-Arabic size steps. Multipliers, not absolute sizes, so Android's own
 *  font scaling composes with this rather than being overridden by it. */
export const arabicScales = {
  small: 0.8,
  medium: 1,
  large: 1.25,
  xlarge: 1.5,
} as const;

export type ArabicScale = keyof typeof arabicScales;

export const touchTargets = {
  minimum: 48,
  compact: 40,
};
