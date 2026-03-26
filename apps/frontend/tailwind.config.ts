import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary:     { DEFAULT: '#FF0A6C', foreground: '#ffffff', light: '#FF3D8A', deep: '#CC0055' },
        secondary:   { DEFAULT: '#E2E8F0', foreground: '#475569' },
        destructive: { DEFAULT: '#ef4444', foreground: '#ffffff' },
        muted:       { DEFAULT: '#DBEAFE', foreground: '#64748B' },
        accent:      { DEFAULT: '#DBEAFE', foreground: '#1E293B' },
        border:      '#BFDBFE',
        input:       '#F8FAFC',
        ring:        '#FF0A6C',
        background:  '#EFF6FF',
        foreground:  '#0F172A',
        card:        { DEFAULT: '#FFFFFF', foreground: '#0F172A' },
        success:     { DEFAULT: '#059669', light: '#D1FAE5' },
        warning:     { DEFAULT: '#D97706', light: '#FEF3C7' },
      },
      borderRadius: { lg: '0.5rem', md: '0.375rem', sm: '0.25rem' },
      fontFamily: { sans: ['Outfit', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};

export default config;
