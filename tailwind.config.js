/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'brand-blue': '#4a9eff',
        'brand-blue-hover': '#3a8eef',
        'dark-bg': '#0a0a0a',
        'dark-panel': '#1a1a1a',
        'dark-surface': '#1f1f1f',
        'dark-surface-2': '#252525',
        'dark-surface-3': '#2a2a2a',
        'dark-border': '#333',
        'dark-border-2': '#3a3a3a',
        'dark-border-3': '#444',
        'dark-text': '#e0e0e0',
        'dark-text-muted': '#999',
        'dark-text-dim': '#777',
        'dark-hover': '#353535',
      }
    }
  },
  plugins: []
}