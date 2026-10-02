// Typed access to the design tokens in ./tokens.js for StyleSheet styles and
// icon colors. className styling reads the same tokens via tailwind.config.js.
// See docs/DESIGN_SYSTEM.md for how to use each role.
import tokens from './tokens';

const { palette, green, orange, neutral, typeScale, fonts, radius, elevation, motion } = tokens;

export const Colors = palette;
export const Palette = { green, orange, neutral };
export const Fonts = fonts;
export const Radius = radius;
export const Elevation = elevation;
export const Motion = motion;

export type TypeVariant = keyof typeof typeScale;
export const Type = Object.fromEntries(
  Object.entries(typeScale).map(([name, [fontSize, lineHeight]]) => [name, { fontSize, lineHeight }])
) as Record<TypeVariant, { fontSize: number; lineHeight: number }>;

// Legacy names — existing screens import these; values now come from tokens.
export const KimuColors = {
  primary: palette.primary,
  primaryBright: orange[400],
  primaryDark: palette['primary-hover'],
  primaryDeep: orange[800],
  primarySoft: palette['primary-soft'],
  primaryTint: palette['primary-tint'],
  white: neutral[0],
  black: neutral[950],
  ink: palette.fg,
  background: palette.canvas,
  grayLight: palette['surface-muted'],
  border: palette.border,
  textSecondary: palette['fg-muted'],
  muted: palette['fg-disabled'],
  error: palette.danger,
  errorSoft: palette['danger-soft'],
  success: palette.success,
  warning: palette.warning,
} as const;

export const KimuGradients = {
  primary: [orange[400], orange[500], orange[600]],
  hero: [orange[500], orange[800]],
} as const;

export const KimuShadows = {
  tile: elevation[1],
  card: elevation[2],
  sheet: elevation[3],
  button: elevation[2],
} as const;

export const KimuRadius = {
  sm: radius.md,
  md: radius.lg,
  lg: radius.xl,
  xl: radius['2xl'],
} as const;

export const KimuSpacing = {
  screen: 20,
  screenMax: 24,
  button: 52,
  radius: 12,
  radiusLg: 20,
} as const;

export const KimuLayout = {
  screenPadding: 20,
  formMaxWidth: 440,
  contentMaxWidth: 680,
  formHorizontalPadding: 20,
  formBottomPadding: 32,
} as const;

export const KimuTouch = {
  min: 44,
} as const;
