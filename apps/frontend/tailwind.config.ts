import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary:     { DEFAULT: '#FF0A6C', foreground: '#ffffff' },
        secondary:   { DEFAULT: '#1a1a2e', foreground: '#a3a3b8' },
        destructive: { DEFAULT: '#ef4444', foreground: '#ffffff' },
        muted:       { DEFAULT: '#0d0d1a', foreground: '#6b6b8a' },
        accent:      { DEFAULT: '#1a1a2e', foreground: '#ffffff' },
        border:      '#1f1f35',
        input:       '#13131f',
        ring:        '#FF0A6C',
        background:  '#080810',
        foreground:  '#ffffff',
        card:        '#0d0d1a',
        fuchsia: {
          DEFAULT: '#FF0A6C',
          light:   '#FF3D8A',
          deep:    '#CC0055',
        },
      },
      borderRadius: { lg: '0.5rem', md: '0.375rem', sm: '0.25rem' },
      fontFamily: { sans: ['Outfit', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};

export default config;
