import { ReactNode, memo, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScrollView, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useResponsive } from '../hooks/useResponsive';
import { FemColors } from '../constants/theme';

interface ScreenContainerProps {
  children: ReactNode;
  /** Whether this screen has a bottom tab bar (adds clearance) */
  hasTabBar?: boolean;
  /** Safe area edges to apply (default: all) */
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  /** Additional className for the scroll view content container */
  contentClassName?: string;
  /** Custom horizontal padding override */
  horizontalPadding?: number;
  /** Whether to show scroll indicators */
  showsVerticalScrollIndicator?: boolean;
  /** Style for the SafeAreaView */
  style?: object;
  /** Content container style overrides */
  contentContainerStyle?: object;
}

/**
 * Standardized screen container with proper safe area handling,
 * responsive horizontal padding, and automatic bottom tab bar clearance.
 * 
 * Usage:
 * <ScreenContainer hasTabBar={true}>
 *   <YourScreenContent />
 * </ScreenContainer>
 */
export const ScreenContainer = memo(function ScreenContainer({
  children,
  hasTabBar = true,
  edges = ['top', 'bottom', 'left', 'right'],
  contentClassName,
  horizontalPadding,
  showsVerticalScrollIndicator = false,
  style,
  contentContainerStyle,
}: ScreenContainerProps) {
  const insets = useSafeAreaInsets();
  const { spacing, dimensions } = useResponsive();

  const hPadding = horizontalPadding ?? spacing.screenHorizontal;
  const tabBarClearance = hasTabBar 
    ? dimensions.tabBarHeight + insets.bottom 
    : insets.bottom;

  const contentContainerStyles = useMemo(() => [
    styles.contentContainer,
    {
      paddingHorizontal: hPadding,
      paddingBottom: tabBarClearance,
    },
    contentContainerStyle,
  ], [hPadding, tabBarClearance, contentContainerStyle]);

  return (
    <SafeAreaView style={[styles.safeArea, style]} className="flex-1 bg-bg-light">
      <ScrollView
        contentContainerStyle={contentContainerStyles}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    width: '100%',
  },
});

ScreenContainer.displayName = 'ScreenContainer';

/**
 * Simplified version for screens that don't need scrolling
 * (e.g., loading states, full-screen maps)
 */
export const FixedScreenContainer = memo(function FixedScreenContainer({
  children,
  hasTabBar = false,
  edges = ['top', 'bottom', 'left', 'right'],
  style,
}: {
  children: ReactNode;
  hasTabBar?: boolean;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  style?: object;
}) {
  const insets = useSafeAreaInsets();
  const { dimensions } = useResponsive();

  const tabBarClearance = hasTabBar ? dimensions.tabBarHeight + insets.bottom : insets.bottom;

  return (
    <SafeAreaView style={[fixedStyles.fixedSafeArea, { paddingBottom: tabBarClearance }, style]} className="flex-1 bg-bg-light">
      <View style={fixedStyles.fixedContent} className="flex-1">
        {children}
      </View>
    </SafeAreaView>
  );
});

const fixedStyles = StyleSheet.create({
  fixedSafeArea: {
    flex: 1,
  },
  fixedContent: {
    flex: 1,
    width: '100%',
  },
});

FixedScreenContainer.displayName = 'FixedScreenContainer';