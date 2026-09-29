// FEM C@BS design tokens — the single source of truth for color, type,
// radius and elevation. Consumed by tailwind.config.js (className utilities)
// and constants/theme.ts (StyleSheet / icon colors), so the two can never
// drift. CommonJS because the Tailwind config is loaded by Node directly.
//
// Structure follows the Radix Colors / shadcn model: raw scales first, then
// *semantic* roles (canvas, surface, fg, border, primary, danger…) that
// screens use. Screens should reach for semantic roles, never raw steps.

const green = {
  50: '#F0FDF4',
  100: '#DCFCE7',
  200: '#BBF7D0',
  300: '#86EFAC',
  400: '#4ADE80',
  500: '#22C55E',
  600: '#16A34A', // brand
  700: '#15803D',
  800: '#166534',
  900: '#14532D',
  950: '#052E16',
};

// Cool neutral ramp (between Tailwind gray and slate) — reads crisp on OLED
// and keeps greys from looking muddy next to the brand green.
const neutral = {
  0: '#FFFFFF',
  25: '#FAFBFC',
  50: '#F5F6F8',
  100: '#EEF0F3',
  200: '#E4E7EC',
  300: '#D0D5DD',
  400: '#98A2B3',
  500: '#667085',
  600: '#4B5565',
  700: '#344054',
  800: '#1D2939',
  900: '#101828',
  950: '#0B0F17',
};

const palette = {
  // Surfaces
  canvas: neutral[50], // app background behind cards
  surface: neutral[0], // cards, sheets, fields
  'surface-muted': neutral[100], // inset wells, secondary buttons, chips
  'surface-inverse': neutral[900], // dark hero cards, toasts
  overlay: 'rgba(16,24,40,0.48)', // modal scrim

  // Foreground (contrast on white: fg 17.6:1, fg-muted 7.4:1, fg-subtle 4.6:1)
  fg: neutral[900],
  'fg-muted': neutral[600],
  'fg-subtle': neutral[500],
  'fg-disabled': neutral[400],
  'fg-inverse': neutral[0],

  // Lines
  border: neutral[200],
  'border-strong': neutral[300],
  divider: neutral[100],

  // Brand
  primary: green[600],
  'primary-hover': green[700],
  'primary-pressed': green[800],
  'primary-soft': green[50],
  'primary-tint': green[100],
  'primary-fg': neutral[0],
  'primary-text': green[700], // brand-colored text on white (AA 5.0:1)

  // Status
  success: green[600],
  'success-soft': green[50],
  danger: '#D92D20',
  'danger-soft': '#FEF3F2',
  'danger-border': '#FECDCA',
  warning: '#B54708', // text-safe amber
  'warning-fill': '#F79009',
  'warning-soft': '#FFFAEB',
  info: '#1570EF',
  'info-soft': '#EFF8FF',
  star: '#FDB022',
};

// Apple-HIG-inspired type ramp, sized for Android and iOS. [fontSize, lineHeight].
const typeScale = {
  'large-title': [30, 36],
  'title-1': [26, 32],
  'title-2': [22, 28],
  'title-3': [18, 24],
  headline: [16, 22],
  body: [16, 24],
  callout: [15, 22],
  subhead: [14, 20],
  footnote: [13, 18],
  caption: [12, 16],
  micro: [11, 14],
};

const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  display: 'Poppins_700Bold',
  displaySemibold: 'Poppins_600SemiBold',
};

const radius = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  pill: 999,
};

// Elevation levels (Material-style numbering, one ink-tinted shadow color).
const elevation = {
  0: { shadowColor: 'transparent', shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0 },
  1: { shadowColor: neutral[900], shadowOpacity: 0.05, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  2: { shadowColor: neutral[900], shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  3: { shadowColor: neutral[900], shadowOpacity: 0.1, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
  4: { shadowColor: neutral[900], shadowOpacity: 0.16, shadowRadius: 40, shadowOffset: { width: 0, height: 16 }, elevation: 16 },
};

const motion = {
  pressScale: 0.97,
  pressOpacity: 0.88,
  fast: 120,
  base: 200,
  slow: 320,
};

module.exports = { green, neutral, palette, typeScale, fonts, radius, elevation, motion };
