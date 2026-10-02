import { ReactNode } from 'react';
import { RefreshControl, ScrollView, View, ViewStyle } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';

import { Colors, KimuLayout } from '../../constants/theme';
import { useResponsive } from '../../hooks/useResponsive';

export interface ScreenProps {
  children: ReactNode;
  /** Wrap content in a ScrollView (default true). */
  scroll?: boolean;
  /** canvas (grey, default) for card layouts; surface (white) for forms/detail. */
  background?: 'canvas' | 'surface';
  /** Horizontal gutter (default 20). Pass 0 for full-bleed content. */
  padding?: number;
  /** Rendered above the scroll area (not scrolling). */
  header?: ReactNode;
  /** Sticky bottom action area (primary CTA), above the home indicator. */
  footer?: ReactNode;
  edges?: Edge[];
  refreshing?: boolean;
  onRefresh?: () => void;
  contentContainerStyle?: ViewStyle;
}

/**
 * The page scaffold: safe areas, background, gutter, a max-width column on
 * tablets/web, optional pull-to-refresh and a sticky footer CTA.
 */
export function Screen({
  children,
  scroll = true,
  background = 'canvas',
  padding = KimuLayout.screenPadding,
  header,
  footer,
  edges = ['top', 'left', 'right', 'bottom'],
  refreshing,
  onRefresh,
  contentContainerStyle,
}: ScreenProps) {
  const { contentStyle } = useResponsive();
  const bg = background === 'canvas' ? Colors.canvas : Colors.surface;
  const safeEdges = footer ? edges.filter((e) => e !== 'bottom') : edges;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }} edges={safeEdges}>
      {header ? <View style={[{ paddingHorizontal: padding }, contentStyle]}>{header}</View> : null}
      {scroll ? (
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[{ paddingHorizontal: padding, paddingBottom: 32, flexGrow: 1 }, contentContainerStyle]}
          refreshControl={
            onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={Colors.primary} colors={[Colors.primary]} /> : undefined
          }
        >
          <View style={[{ flexGrow: 1 }, contentStyle]}>{children}</View>
        </ScrollView>
      ) : (
        <View style={[{ flex: 1, paddingHorizontal: padding }, contentStyle, contentContainerStyle]}>{children}</View>
      )}
      {footer ? <ScreenFooter background={bg}>{footer}</ScreenFooter> : null}
    </SafeAreaView>
  );
}

/** Sticky bottom bar for a screen's primary action; pads for the home indicator. */
export function ScreenFooter({ children, background = Colors.surface }: { children: ReactNode; background?: string }) {
  const { contentStyle } = useResponsive();
  return (
    <SafeAreaView edges={['bottom']} style={{ backgroundColor: background, borderTopWidth: 1, borderTopColor: Colors.divider }}>
      <View style={[{ paddingHorizontal: KimuLayout.screenPadding, paddingTop: 12, paddingBottom: 12, gap: 10 }, contentStyle]}>{children}</View>
    </SafeAreaView>
  );
}
