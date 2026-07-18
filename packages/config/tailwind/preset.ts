// This file is intentionally .ts — Tailwind config loading (jiti) and Next.js (Turbopack/webpack)
// resolve .ts files directly. Do not compile to .js.
import type { Config } from 'tailwindcss';

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
        paper: {
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
        },
        night: {
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
        },
        accent: {
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
        },
      },
    },
  },
};

export default preset;
