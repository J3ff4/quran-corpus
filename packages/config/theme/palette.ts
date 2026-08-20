// Shared colour scales for web and mobile.
//
// Plain TypeScript, zero dependencies, deliberately: three different loaders
// read this file -- jiti (Tailwind config), Next's bundler, and Metro. Do not
// import tailwindcss types here, do not add a build step, do not compile to
// .js. Same rule as tailwind/preset.ts next door.
//
// Scope: the neutral scales, web's brand accent, and (since M3, when mobile's
// morphology pills became the second consumer) the --pos-*/--form-* colours
// with their contrast-ratio commentary. apps/web/src/app/globals.css holds a
// copy of the latter for Tailwind to read; posColor.parity.test.ts holds the
// two equal.

export const paper = {
  50: '#faf8f3',
  100: '#f3efe6',
  200: '#e8e0d0',
  300: '#d4c9b0',
  400: '#b8a88a',
  500: '#9e8c6e',
  600: '#7d6d52',
  700: '#5e5040',
  800: '#3e3429',
  900: '#1f1a14',
};

export const night = {
  50: '#2a2a2a',
  100: '#242424',
  200: '#1e1e1e',
  300: '#181818',
  400: '#141414',
  500: '#111111',
  600: '#0e0e0e',
  700: '#0a0a0a',
  800: '#080808',
  900: '#050505',
};

// Web's brand accent. Mobile keeps its own green -- see the note in
// apps/mobile/src/theme/tokens.ts.
export const accent = {
  50: '#fdf3ee',
  100: '#f8e0d1',
  200: '#eec0a3',
  300: '#e19d74',
  400: '#d17a48',
  500: '#bd5f30',
  600: '#9c4d27',
  700: '#7a3d20',
  800: '#572c18',
  900: '#351a0e',
};

// POS colours, moved out of apps/web/src/app/globals.css in M3 when mobile
// became the second consumer. Ratios are light-mode against paper-50 and
// paper-100 respectively; dark-mode against night-400. Same rule as the
// scales above: no imports, no build step -- jiti, Next and Metro all read
// this file directly.
//
// Hexes are written in full six-digit form. globals.css keeps its own literal
// copy (a stylesheet cannot import TypeScript) and apps/web/src/lib/
// posColor.parity.test.ts compares the two as strings, so CSS shorthand would
// make an identical colour compare unequal.
export const posColors = {
  light: {
    noun: '#2161b2', // 5.79 / 4.60:1
    verb: '#ab392c', // 5.90 / 4.61:1
    prep: '#0c6e55', // 5.86 / 4.65:1
    pron: '#86580f', // 5.79 / 4.61:1
    other: '#555555', // 7.02 / 5.55:1
  },
  dark: {
    noun: '#7fb0ff',
    verb: '#ff9a8f',
    prep: '#6fd9b8',
    pron: '#e0b877',
    other: '#aaaaaa',
  },
} as const;

// Dictionary derived forms, not sentence-position POS tags. verb/noun/other
// deliberately reuse their --pos-* counterparts' hex.
export const formColors = {
  light: {
    verb: '#ab392c', // 5.90 / 4.61:1
    'verbal-noun': '#6b4fa0', // 6.09 / 4.84:1
    'active-participle': '#186e55', // 5.82 / 4.63:1
    'passive-participle': '#914a6f', // 5.80 / 4.62:1
    noun: '#2161b2', // 5.79 / 4.60:1
    adjective: '#84590b', // 5.79 / 4.64:1
    other: '#555555', // 7.02 / 5.55:1
  },
  dark: {
    verb: '#ff9a8f',
    'verbal-noun': '#c3b0e8',
    'active-participle': '#6fd9b8',
    'passive-participle': '#e0a8c8',
    noun: '#7fb0ff',
    adjective: '#e8c477',
    other: '#aaaaaa',
  },
} as const;

// The built-in CSS easings are too weak to read as intentional. Strong
// ease-out for anything entering or expanding -- it moves immediately, which
// is the moment the user is watching. Never ease-in for UI: the delayed start
// makes the same duration *feel* slower.
export const easeOut = 'cubic-bezier(0.23, 1, 0.32, 1)';
