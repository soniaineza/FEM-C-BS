import { useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

const HANDLE = 52;
const PADDING = 4;
/** How far along the track counts as a committed swipe. */
const COMMIT = 0.72;

// Reanimated's Animated.View has no NativeWind interop, so these boxes are
// plain styles rather than classes.
const styles = StyleSheet.create({
  handle: {
    position: 'absolute',
    left: PADDING,
    top: PADDING,
    height: HANDLE,
    width: HANDLE,
    borderRadius: HANDLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0E7C4A',
    shadowColor: '#0E7C4A',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  label: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/**
 * Slide-to-confirm, the way the reference driver app starts a trip: a deliberate
 * drag rather than a tap, so a phone jostling in a cradle cannot start or end a
 * trip by itself.
 */
export function SwipeToStart({
  label,
  hint,
  onComplete,
  loading = false,
  icon = 'chevron-forward',
}: {
  label: string;
  hint?: string;
  onComplete: () => void;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const offset = useSharedValue(0);
  const max = Math.max(0, trackWidth - HANDLE - PADDING * 2);

  function onLayout(event: LayoutChangeEvent) {
    setTrackWidth(event.nativeEvent.layout.width);
  }

  const pan = Gesture.Pan()
    .enabled(!loading && max > 0)
    .onChange((event) => {
      offset.value = Math.min(max, Math.max(0, offset.value + event.changeX));
    })
    .onEnd(() => {
      if (offset.value >= max * COMMIT) {
        offset.value = withSpring(max, { damping: 20, stiffness: 240 });
        runOnJS(onComplete)();
      } else {
        offset.value = withSpring(0, { damping: 18, stiffness: 200 });
      }
    });

  const handleStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  // The label clears out of the handle's way as the driver drags.
  const labelStyle = useAnimatedStyle(() => ({
    opacity: max > 0 ? interpolate(offset.value, [0, max * 0.6], [1, 0], Extrapolation.CLAMP) : 1,
  }));

  return (
    <View>
      <View
        onLayout={onLayout}
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityHint={hint}
        className="h-[60px] w-full justify-center overflow-hidden rounded-full border border-primary/25 bg-primary-soft"
      >
        <Animated.View style={[styles.label, labelStyle]} pointerEvents="none">
          <Text className="text-[15px] font-semibold text-primary">{label}</Text>
        </Animated.View>

        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.handle, handleStyle]}>
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <View className="flex-row items-center">
                <Ionicons name={icon} size={18} color="#FFFFFF" style={{ marginRight: -9, opacity: 0.45 }} />
                <Ionicons name={icon} size={18} color="#FFFFFF" style={{ marginRight: -9, opacity: 0.75 }} />
                <Ionicons name={icon} size={18} color="#FFFFFF" />
              </View>
            )}
          </Animated.View>
        </GestureDetector>
      </View>

      {hint ? <Text className="font-sans mt-2 text-center text-[12px] text-text-secondary">{hint}</Text> : null}
    </View>
  );
}
