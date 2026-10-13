/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        table: {
          felt: '#0d381e',
          'felt-light': '#134c2a',
          'felt-dark': '#082413',
          border: '#3b220d',
          gold: '#cba135',
        },
        chip: {
          gold: '#eab308',
          red: '#ef4444',
          blue: '#3b82f6',
          purple: '#a855f7',
          green: '#22c55e',
          black: '#27272a',
        },
      },
      keyframes: {
        'allin-shake': {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '10%, 30%, 50%, 70%, 90%': { transform: 'translate(-3px, 2px)' },
          '20%, 40%, 60%, 80%': { transform: 'translate(3px, -2px)' },
        },
        'gold-stream': {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        'float-up': {
          '0%': { opacity: '0', transform: 'translateY(10px) scale(0.8)' },
          '20%': { opacity: '1', transform: 'translateY(-5px) scale(1.1)' },
          '80%': { opacity: '1', transform: 'translateY(-15px) scale(1)' },
          '100%': { opacity: '0', transform: 'translateY(-25px) scale(0.9)' },
        },
      },
      animation: {
        'allin-shake': 'allin-shake 0.4s ease-in-out',
        'gold-stream': 'gold-stream 3s ease infinite',
        'float-up': 'float-up 2.5s ease-out forwards',
      },
    },
  },
  plugins: [],
};
