/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  // The app is light-only by design (matches the original Flutter app —
  // no dark theme was ever built). Left at NativeWind's default
  // `darkMode: 'media'`, some dependency in the tree (React Navigation's
  // theme provider, wired in automatically by expo-router's Stack/Tabs)
  // calls Appearance.setColorScheme() during init, which react-native-css-
  // interop only permits under 'class' mode — under 'media' it throws
  // "Cannot manually set color scheme, as dark mode is type 'media'" and
  // aborts rendering entirely (this crashed the whole app on real devices).
  // 'class' mode allows manual scheme calls to pass through harmlessly;
  // since nothing here ever toggles a 'dark' class, the app stays light-only
  // regardless.
  darkMode: 'class',
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
        sans: ['Poppins_400Regular'],
        medium: ['Poppins_500Medium'],
        semibold: ['Poppins_600SemiBold'],
        bold: ['Poppins_700Bold'],
      },
      spacing: {
        button: '52px',
      },
    },
  },
  plugins: [],
};
