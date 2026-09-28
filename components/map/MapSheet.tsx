import { ReactNode, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
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
}

const SPRING = { damping: 22, stiffness: 220, mass: 0.9 };

/**
 * Bottom sheet over the map (Uber-style). Drag the handle or header down to
 * peek at the map, up to expand. Built on Reanimated + Gesture Handler (UI
 * thread, 60fps) rather than a sheet library, per the Jev decision recorded
 * with the map architecture.
 */
export function MapSheet({ children, header, footer, collapsible = true }: MapSheetProps) {
  const insets = useSafeAreaInsets();
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
    <Animated.View
      entering={SlideInDown.springify().damping(20)}
      style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }, style]}
    >
      <GestureDetector gesture={pan}>
        <View>
          <View style={styles.handleArea}>
            <View style={styles.handle} />
          </View>
          {header}
        </View>
      </GestureDetector>
      <View onLayout={onBodyLayout}>{children}</View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
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
  footer: { paddingTop: 12 },
});
