// Central brand tokens. Screens should import these instead of scattering hex values.
export const KimuColors = {
  primary: '#0E7C4A',
  primaryDark: '#0A5F39',
  primarySoft: 'rgba(14,124,74,0.08)',
  primaryTint: 'rgba(14,124,74,0.12)',
  // Accent only: destination pins, ratings, badges, attention states.
  accent: '#F97316',
  accentDark: '#C2410C',
  accentSoft: '#FFF3E8',
  white: '#FFFFFF',
  black: '#111111',
  ink: '#111111',
  background: '#F7F7F7',
  grayLight: '#F5F5F5',
  border: '#E5E7EB',
  textSecondary: '#6B7280',
  muted: '#9CA3AF',
  error: '#DC2626',
  success: '#0E7C4A',
  warning: '#D97706',
} as const;

export const KimuSpacing = {
  screen: 20,
  screenMax: 24,
  button: 52,
  radius: 12,
  radiusLg: 20,
} as const;

export const KimuTouch = {
  min: 44,
} as const;
