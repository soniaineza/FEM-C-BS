// Brand theme shared by the rider and driver apps. Each app's
// tailwind.config.js lists its own content globs and uses this as a preset.
/** @type {import('tailwindcss').Config} */
module.exports = {
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
        primary: '#0E7C4A',
        'primary-dark': '#0A5F39',
        'primary-gradient-end': '#084A2D',
        'primary-soft': '#E9F4EE',
        // Orange is the accent only: destination pins, ratings, badges and
        // attention states. It never fills large surfaces or carries white text.
        accent: '#F97316',
        'accent-dark': '#C2410C',
        'accent-soft': '#FFF3E8',
        ink: '#111111',
        'bg-light': '#F7F7F7',
        'gray-light': '#F5F5F5',
        border: '#E5E7EB',
        'text-secondary': '#6B7280',
        error: '#DC2626',
        success: '#0E7C4A',
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
        display: ['Poppins_700Bold'],
      },
      spacing: {
        button: '52px',
      },
    },
  },
  plugins: [],
};
