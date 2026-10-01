import { useWindowDimensions } from 'react-native';
import { useMemo } from 'react';

/**
 * Central responsive hook providing width/height and scaled values.
 * All responsive calculations use the current window dimensions.
 */
export function useResponsive() {
  const { width, height } = useWindowDimensions();

  const scale = useMemo(() => ({
    // Width-based scaling (360 = baseline)
    widthRatio: width / 360,
    // Height-based scaling (640 = baseline)
    heightRatio: height / 640,
    // Minimum of both for uniform scaling
    minRatio: Math.min(width / 360, height / 640),
    // Maximum of both
    maxRatio: Math.max(width / 360, height / 640),
    // Screen classifications
    isSmall: width < 360,
    isCompact: width < 390,
    isStandard: width >= 390 && width < 412,
    isLarge: width >= 412,
    isShort: height < 700,
    isTall: height >= 850,
  }), [width, height]);

  // Responsive spacing
  const spacing = useMemo(() => ({
    xs: Math.max(4, Math.round(4 * scale.minRatio)),
    sm: Math.max(8, Math.round(8 * scale.minRatio)),
    md: Math.max(12, Math.round(12 * scale.minRatio)),
    lg: Math.max(16, Math.round(16 * scale.minRatio)),
    xl: Math.max(20, Math.round(20 * scale.minRatio)),
    '2xl': Math.max(24, Math.round(24 * scale.minRatio)),
    // Horizontal screen padding: 16-24px based on width
    screenHorizontal: Math.min(24, Math.max(16, Math.round(width * 0.05))),
    // Vertical gap between sections
    sectionGap: Math.min(20, Math.max(12, Math.round(width * 0.035))),
    // Card internal padding
    cardPadding: Math.min(20, Math.max(12, Math.round(width * 0.04))),
    // Bottom nav item horizontal padding
    navItemHorizontal: Math.max(2, Math.round(width * 0.01)),
  }), [scale]);

  // Responsive typography
  const typography = useMemo(() => ({
    // Navigation labels: 10-12px
    navLabel: Math.max(10, Math.min(12, Math.round(width * 0.028))),
    navLabelLineHeight: Math.max(14, Math.round(width * 0.028) + 4),
    // Body text: 14-16px
    body: Math.max(14, Math.min(16, Math.round(width * 0.038))),
    bodyLineHeight: Math.max(20, Math.round(width * 0.038) + 6),
    // Title text: 18-22px
    title: Math.max(18, Math.min(22, Math.round(width * 0.05))),
    titleLineHeight: Math.max(26, Math.round(width * 0.05) + 8),
    // Heading: 24-28px
    heading: Math.max(24, Math.min(28, Math.round(width * 0.06))),
    headingLineHeight: Math.max(32, Math.round(width * 0.06) + 8),
    // Button text: 15-17px
    button: Math.max(15, Math.min(17, Math.round(width * 0.04))),
    buttonLineHeight: Math.max(22, Math.round(width * 0.04) + 7),
    // Caption text: 10-12px
    caption: Math.max(10, Math.min(12, Math.round(width * 0.025))),
  }), [width]);

  // Responsive dimensions
  const dimensions = useMemo(() => ({
    // Button height: 52-56px
    buttonHeight: Math.max(52, Math.min(56, Math.round(52 * scale.minRatio))),
    // Tab bar height: 72-88px (including safe area)
    tabBarHeight: Math.max(72, Math.min(88, Math.round(76 * scale.minRatio))),
    // Map card aspect ratio (4:3)
    mapCardHeight: Math.round(width * 0.75),
    // Small map card (home screen)
    mapCardHeightSmall: Math.round(width * 0.55),
    // Touch target minimum
    touchTarget: 48,
    // Icon sizes
    iconSmall: Math.max(16, Math.round(18 * scale.minRatio)),
    iconMedium: Math.max(20, Math.round(22 * scale.minRatio)),
    iconLarge: Math.max(24, Math.round(28 * scale.minRatio)),
    // Icon pill height (for live meter and other overlays)
    iconPillHeight: Math.max(40, Math.round(44 * scale.minRatio)),
  }), [scale, width]);

  // Driver-app helpers (phone-first layouts that cap line length on tablets).
  const isSmallPhone = width < 360;
  const isTablet = width >= 768;
  const contentStyle = {
    width: '100%' as const,
    maxWidth: isTablet ? 680 : undefined,
    alignSelf: 'center' as const,
  };
  const mapHeight = Math.round(Math.min(320, Math.max(200, height * 0.28)));

  return {
    width,
    height,
    isSmallPhone,
    isTablet,
    contentStyle,
    mapHeight,
    scale,
    spacing,
    typography,
    dimensions: {
      ...dimensions,
      width,
      height,
      typography,
    },
  };
}

/**
 * Convenience hook for just spacing values.
 */
export function useResponsiveSpacing() {
  const { spacing } = useResponsive();
  return spacing;
}

/**
 * Convenience hook for just typography values.
 */
export function useResponsiveTypography() {
  const { typography } = useResponsive();
  return typography;
}

/**
 * Convenience hook for just dimension values.
 */
export function useResponsiveDimensions() {
  const { dimensions } = useResponsive();
  return dimensions;
}