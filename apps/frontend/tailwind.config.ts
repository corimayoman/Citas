import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary:     { DEFAULT: '#ffffff', foreground: '#0a0a0a' },
        secondary:   { DEFAULT: '#1a1a1a', foreground: '#a3a3a3' },
        destructive: { DEFAULT: '#ef4444', foreground: '#ffffff' },
        muted:       { DEFAULT: '#111111', foreground: '#737373' },
        accent:      { DEFAULT: '#1f1f1f', foreground: '#ffffff' },
        border:      '#1f1f1f',
        input:       '#1a1a1a',
        ring:        '#ffffff',
        background:  '#0a0a0a',
        foreground:  '#ffffff',
        card:        '#111111',
      },
      borderRadius: { lg: '0.5rem', md: '0.375rem', sm: '0.25rem' },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};

export default config;
