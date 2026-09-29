import { useWindowDimensions } from 'react-native';

// One responsive source of truth for the driver app (and any screen that
// needs it): phone-first layouts that stay usable on 320px devices and stop
// stretching on tablets.
//
// - isSmallPhone: tighten paddings / label sizes below 360pt.
// - isTablet + contentStyle: cap line length on wide screens by centering a
//   max-width column instead of stretching full-bleed.
// - mapHeight: map panels sized as a clamped fraction of screen height
//   instead of a fixed pixel value.
export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isSmallPhone = width < 360;
  const isTablet = width >= 768;
  const contentStyle = {
    width: '100%' as const,
    maxWidth: isTablet ? 680 : undefined,
    alignSelf: 'center' as const,
  };
  const mapHeight = Math.round(Math.min(320, Math.max(200, height * 0.28)));
  return { width, height, isSmallPhone, isTablet, contentStyle, mapHeight };
}
