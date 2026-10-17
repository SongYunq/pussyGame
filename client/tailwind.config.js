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
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)' },
          '12%': { transform: 'translate3d(-6px, 4px, 0) scale(1.008)' },
          '24%': { transform: 'translate3d(6px, -4px, 0) scale(1.006)' },
          '36%': { transform: 'translate3d(-5px, -3px, 0) scale(1.004)' },
          '48%': { transform: 'translate3d(5px, 3px, 0) scale(1.002)' },
          '64%': { transform: 'translate3d(-3px, 2px, 0)' },
          '80%': { transform: 'translate3d(2px, -1px, 0)' },
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
        'allin-shake': 'allin-shake 0.55s cubic-bezier(0.36, 0.07, 0.19, 0.97)',
        'gold-stream': 'gold-stream 3s ease infinite',
        'float-up': 'float-up 2.5s ease-out forwards',
      },
    },
  },
  plugins: [],
};
