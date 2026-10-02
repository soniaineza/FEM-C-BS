import { useCallback, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import MapEngine from './MapEngine';
import type { MapScene } from './map-types';
import { KimuColors } from '../../constants/theme';

export interface LiveMapProps {
  scene: MapScene;
  onPress?: (latitude: number, longitude: number) => void;
  onCenterChanged?: (latitude: number, longitude: number) => void;
  onUserGesture?: () => void;
  loadingLabel?: string;
  errorLabel?: string;
  retryLabel?: string;
  /** Rounded card corners when the map is embedded rather than full-screen. */
  rounded?: boolean;
}

/**
 * The app-side map: hosts MapEngine (a DOM component; a WebView on
 * iOS/Android, plain DOM on web) and adds loading, error and retry states.
 * Screens describe what to show with a MapScene; they never touch the map.
 */
export function LiveMap({
  scene,
  onPress,
  onCenterChanged,
  onUserGesture,
  loadingLabel = 'Loading map…',
  errorLabel = 'The map could not be loaded. Check your connection.',
  retryLabel = 'Retry',
  rounded = false,
}: LiveMapProps) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // DOM components only accept top-level async callbacks; keep their
  // identities stable so a prop change never re-sends them over the bridge.
  const handlers = useRef({ onPress, onCenterChanged, onUserGesture });
  handlers.current = { onPress, onCenterChanged, onUserGesture };
  const handleReady = useCallback(async () => {
    setReady(true);
    setError(null);
  }, []);
  const handleError = useCallback(async (message: string) => setError(message), []);
  const handlePress = useCallback(async (lat: number, lng: number) => handlers.current.onPress?.(lat, lng), []);
  const handleCenter = useCallback(
    async (lat: number, lng: number) => handlers.current.onCenterChanged?.(lat, lng),
    []
  );
  const handleGesture = useCallback(async () => handlers.current.onUserGesture?.(), []);

  function retry() {
    setError(null);
    setReady(false);
    setNonce((n) => n + 1);
  }

  return (
    <View style={[styles.fill, rounded && styles.rounded]}>
      <MapEngine
        key={nonce}
        scene={scene}
        onReady={handleReady}
        onError={handleError}
        onPress={handlePress}
        onCenterChanged={handleCenter}
        onUserGesture={handleGesture}
        dom={{
          style: styles.fill,
          containerStyle: styles.fill,
          scrollEnabled: false,
          bounces: false,
          overScrollMode: 'never',
          // Android can kill a backgrounded WebView renderer; remount instead
          // of leaving a frozen grey rectangle.
          onRenderProcessGone: () => retry(),
          onContentProcessDidTerminate: () => retry(),
        }}
      />
      {!ready && !error ? (
        <View style={[styles.overlay, styles.center]} pointerEvents="none">
          <ActivityIndicator color={KimuColors.primary} />
          <Text style={styles.hint}>{loadingLabel}</Text>
        </View>
      ) : null}
      {error ? (
        <View style={[styles.overlay, styles.center, styles.padded]}>
          <Ionicons name="map-outline" size={36} color={KimuColors.muted} />
          <Text style={[styles.hint, styles.centerText]}>{errorLabel}</Text>
          <Pressable onPress={retry} hitSlop={8} style={styles.retry}>
            <Ionicons name="refresh" size={16} color={KimuColors.primary} />
            <Text style={styles.retryText}>{retryLabel}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#eef0f2' },
  rounded: { borderRadius: 16, overflow: 'hidden' },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#eef0f2' },
  center: { alignItems: 'center', justifyContent: 'center' },
  padded: { paddingHorizontal: 24 },
  hint: { marginTop: 8, fontSize: 12, color: KimuColors.textSecondary },
  centerText: { textAlign: 'center', fontSize: 14 },
  retry: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: KimuColors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  retryText: { marginLeft: 6, fontSize: 14, fontWeight: '600', color: KimuColors.primary },
});
