// This file is intentionally .ts — Tailwind config loading (jiti) and Next.js (Turbopack/webpack)
// resolve .ts files directly. Do not compile to .js.
import type { Config } from 'tailwindcss';
import { accent, night, paper } from '../theme/palette';

const preset: Partial<Config> = {
  // Class strategy so the in-app theme toggle can override the OS preference;
  // first visit falls back to the OS via the pre-hydration script in
  // apps/web/src/app/layout.tsx.
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        arabic: ['var(--font-arabic)', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        'surah-name': ['var(--font-surah-name)', 'serif'],
        'surah-name-v4': ['var(--font-surah-name-v4)', 'serif'],
      },
      colors: {
        paper,
        night,
        accent,
      },
    },
  },
};

export default preset;
