import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0b6e4f',
          dark: '#074a35',
        },
      },
    },
  },
  plugins: [],
};

export default config;
