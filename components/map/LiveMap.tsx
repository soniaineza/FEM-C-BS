import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Pressable } from '../ui/Pressable';
import { Ionicons } from '@expo/vector-icons';

import MapEngine from './MapEngine';
import type { MapScene } from './map-types';
import { Colors, Elevation, FemColors } from '../../constants/theme';
import { useTranslation } from '../../hooks/useTranslation';

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
  /** Show the +/− zoom buttons (default true; hidden on non-interactive maps). */
  zoomControls?: boolean;
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
  zoomControls = true,
}: LiveMapProps) {
  const { t } = useTranslation();
  const [zoomCommand, setZoomCommand] = useState<{ delta: number; token: number } | undefined>();
  const zoom = (delta: number) => setZoomCommand((z) => ({ delta, token: (z?.token ?? 0) + 1 }));
  const sceneWithZoom = useMemo(() => (zoomCommand ? { ...scene, zoomCommand } : scene), [scene, zoomCommand]);
  const showZoom = zoomControls && scene.interactive !== false;
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
  const handleError = useCallback(async (message: string) => {
    console.warn('[map] failed to load:', message);
    setError(message);
  }, []);
  const handlePress = useCallback(async (lat: number, lng: number) => handlers.current.onPress?.(lat, lng), []);
  const handleCenter = useCallback(
    async (lat: number, lng: number) => handlers.current.onCenterChanged?.(lat, lng),
    []
  );
  const handleGesture = useCallback(async () => handlers.current.onUserGesture?.(), []);

  // Never spin forever: if the map hasn't reported ready, offer a retry.
  useEffect(() => {
    if (ready || error) return;
    const timer = setTimeout(() => {
      console.warn('[map] failed to load: timed out waiting for the map');
      setError('timeout');
    }, 25_000);
    return () => clearTimeout(timer);
  }, [ready, error, nonce]);

  function retry() {
    setError(null);
    setReady(false);
    setNonce((n) => n + 1);
  }

  return (
    <View style={[styles.fill, rounded && styles.rounded]}>
      <MapEngine
        key={nonce}
        scene={sceneWithZoom}
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
          // Opt-in (EXPO_PUBLIC_WEBVIEW_DEBUG=1) remote inspection of the map WebView.
          webviewDebuggingEnabled: __DEV__ || process.env.EXPO_PUBLIC_WEBVIEW_DEBUG === '1',
          // Android can kill a backgrounded WebView renderer; remount instead
          // of leaving a frozen grey rectangle.
          onRenderProcessGone: () => retry(),
          onContentProcessDidTerminate: () => retry(),
        }}
      />
      {showZoom && ready && !error ? (
        <View style={styles.zoom} pointerEvents="box-none">
          <View style={[styles.zoomPill, Elevation[2]]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('zoomIn')}
              onPress={() => zoom(1)}
              hitSlop={4}
              style={({ pressed }) => [styles.zoomButton, pressed && styles.zoomPressed]}
            >
              <Ionicons name="add" size={22} color={Colors.fg} />
            </Pressable>
            <View style={styles.zoomDivider} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('zoomOut')}
              onPress={() => zoom(-1)}
              hitSlop={4}
              style={({ pressed }) => [styles.zoomButton, pressed && styles.zoomPressed]}
            >
              <Ionicons name="remove" size={22} color={Colors.fg} />
            </Pressable>
          </View>
        </View>
      ) : null}
      {!ready && !error ? (
        <View style={[styles.overlay, styles.center]} pointerEvents="none">
          <ActivityIndicator color={FemColors.primary} />
          <Text style={styles.hint}>{loadingLabel}</Text>
        </View>
      ) : null}
      {error ? (
        <View style={[styles.overlay, styles.center, styles.padded]}>
          <Ionicons name="map-outline" size={36} color={FemColors.muted} />
          <Text style={[styles.hint, styles.centerText]}>{errorLabel}</Text>
          <Pressable onPress={retry} hitSlop={8} style={styles.retry}>
            <Ionicons name="refresh" size={16} color={FemColors.primary} />
            <Text style={styles.retryText}>{retryLabel}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: Colors['surface-muted'] },
  rounded: { borderRadius: 16, overflow: 'hidden' },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: Colors['surface-muted'] },
  center: { alignItems: 'center', justifyContent: 'center' },
  padded: { paddingHorizontal: 24 },
  hint: { marginTop: 8, fontSize: 12, color: FemColors.textSecondary },
  centerText: { textAlign: 'center', fontSize: 14 },
  retry: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: FemColors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  // Right edge, a third of the way down: clear of the top header controls and
  // of the bottom sheets every map screen uses.
  zoom: { position: 'absolute', right: 16, top: '30%' },
  zoomPill: { backgroundColor: Colors.surface, borderRadius: 14, overflow: 'hidden' },
  zoomButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  zoomPressed: { backgroundColor: Colors['surface-muted'] },
  zoomDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 8, backgroundColor: Colors.border },
  retryText: { marginLeft: 6, fontSize: 14, fontWeight: '600', color: FemColors.primary },
});
