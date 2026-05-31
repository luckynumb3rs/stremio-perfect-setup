/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent:     'var(--accent)',
        'accent-2': 'var(--accent-2)',
        panel:      'var(--panel)',
        'panel-2':  'var(--panel-2)',
        muted:      'var(--muted)',
        border:     'var(--border)',
      },
      fontFamily: {
        sans: ['"Space Grotesk"', 'Avenir Next', 'Segoe UI', 'sans-serif'],
        mono: ['"IBM Plex Mono"', '"Cascadia Code"', 'monospace'],
      },
      borderRadius: { wizard: '14px' },
      boxShadow:    { wizard: 'var(--shadow)' },
    },
  },
};
