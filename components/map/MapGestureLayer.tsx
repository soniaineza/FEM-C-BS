import { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';

import { Pressable } from '../ui/Pressable';
import { mapStageController, useMapStageStore } from '../../stores/useMapStageStore';
import { useTranslation } from '../../hooks/useTranslation';
import { Colors, Elevation } from '../../constants/theme';

/**
 * Lets the rider move and zoom the shared ride-flow map. That map lives
 * behind the navigator and cannot receive touches, so this transparent layer
 * (the first child of a ride screen, under its sheet and buttons) reads the
 * drag, pinch and double-tap and forwards them as camera commands. It also
 * carries the +/− buttons and, once the map has been moved, a button that
 * puts the camera back on the trip.
 */
export function MapGestureLayer() {
  const { t } = useTranslation();
  const recenter = useMapStageStore((s) => s.recenter);
  const [moved, setMoved] = useState(false);
  const movedRef = useRef(false);
  const size = useRef({ width: 0, height: 0 });

  // Gesture updates arrive faster than the map can usefully take them: add
  // them up and send one command per frame.
  const pending = useRef({ dx: 0, dy: 0, zoom: 0, x: 0, y: 0 });
  const frame = useRef<number | null>(null);
  const pinched = useRef(false);
  useEffect(() => () => {
    if (frame.current != null) cancelAnimationFrame(frame.current);
  }, []);

  const gesture = useMemo(() => {
    const markMoved = () => {
      if (movedRef.current) return;
      movedRef.current = true;
      setMoved(true);
    };
    const flush = () => {
      frame.current = null;
      const p = pending.current;
      const map = mapStageController.current;
      if (map) {
        if (p.dx || p.dy) map.panBy(p.dx, p.dy);
        if (p.zoom) map.zoomBy(p.zoom, p.x, p.y, false);
      }
      pending.current = { dx: 0, dy: 0, zoom: 0, x: 0, y: 0 };
    };
    const schedule = () => {
      if (frame.current == null) frame.current = requestAnimationFrame(flush);
    };

    const pan = Gesture.Pan()
      .runOnJS(true)
      .minDistance(4)
      .maxPointers(2)
      .onStart(() => {
        pinched.current = false;
      })
      .onChange((e) => {
        pending.current.dx += e.changeX;
        pending.current.dy += e.changeY;
        markMoved();
        schedule();
      })
      .onEnd((e) => {
        // No glide after a pinch: its release velocity is the fingers
        // parting, not a drag.
        if (pinched.current) return;
        if (Math.hypot(e.velocityX, e.velocityY) > 300) mapStageController.current?.fling(e.velocityX, e.velocityY);
      });

    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onStart(() => {
        pinched.current = true;
      })
      .onChange((e) => {
        if (!(e.scaleChange > 0)) return;
        pending.current.zoom += Math.log2(e.scaleChange);
        pending.current.x = e.focalX;
        pending.current.y = e.focalY;
        markMoved();
        schedule();
      });

    const doubleTap = Gesture.Tap()
      .runOnJS(true)
      .numberOfTaps(2)
      .maxDuration(250)
      .onEnd((e, success) => {
        if (!success) return;
        markMoved();
        mapStageController.current?.zoomBy(1, e.x, e.y, true);
      });

    return Gesture.Simultaneous(pan, pinch, doubleTap);
  }, []);

  function zoom(delta: number) {
    movedRef.current = true;
    setMoved(true);
    mapStageController.current?.zoomBy(delta, size.current.width / 2, size.current.height / 2, true);
  }

  function reset() {
    movedRef.current = false;
    setMoved(false);
    recenter();
  }

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
      onLayout={(e: LayoutChangeEvent) => {
        size.current = { width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height };
      }}
    >
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill} collapsable={false} />
      </GestureDetector>
      <View style={styles.controls} pointerEvents="box-none">
        <View style={[styles.pill, Elevation[2]]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('zoomIn')}
            onPress={() => zoom(1)}
            hitSlop={4}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <Ionicons name="add" size={22} color={Colors.fg} />
          </Pressable>
          <View style={styles.divider} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('zoomOut')}
            onPress={() => zoom(-1)}
            hitSlop={4}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <Ionicons name="remove" size={22} color={Colors.fg} />
          </Pressable>
        </View>
        {moved ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('recenterMap')}
            onPress={reset}
            hitSlop={4}
            style={({ pressed }) => [styles.recenter, Elevation[2], pressed && styles.pressed]}
          >
            <Ionicons name="locate" size={20} color={Colors['primary-text']} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Same place as LiveMap's own zoom buttons: clear of the back button above
  // and of the sheet below.
  controls: { position: 'absolute', right: 16, top: '30%', alignItems: 'center' },
  pill: { backgroundColor: Colors.surface, borderRadius: 14, overflow: 'hidden' },
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { backgroundColor: Colors['surface-muted'] },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 8, backgroundColor: Colors.border },
  recenter: {
    marginTop: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
});
