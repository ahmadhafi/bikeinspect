/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#ECFDF5',
          100: '#D1FAE5',
          500: '#10B981',
          600: '#059669',
          700: '#047857',
          800: '#065F46',
          900: '#064E3B',
        },
        navy: {
          700: '#1E3A5F',
          800: '#143252',
          900: '#0F2A47',
          950: '#0A1E33',
        },
        surface: '#F3F6F8',
        danger: {
          50: '#FDECEC',
          100: '#FBD5D5',
          600: '#DC2626',
          700: '#B91C1C',
        },
      },
      borderRadius: {
        card: '16px',
      },
      boxShadow: {
        card: '0 2px 10px rgba(15, 42, 71, 0.06)',
        'card-md': '0 4px 16px rgba(15, 42, 71, 0.09)',
      },
    },
  },
  plugins: [],
};
