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

export const themeColors = {
  light: {
    background: colors.paper,
    surface: '#fffdf8',
    text: colors.ink,
    mutedText: colors.muted,
    border: colors.border,
    accent: colors.accent,
  },
  dark: {
    background: colors.night,
    surface: '#1d1b18',
    text: colors.nightText,
    mutedText: '#aaa196',
    border: '#39342f',
    accent: '#5aa58d',
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
