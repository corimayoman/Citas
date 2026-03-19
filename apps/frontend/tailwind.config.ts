import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#1e40af', foreground: '#ffffff' },
        secondary: { DEFAULT: '#f1f5f9', foreground: '#0f172a' },
        destructive: { DEFAULT: '#dc2626', foreground: '#ffffff' },
        muted: { DEFAULT: '#f8fafc', foreground: '#64748b' },
        accent: { DEFAULT: '#e0f2fe', foreground: '#0369a1' },
        border: '#e2e8f0',
        input: '#e2e8f0',
        ring: '#1e40af',
        background: '#ffffff',
        foreground: '#0f172a',
      },
      borderRadius: { lg: '0.5rem', md: '0.375rem', sm: '0.25rem' },
    },
  },
  plugins: [],
};

export default config;
