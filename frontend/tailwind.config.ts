import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Matrix-green trading-terminal aesthetic, carried over from the original dashboard.
        bg: '#0a0e0a',
        panel: '#0f160f',
        accent: '#22c55e',
        danger: '#ef4444',
        warn: '#f59e0b',
        muted: '#a3b1c6',
      },
      fontFamily: { mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'] },
    },
  },
  plugins: [],
} satisfies Config;
