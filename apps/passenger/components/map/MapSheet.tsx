import { ReactNode, useState } from 'react';
import { LayoutChangeEvent, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  SlideInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';

interface MapSheetProps {
  children: ReactNode;
  /** Always-visible top part (e.g. status line). Dragging it collapses the rest. */
  header?: ReactNode;
  /** Pinned under the content (e.g. the main action button). */
  footer?: ReactNode;
  collapsible?: boolean;
  /** Reports the sheet's full height, e.g. to pad the map's visible centre. */
  onHeightChange?: (height: number) => void;
}

// Space kept clear above the sheet, under the status bar, for floating
// controls such as the back button.
const TOP_CLEARANCE = 72;

const SPRING = { damping: 22, stiffness: 220, mass: 0.9 };

/**
 * Bottom sheet over the map (Uber-style). Drag the handle or header down to
 * peek at the map, up to expand. Built on Reanimated + Gesture Handler (UI
 * thread, 60fps) rather than a sheet library, per the Jev decision recorded
 * with the map architecture.
 */
export function MapSheet({ children, header, footer, collapsible = true, onHeightChange }: MapSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  // Never taller than the screen minus the status bar and a strip for the
  // back button: long content scrolls inside the sheet instead of climbing
  // under the clock/battery on short phones.
  const maxHeight = windowHeight - insets.top - TOP_CLEARANCE;
  const [bodyHeight, setBodyHeight] = useState(0);
  const offset = useSharedValue(0); // 0 = expanded, bodyHeight = collapsed
  const start = useSharedValue(0);

  const buzz = () => Haptics.selectionAsync().catch(() => {});

  const pan = Gesture.Pan()
    .enabled(collapsible && bodyHeight > 0)
    .activeOffsetY([-8, 8])
    .onStart(() => {
      start.value = offset.value;
    })
    .onUpdate((e) => {
      offset.value = Math.min(bodyHeight, Math.max(0, start.value + e.translationY));
    })
    .onEnd((e) => {
      const collapse = e.velocityY > 500 || (e.velocityY > -500 && offset.value > bodyHeight / 2);
      const target = collapse ? bodyHeight : 0;
      if (target !== start.value) scheduleOnRN(buzz);
      offset.value = withSpring(target, SPRING);
    });

  const style = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  function onBodyLayout(e: LayoutChangeEvent) {
    setBodyHeight(Math.round(e.nativeEvent.layout.height));
  }

  return (
    // Entrance animation and drag transform live on separate views: a
    // layout animation would otherwise overwrite the drag's transform.
    <Animated.View entering={SlideInDown.springify().damping(20)} style={styles.anchor} pointerEvents="box-none">
    <Animated.View
      onLayout={onHeightChange ? (e) => onHeightChange(Math.round(e.nativeEvent.layout.height)) : undefined}
      style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12), maxHeight }, style]}
    >
      <GestureDetector gesture={pan}>
        <View>
          <View style={styles.handleArea}>
            <View style={styles.handle} />
          </View>
          {header}
        </View>
      </GestureDetector>
      <ScrollView
        style={styles.body}
        onLayout={onBodyLayout}
        bounces={false}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  handleArea: { alignItems: 'center', paddingTop: 8, paddingBottom: 10 },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#D1D5DB' },
  body: { flexShrink: 1, flexGrow: 0 },
  footer: { paddingTop: 12 },
});
