export const colors = {
  paper: '#faf8f3',
  ink: '#1f1a14',
  muted: '#7b7165',
  accent: '#1f6f5b',
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
    danger: colors.danger, // 6.9:1 on paper
    onAccent: '#ffffff', // 6.0:1 on accent
  },
  dark: {
    background: colors.night,
    surface: '#1d1b18',
    text: colors.nightText,
    mutedText: '#aaa196',
    border: '#39342f',
    accent: '#5aa58d',
    // Not colors.danger: #9f2d2d on night is 2.5:1, well under AA. Error text
    // is exactly the text a user must be able to read, so the night palette
    // takes a lighter red rather than reusing the brand one.
    danger: '#e88b8b', // 7.4:1 on night
    // Not white: white on the night accent is 2.9:1. Dark ink on that mint is
    // the readable pairing.
    onAccent: colors.night, // 6.3:1 on accent
  },
};

export const typography = {
  arabicReader: 34,
  arabicTitle: 48,
  title: 24,
  body: 16,
  caption: 13,
};

export const touchTargets = {
  minimum: 48,
  compact: 40,
};
