import { paper as paperScale, posColors, formColors } from '@quran-corpus/config/theme/palette';
import type { FormCategory, PosBucket } from '@quran-corpus/data/mobile';

// Widened out of the palette's `as const` literal types on purpose. Two
// reasons: ThemeProvider types its context as `typeof themeColors.light`, and
// literal hexes make the dark theme fail to match the light one; and this
// annotation is what makes the compiler check that the palette covers every
// bucket posBucket can return, rather than leaving it to the runtime test.
const pos: { light: Record<PosBucket, string>; dark: Record<PosBucket, string> } = posColors;

// Widened out of the palette's `as const`, same two reasons as `pos` above:
// ThemeProvider types its context off the light theme, and this annotation is
// what makes the compiler check the palette covers every category
// categorizeFormLabel can return.
const form: { light: Record<FormCategory, string>; dark: Record<FormCategory, string> } = formColors;

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
    // The same red as a FILL rather than as text -- the swipe-to-delete panel
    // is 88pt of solid colour, not a line of type. Light mode can reuse the
    // brand red, because `danger` here is already dark enough to carry white.
    dangerFill: colors.danger,
    onDangerFill: '#ffffff', // 7.3:1 on dangerFill
    onAccent: '#ffffff', // 6.0:1 on accent
    // Same hexes web uses, and the same background (#faf8f3 = paper-50), so
    // the light-mode ratios in packages/config/theme/palette.ts carry over
    // unchanged. Lowest is 5.79:1 on the page, 6.05:1 on a card.
    pos: pos.light,
    // Same hexes web uses, and the same page (#faf8f3 = paper-50), so the
    // light-mode ratios carry over unchanged: verb 5.90/4.61, verbal-noun
    // 6.09/4.84, active-participle 5.82/4.63, passive-participle 5.80/4.62,
    // noun 5.79/4.60, adjective 5.79/4.64, other 7.02/5.55 (page / on its own
    // 16% tint over the page). Measured 2026-08-21.
    form: form.light,
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
    // NOT `danger` above. That red was lightened specifically so error *text*
    // clears AA on night; as an 88pt fill it paints a pale pink block, which
    // reads as a highlight rather than as the destructive action it is. A fill
    // wants the opposite treatment -- dark enough to carry light ink.
    dangerFill: '#a33a3a',
    onDangerFill: colors.nightText, // 5.6:1 on dangerFill
    // Not white: white on the night accent is 2.9:1. Dark ink on that mint is
    // the readable pairing.
    onAccent: colors.night, // 6.3:1 on accent
    // Re-measured against mobile's warm #151412, not web's neutral #141414:
    // noun 8.38, verb 9.00, prep 10.78, pron 9.90, other 7.92:1. All clear AA
    // on the #1d1b18 card surface too, where the lowest is 7.4:1.
    pos: pos.dark,
    // Re-measured against mobile's warm #151412, not web's neutral #141414:
    // verb 9.00/6.73, verbal-noun 9.38/6.88, active-participle 10.78/7.68,
    // passive-participle 9.30/6.83, noun 8.38/6.31, adjective 11.04/7.83,
    // other 7.92/6.01 (page / on its own 16% tint over the page). Measured
    // 2026-08-21.
    form: form.dark,
  },
};

/** The radial wash behind every screen. Two stops, drawn once by <Bloom>.
 *
 *  Geometry matches the mockups: a 120%-wide, 66%-tall ellipse centred at
 *  18% / -6%, so the hot corner sits off the top-left edge and the bottom two
 *  thirds of the screen fall back to the flat page colour. */
export const bloom = {
  light: { cx: '18%', cy: '-6%', rx: '120%', ry: '66%', stops: ['rgba(31,111,91,0.16)', 'rgba(31,111,91,0)'] },
  dark: { cx: '18%', cy: '-6%', rx: '120%', ry: '66%', stops: ['rgba(31,111,91,0.62)', 'rgba(31,111,91,0)'] },
} as const;

/** Fake glass: a translucent fill, a hairline, an inset top highlight and a
 *  drop shadow. Not blur -- React Native has no backdrop-filter, and
 *  expo-blur's Android path (dimezisBlurView) renders the view tree a second
 *  time per blurred surface (owner ruling 2026-08-24, umbrella decision 7).
 *
 *  **Dark mode smokes rather than frosts, and that is a measured decision.**
 *  The mockup fills its dark cards with `rgba(255,255,255,.075)`, which over
 *  the bloom's hot corner composites to #1b4c3f -- and on that, mutedText is
 *  3.83:1 and the accent 3.35:1, both well under AA. A whiter fill makes it
 *  worse, not better: it lifts the surface toward the text. So the dark fill is
 *  the night page colour instead, which darkens the card over the bloom
 *  (accent 4.65:1, muted 5.33:1) and is invisible where there is no bloom --
 *  the card is never *recessed* relative to the page, it just stops glowing.
 *  The alternative was cutting the dark bloom from .62 to .12, which passes but
 *  removes the wash the design is built around. Flip these two values if the
 *  owner prefers that trade; the tests in tokens.test.ts hold either way.
 *
 *  Light mode is a much heavier fill than the mockup's for the same reason
 *  read the other way: over warm paper a 7.5% white wash is invisible, and the
 *  card has to separate from the page for the hairline to mean anything. */
export const glass = {
  light: {
    fill: 'rgba(255,253,248,0.85)',
    border: 'rgba(31,111,91,0.16)',
    highlight: 'rgba(255,255,255,0.90)',
    shadow: {
      shadowColor: '#3a3227',
      shadowOpacity: 0.1,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6,
    },
  },
  dark: {
    // colors.night at 45%. Not a literal -- if the page colour moves, the card
    // must move with it or it starts reading as a recess on unbloomed ground.
    fill: 'rgba(21,20,18,0.45)',
    // .20, not the mockup's .14: on the smoked fill a .14 hairline is 1.54:1
    // and disappears at arm's length, which is the one thing that makes fake
    // glass read as a plain rectangle.
    border: 'rgba(255,255,255,0.20)',
    highlight: 'rgba(255,255,255,0.18)',
    shadow: {
      shadowColor: '#000000',
      shadowOpacity: 0.36,
      shadowRadius: 19,
      shadowOffset: { width: 0, height: 16 },
      elevation: 10,
    },
  },
} as const;

/** Corner radii. 20 is the card in every mockup; 28 is the docked bar and the
 *  tab pill; 12 is a chip. */
export const radii = { chip: 12, card: 20, pill: 28 } as const;

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

/** Font family names, as registered by useCorpusFonts.
 *
 *  Newsreader is the display serif from the M6 mockups; the UI face stays the
 *  platform sans (no fontFamily at all, which is what RN already does). Only
 *  two weights are loaded -- Android resolves `fontWeight` against the loaded
 *  family and a weight with no file falls back to the system face mid-screen,
 *  so headings name the SemiBold family directly rather than asking for 600. */
export const fonts = {
  arabic: 'Hafs',
  display: 'Newsreader',
  displaySemiBold: 'Newsreader-SemiBold',
} as const;

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
