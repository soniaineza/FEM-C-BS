// Typed access to the design tokens in ./tokens.js for StyleSheet styles and
// icon colors. className styling reads the same tokens via tailwind.config.js.
// See docs/DESIGN_SYSTEM.md for how to use each role.
import tokens from './tokens';

const { palette, green, neutral, typeScale, fonts, radius, elevation, motion } = tokens;

export const Colors = palette;
export const Palette = { green, neutral };
export const Fonts = fonts;
export const Radius = radius;
export const Elevation = elevation;
export const Motion = motion;

export type TypeVariant = keyof typeof typeScale;
export const Type = Object.fromEntries(
  Object.entries(typeScale).map(([name, [fontSize, lineHeight]]) => [name, { fontSize, lineHeight }])
) as Record<TypeVariant, { fontSize: number; lineHeight: number }>;

// Legacy names — existing screens import these; values now come from tokens.
export const FemColors = {
  primary: palette.primary,
  primaryBright: green[500],
  primaryDark: palette['primary-hover'],
  primaryDeep: green[800],
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

export const FemGradients = {
  primary: [green[500], green[600], green[700]],
  hero: [green[600], green[800]],
} as const;

export const FemShadows = {
  tile: elevation[1],
  card: elevation[2],
  sheet: elevation[3],
  button: elevation[2],
} as const;

export const FemRadius = {
  sm: radius.md,
  md: radius.lg,
  lg: radius.xl,
  xl: radius['2xl'],
} as const;

export const FemSpacing = {
  screen: 20,
  screenMax: 24,
  button: 52,
  radius: 12,
  radiusLg: 20,
} as const;

export const FemLayout = {
  screenPadding: 20,
  formMaxWidth: 440,
  contentMaxWidth: 680,
  formHorizontalPadding: 20,
  formBottomPadding: 32,
} as const;

export const FemTouch = {
  min: 44,
} as const;
