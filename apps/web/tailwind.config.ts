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
        // Canaux RGB (var --x-rgb) pour que les modificateurs /opacité fonctionnent.
        // Les usages directs en CSS inline utilisent var(--x) (hex).
        bg: { DEFAULT: 'rgb(var(--bg-rgb) / <alpha-value>)', 2: 'rgb(var(--bg-2-rgb) / <alpha-value>)' },
        card: 'rgb(var(--card-rgb) / <alpha-value>)',
        line: 'rgb(var(--line-rgb) / <alpha-value>)',
        ink: { DEFAULT: 'rgb(var(--ink-rgb) / <alpha-value>)', 2: 'rgb(var(--ink-2-rgb) / <alpha-value>)' },
        'on-accent': 'rgb(var(--on-accent-rgb) / <alpha-value>)',
        accent: { DEFAULT: 'rgb(var(--accent-rgb) / <alpha-value>)', soft: 'var(--accent-soft)' },
        violet: { DEFAULT: 'rgb(var(--violet-rgb) / <alpha-value>)', soft: 'var(--violet-soft)' },
        success: 'rgb(var(--success-rgb) / <alpha-value>)',
        warn: 'rgb(var(--warn-rgb) / <alpha-value>)',
        danger: 'rgb(var(--danger-rgb) / <alpha-value>)',
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
