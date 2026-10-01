/** @type {import('tailwindcss').Config} */
const { green, neutral, palette, typeScale, fonts, radius } = require('./constants/tokens');

const fontSize = Object.fromEntries(
  Object.entries(typeScale).map(([name, [size, lineHeight]]) => [name, [`${size}px`, { lineHeight: `${lineHeight}px` }]])
);

module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  // The app is light-only by design. Left at NativeWind's default
  // `darkMode: 'media'`, some dependency in the tree (React Navigation's
  // theme provider, wired in automatically by expo-router's Stack/Tabs)
  // calls Appearance.setColorScheme() during init, which react-native-css-
  // interop only permits under 'class' mode — under 'media' it throws
  // "Cannot manually set color scheme, as dark mode is type 'media'" and
  // aborts rendering entirely (this crashed the whole app on real devices).
  // 'class' mode allows manual scheme calls to pass through harmlessly;
  // since nothing here ever toggles a 'dark' class, the app stays light-only.
  darkMode: 'class',
  theme: {
    extend: {
      // All values come from constants/tokens.js — see docs/DESIGN_SYSTEM.md.
      colors: {
        ...palette,
        green,
        neutral,
        // Legacy aliases kept so older class names resolve to the new palette.
        ink: palette.fg,
        'text-secondary': palette['fg-muted'],
        'bg-light': palette.canvas,
        'gray-light': palette['surface-muted'],
        'primary-dark': palette['primary-hover'],
        'primary-gradient-end': green[800],
        error: palette.danger,
        // Orange brand primary from main's home-screen restyle.
        primary: '#F97316',
        'primary-dark': '#EA580C',
        'primary-gradient-end': '#C2410C',
      },
      fontSize,
      borderRadius: {
        DEFAULT: `${radius.md}px`,
        card: `${radius.xl}px`,
        sheet: `${radius['3xl']}px`,
      },
      fontFamily: {
        sans: [fonts.regular],
        medium: [fonts.medium],
        semibold: [fonts.semibold],
        bold: [fonts.bold],
        display: [fonts.display],
      },
      spacing: {
        button: '52px',
        gutter: '20px',
      },
    },
  },
  plugins: [],
};
