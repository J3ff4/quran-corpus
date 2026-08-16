// Shared colour scales for web and mobile.
//
// Plain TypeScript, zero dependencies, deliberately: three different loaders
// read this file -- jiti (Tailwind config), Next's bundler, and Metro. Do not
// import tailwindcss types here, do not add a build step, do not compile to
// .js. Same rule as tailwind/preset.ts next door.
//
// Scope: the neutral scales plus web's brand accent. The --pos-*/--form-*
// tokens still live in apps/web/src/app/globals.css with their contrast-ratio
// commentary; they move here in M3, when mobile's morphology pills become the
// second consumer.

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
