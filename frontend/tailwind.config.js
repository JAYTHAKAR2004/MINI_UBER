/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#E23744',
          primaryDark: '#CB202D',
          primarySoft: '#FFF1F2',
          primaryBorder: '#FECDD3',
          black: '#1C1C1C',
          rating: '#267E3E',
        },
        surface: {
          soft: '#F8F8F8',
          muted: '#EFEFEF',
          card: '#FFFFFF',
        },
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        soft: '0 2px 12px rgba(28, 28, 28, 0.05)',
        card: '0 8px 28px rgba(28, 28, 28, 0.06)',
        elevated: '0 16px 40px rgba(28, 28, 28, 0.10)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite linear',
      },
    },
  },
  plugins: [],
};
