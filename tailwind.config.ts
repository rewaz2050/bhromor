import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx,mdx}',
    './components/**/*.{ts,tsx,mdx}',
    './lib/**/*.{ts,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Core palette: deep evergreen, warm ivory, clay, brass
        ink: {
          DEFAULT: '#12181a',
          soft: '#2b3538',
          mute: '#5d6a6d',
        },
        ivory: {
          DEFAULT: '#f6f1e8',
          deep: '#ece4d6',
          pale: '#fbf8f2',
        },
        moss: {
          50: '#f1f5f0',
          100: '#dde7da',
          200: '#bccfb7',
          300: '#93b08d',
          400: '#6b8f68',
          500: '#4d734c',
          600: '#3a5a3b',
          700: '#2f4731',
          800: '#273a2a',
          900: '#1e2c21',
          950: '#121c15',
        },
        clay: {
          100: '#f6e3d8',
          200: '#ecc7b1',
          300: '#dda584',
          400: '#c9815a',
          500: '#b56a44',
          600: '#9a5537',
        },
        brass: {
          200: '#e8d7a8',
          300: '#d9bf7c',
          400: '#c4a455',
          500: '#a9863c',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        bengali: ['var(--font-bengali)', 'var(--font-display)', 'serif'],
      },
      letterSpacing: {
        widest2: '0.28em',
      },
      maxWidth: {
        '8xl': '88rem',
      },
      transitionTimingFunction: {
        calm: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        drift: {
          '0%, 100%': { transform: 'translateY(0) scale(1)' },
          '50%': { transform: 'translateY(-14px) scale(1.04)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        breathe: {
          '0%, 100%': { opacity: '0.35', transform: 'scale(1)' },
          '50%': { opacity: '0.7', transform: 'scale(1.08)' },
        },
      },
      animation: {
        rise: 'rise 0.9s cubic-bezier(0.22, 1, 0.36, 1) both',
        drift: 'drift 12s ease-in-out infinite',
        marquee: 'marquee 42s linear infinite',
        breathe: 'breathe 9s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
