// Central brand tokens. Screens should import these instead of scattering hex values.
export const FemColors = {
  primary: '#16A34A',
  primaryDark: '#15803D',
  primarySoft: 'rgba(22,163,74,0.08)',
  primaryTint: 'rgba(22,163,74,0.12)',
  white: '#FFFFFF',
  black: '#111111',
  ink: '#111111',
  background: '#F7F7F7',
  grayLight: '#F5F5F5',
  border: '#E5E7EB',
  textSecondary: '#6B7280',
  muted: '#9CA3AF',
  error: '#DC2626',
  success: '#16A34A',
  warning: '#D97706',
} as const;

export const FemSpacing = {
  screen: 20,
  screenMax: 24,
  button: 52,
  radius: 12,
  radiusLg: 20,
} as const;

export const FemTouch = {
  min: 44,
} as const;
