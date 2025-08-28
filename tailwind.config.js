/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'gray-925': '#1a1a1a',
        'gray-950': '#0a0a0a',
        'gray-900': '#1f1f1f',
        'gray-875': '#252525',
        'gray-850': '#2a2a2a',
        'gray-825': '#353535',
        'gray-750': '#3a3a3a',
        'gray-650': '#555',
        'gray-550': '#777',
        'gray-450': '#999',
        'blue-450': '#4a9eff',
        'blue-350': '#3a8eef'
      },
      fontSize: {
        '3xs': '9px',
        '2xs': '10px',
        'xs': '11px',
        'sm': '12px',
        'md': '13px'
      }
    },
  },
  plugins: [],
}