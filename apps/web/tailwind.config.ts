import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

// Design system « dark premium fitness » — palette imposée par la DA.
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Variables CSS — permutées par [data-theme] dans index.css.
        bg: { DEFAULT: 'var(--bg)', 2: 'var(--bg-2)' },
        card: 'var(--card)',
        line: 'var(--line)',
        ink: { DEFAULT: 'var(--ink)', 2: 'var(--ink-2)' },
        'on-accent': 'var(--on-accent)',
        accent: { DEFAULT: 'var(--accent)', soft: 'var(--accent-soft)' },
        violet: { DEFAULT: 'var(--violet)', soft: 'var(--violet-soft)' },
        success: 'var(--success)',
        warn: 'var(--warn)',
        danger: 'var(--danger)',
      },
      fontFamily: {
        sans: ['"Manrope Variable"', 'Manrope', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '1.25rem', // 20px
        sheet: '1.5rem',
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,0.03) inset',
        lift: '0 8px 30px -12px rgba(0,0,0,0.6)',
      },
      keyframes: {
        'ring-pop': {
          '0%': { transform: 'scale(0.96)', opacity: '0.6' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'pulse-check': {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.12)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        'ring-pop': 'ring-pop 0.35s ease-out',
        'pulse-check': 'pulse-check 0.45s ease-out',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
