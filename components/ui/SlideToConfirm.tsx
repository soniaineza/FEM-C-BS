import { useCallback, useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { Colors } from '../../constants/theme';
import { Text } from './Text';

interface SlideToConfirmProps {
  label: string;
  /** Shown on the track once the thumb reaches the end. */
  confirmedLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  /** Track colour (defaults to the brand colour). */
  color?: string;
}

const THUMB = 52;
const PAD = 4;
const SPRING = { damping: 18, stiffness: 220, mass: 0.7 };

/**
 * "Slide to confirm" control: drag the thumb across the track. The label
 * fades and the track fills as you drag, the thumb ticks with haptics, snaps
 * back if released early, and pops with a check when it lands.
 */
export function SlideToConfirm({ label, confirmedLabel, onConfirm, disabled, color = Colors.primary }: SlideToConfirmProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [done, setDone] = useState(false);
  const range = Math.max(1, trackWidth - THUMB - PAD * 2);

  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const rangeSv = useSharedValue(range);
  const pop = useSharedValue(0);
  const nudge = useSharedValue(0);
  useEffect(() => {
    rangeSv.value = range;
  }, [range, rangeSv]);

  // A gentle repeating nudge teaches the gesture until it is first touched.
  useEffect(() => {
    if (disabled || done) return;
    const id = setInterval(() => {
      nudge.value = withSequence(withTiming(14, { duration: 260 }), withSpring(0, SPRING));
    }, 2600);
    return () => clearInterval(id);
  }, [disabled, done, nudge]);

  const tick = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
  }, []);
  const finish = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setDone(true);
    onConfirm();
  }, [onConfirm]);

  const pan = Gesture.Pan()
    .enabled(!disabled && !done)
    .activeOffsetX([-4, 4])
    .failOffsetY([-30, 30])
    .onStart(() => {
      start.value = x.value;
      nudge.value = 0;
      scheduleOnRN(tick);
    })
    .onUpdate((e) => {
      x.value = Math.min(rangeSv.value, Math.max(0, start.value + e.translationX));
    })
    .onEnd(() => {
      if (x.value >= rangeSv.value * 0.88) {
        x.value = withSpring(rangeSv.value, SPRING);
        pop.value = withSequence(withTiming(1, { duration: 140 }), withSpring(0.0, SPRING));
        scheduleOnRN(finish);
      } else {
        x.value = withSpring(0, SPRING);
      }
    });

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value + nudge.value }, { scale: 1 + pop.value * 0.18 }],
  }));
  const fillStyle = useAnimatedStyle(() => ({ width: x.value + THUMB + PAD }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [0, rangeSv.value * 0.55], [1, 0], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(x.value, [0, rangeSv.value], [0, 24], Extrapolation.CLAMP) }],
  }));

  return (
    <View
      style={[styles.track, { borderColor: color, opacity: disabled ? 0.5 : 1 }]}
      onLayout={(e: LayoutChangeEvent) => setTrackWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityActions={[{ name: 'activate', label }]}
      onAccessibilityAction={() => {
        if (!disabled && !done) {
          x.value = withSpring(rangeSv.value, SPRING);
          finish();
        }
      }}
    >
      <Animated.View style={[styles.fill, { backgroundColor: color }, fillStyle]} />
      <Animated.View style={[styles.labelWrap, labelStyle]} pointerEvents="none">
        <Text variant="callout" weight="semibold" style={{ color }}>
          {done && confirmedLabel ? confirmedLabel : label}
        </Text>
      </Animated.View>
      {done && confirmedLabel ? (
        <View style={styles.labelWrap} pointerEvents="none">
          <Text variant="callout" weight="semibold" style={{ color: '#FFFFFF' }}>{confirmedLabel}</Text>
        </View>
      ) : null}
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.thumb, { backgroundColor: done ? Colors.surface : color }, thumbStyle]}>
          <Ionicons name={done ? 'checkmark' : 'chevron-forward'} size={26} color={done ? color : '#FFFFFF'} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: THUMB + PAD * 2,
    borderRadius: (THUMB + PAD * 2) / 2,
    borderWidth: 1.5,
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, opacity: 0.22, borderRadius: 999 },
  labelWrap: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingLeft: THUMB },
  thumb: {
    position: 'absolute',
    left: PAD,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
