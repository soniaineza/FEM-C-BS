/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // Brand tokens ported 1:1 from the Flutter app's AppColors/AppTheme
      // (lib/core/constants/app_colors.dart, lib/core/theme/app_theme.dart)
      // so the RN screens match the app's existing visual identity.
      colors: {
        primary: '#16A34A',
        'primary-dark': '#15803D',
        'primary-gradient-end': '#0F7A38',
        ink: '#111111',
        'bg-light': '#F7F7F7',
        'gray-light': '#F5F5F5',
        border: '#E5E7EB',
        'text-secondary': '#6B7280',
        error: '#DC2626',
        success: '#16A34A',
        warning: '#D97706',
      },
      borderRadius: {
        DEFAULT: '12px',
      },
      fontFamily: {
        sans: ['Inter_400Regular'],
        medium: ['Inter_500Medium'],
        semibold: ['Inter_600SemiBold'],
        bold: ['Inter_700Bold'],
      },
      spacing: {
        button: '52px',
      },
    },
  },
  plugins: [],
};
