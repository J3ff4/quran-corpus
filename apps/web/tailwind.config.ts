import type { Config } from 'tailwindcss';
import preset from '@quran-corpus/config/tailwind/preset';

const config: Config = {
  presets: [preset as Config],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
