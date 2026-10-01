import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  withTiming,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';

import { Colors, Elevation, Radius } from '../../constants/theme';

interface MapSheetProps {
  children?: ReactNode;
  /** Always-visible top part (title, status, key fields). */
  header?: ReactNode;
  /** Always-visible bottom part (the main action button). */
  footer?: ReactNode;
  /** Let the rider slide the body away to see more map (default true). */
  collapsible?: boolean;
  /** Start collapsed instead of expanded. */
  initiallyCollapsed?: boolean;
  /** Reports the sheet's visible height (after every snap), e.g. to pad the map. */
  onHeightChange?: (height: number) => void;
  /** Bottom padding under the sheet; defaults to the device's safe-area inset. */
  bottomInset?: number;
  /** Cap on the sheet's height; defaults to the screen minus a top strip. */
  maxHeight?: number;
  /** Floating controls that ride just above the sheet's top edge (e.g. locate-me). */
  floating?: ReactNode;
  /** Labels for the handle's accessibility action. */
  expandLabel?: string;
  collapseLabel?: string;
  /** Sheet surface colour (defaults to the surface token). */
  backgroundColor?: string;
  /** Drag-handle colour (defaults to the neutral border). */
  handleColor?: string;
}

// Space kept clear above the sheet, under the status bar, for floating
// controls such as the back button.
const TOP_CLEARANCE = 72;
// Clamped: settles exactly at the snap point instead of wobbling sub-pixel.
const SPRING = { damping: 26, stiffness: 260, mass: 0.8, overshootClamping: true };
const RUBBER = 0.18; // resistance past the ends

/**
 * Bottom sheet over the map (Uber-style), on Reanimated + Gesture Handler
 * (UI thread). The header and footer always stay on screen; the body between
 * them slides open and closed. Drag the handle/header (or anywhere, when the
 * body doesn't scroll), fling to snap, or tap the handle to toggle.
 */
export function MapSheet({
  children,
  header,
  footer,
  collapsible = true,
  initiallyCollapsed = false,
  onHeightChange,
  bottomInset,
  maxHeight: maxHeightProp,
  floating,
  expandLabel = 'Expand',
  collapseLabel = 'Collapse',
  backgroundColor,
  handleColor,
}: MapSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const padBottom = bottomInset ?? Math.max(insets.bottom, 12);
  const maxHeight = Math.min(maxHeightProp ?? Infinity, windowHeight - insets.top - TOP_CLEARANCE);

  const [headerHeight, setHeaderHeight] = useState(0); // handle + header
  const [footerHeight, setFooterHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const chromeHeight = headerHeight + footerHeight + padBottom;
  const [collapsed, setCollapsed] = useState(initiallyCollapsed);
  const bodyMax = Math.max(0, maxHeight - chromeHeight);
  const bodyOpen = Math.min(contentHeight, bodyMax);
  const scrolls = contentHeight > bodyMax + 1;
  const canCollapse = collapsible && bodyOpen > 24;

  const progress = useSharedValue(initiallyCollapsed ? 0 : 1); // 1 = expanded
  const start = useSharedValue(0);
  const open = useSharedValue(bodyOpen);
  useEffect(() => {
    open.value = bodyOpen;
  }, [bodyOpen, open]);

  const report = useCallback(
    (expanded: boolean) => {
      setCollapsed(!expanded);
      onHeightChange?.(Math.round(chromeHeight + (expanded ? bodyOpen : 0)));
    },
    [chromeHeight, bodyOpen, onHeightChange]
  );

  // Re-report when content or chrome size changes (e.g. a payment card appears).
  useEffect(() => {
    if (chromeHeight) onHeightChange?.(Math.round(chromeHeight + (collapsed ? 0 : bodyOpen)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chromeHeight, bodyOpen]);

  // A sheet that can't collapse (or whose body vanished) is always open.
  useEffect(() => {
    if (!canCollapse && progress.value !== 1) {
      progress.value = withSpring(1, SPRING);
      settle(true);
      setCollapsed(false);
    }
  }, [canCollapse, progress]);

  // Entrance: our own spring to translateY 0. Reanimated's SlideInDown
  // layout animation could leave a residual offset on Android release
  // builds, pushing the footer button under the tab bar.
  const enter = useSharedValue(1);
  useEffect(() => {
    // A timing curve, not a spring: a spring kept wobbling by sub-pixel
    // amounts for seconds, so the sheet (and its buttons) never held still.
    enter.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) });
    // Fail-safe: Android can pause Reanimated's frame loop (app paused by a
    // system dialog) and leave the animation stuck mid-way — translucent and
    // offset. Setting the value directly cancels it and lands the final state.
    const done = setTimeout(() => {
      enter.value = 0;
    }, 700);
    return () => clearTimeout(done);
  }, [enter]);
  const enterStyle = useAnimatedStyle(() => ({
    // Slide only — never fade. A fading parent leaves the whole sheet
    // translucent on Android if the animation is ever interrupted.
    transform: [{ translateY: enter.value * 120 }],
  }));

  const buzz = () => Haptics.selectionAsync().catch(() => {});

  // Same fail-safe for snaps: land the target even if the spring was paused.
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settle = useCallback(
    (expanded: boolean) => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => {
        progress.value = expanded ? 1 : 0;
      }, 900);
    },
    [progress]
  );
  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
  }, []);

  function snap(expanded: boolean) {
    progress.value = withSpring(expanded ? 1 : 0, SPRING);
    settle(expanded);
    buzz();
    report(expanded);
  }

  const pan = Gesture.Pan()
    .enabled(canCollapse)
    .activeOffsetY([-6, 6])
    .failOffsetX([-24, 24])
    .onStart(() => {
      start.value = progress.value;
    })
    .onUpdate((e) => {
      const range = Math.max(1, open.value);
      let p = start.value - e.translationY / range;
      if (p > 1) p = 1 + (p - 1) * RUBBER;
      if (p < 0) p = p * RUBBER;
      progress.value = p;
    })
    .onEnd((e) => {
      const expand = e.velocityY < -450 || (e.velocityY < 450 && progress.value > 0.5);
      const changed = expand !== start.value > 0.5;
      progress.value = withSpring(expand ? 1 : 0, { ...SPRING, velocity: -e.velocityY / Math.max(1, open.value) });
      if (changed) scheduleOnRN(buzz);
      scheduleOnRN(report, expand);
      scheduleOnRN(settle, expand);
    });

  const bodyStyle = useAnimatedStyle(() => {
    const p = Math.max(0, progress.value);
    return {
      height: open.value * Math.min(p, 1) + (p > 1 ? (p - 1) * 40 : 0),
      // Fully opaque from the first few percent of travel; only the last
      // sliver fades so a half-dragged card never looks washed out.
      opacity: interpolate(p, [0, 0.08], [0, 1], Extrapolation.CLAMP),
    };
  });
  // Handle stretches a little while dragging past the ends: tactile feedback.
  const handleStyle = useAnimatedStyle(() => ({
    width: interpolate(progress.value, [-0.2, 0, 1, 1.2], [52, 40, 40, 52], Extrapolation.CLAMP),
  }));

  const measure = (set: (h: number) => void) => (e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    set(h);
  };

  const handle = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={collapsed ? expandLabel : collapseLabel}
      accessibilityState={{ expanded: !collapsed }}
      disabled={!canCollapse}
      onPress={() => snap(collapsed)}
      hitSlop={{ top: 8, bottom: 8, left: 60, right: 60 }}
      style={styles.handleArea}
    >
      <Animated.View style={[styles.handle, handleStyle, handleColor ? { backgroundColor: handleColor } : null, !canCollapse && { opacity: 0.5 }]} />
    </Pressable>
  );

  // Whole sheet is draggable when the body doesn't need to scroll;
  // otherwise only the handle/header, so scrolling the body still works.
  const dragWholeSheet = canCollapse && !scrolls;
  const top = (
    <View onLayout={measure(setHeaderHeight)} collapsable={false}>
      {handle}
      {header}
    </View>
  );

  const sheet = (
    <View style={[styles.sheet, backgroundColor ? { backgroundColor } : null, { paddingBottom: padBottom }]} collapsable={false}>
      {dragWholeSheet ? top : <GestureDetector gesture={pan}>{top}</GestureDetector>}
      <Animated.View style={[styles.bodyClip, bodyStyle]}>
        <ScrollView
          scrollEnabled={scrolls}
          bounces={false}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={{ maxHeight: bodyMax || undefined }}
        >
          <View onLayout={measure(setContentHeight)}>{children}</View>
        </ScrollView>
      </Animated.View>
      {footer ? (
        <View onLayout={measure(setFooterHeight)} style={styles.footer}>
          {footer}
        </View>
      ) : null}
    </View>
  );

  return (
    // Entrance (anchor) and drag (sheet internals) live on separate views.
    <Animated.View style={[styles.anchor, enterStyle]} pointerEvents="box-none">
      {floating ? (
        <View style={styles.floating} pointerEvents="box-none">
          {floating}
        </View>
      ) : null}
      {dragWholeSheet ? <GestureDetector gesture={pan}>{sheet}</GestureDetector> : sheet}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  floating: { position: 'absolute', left: 0, right: 0, bottom: '100%', paddingBottom: 12 },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius['3xl'],
    borderTopRightRadius: Radius['3xl'],
    paddingHorizontal: 20,
    ...Elevation[4],
    shadowOffset: { width: 0, height: -6 },
  },
  handleArea: { alignItems: 'center', paddingTop: 10, paddingBottom: 10 },
  handle: { height: 5, borderRadius: 3, backgroundColor: Colors['border-strong'] },
  bodyClip: { overflow: 'hidden' },
  footer: { paddingTop: 12 },
});
