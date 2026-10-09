import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import MapEngine from './MapEngine';

/** How long to wait for the map view to answer before calling it a failure. */
const MAP_START_TIMEOUT_MS = 12000;
/** Remounts to attempt by ourselves before admitting the map is broken. */
const MAX_AUTO_RETRIES = 2;
import { perf } from '../../utils/perf';
import { useMapConfigStore } from '../../stores/useMapConfigStore';
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
  const styleUrl = useMapConfigStore((s) => s.styleUrl);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // Opened once per load attempt and closed in handleReady below. Keyed on
  // `nonce` because marking on every render while loading would reset the
  // start time each time, and the map would be timed from its last re-render
  // instead of from mount — a profiler that flatters itself is worse than no
  // profiler.
  const timedAttempt = useRef<number | null>(null);
  if (!ready && !error && timedAttempt.current !== nonce) {
    timedAttempt.current = nonce;
    perf.mark('map ready');
  }

  // DOM components only accept top-level async callbacks; keep their
  // identities stable so a prop change never re-sends them over the bridge.
  const handlers = useRef({ onPress, onCenterChanged, onUserGesture });
  handlers.current = { onPress, onCenterChanged, onUserGesture };
  // How far the WebView got, for the timeout message below. Starts before the
  // page has said anything, so a silent WebView reports as exactly that.
  const stage = useRef('waiting for the map view');
  const handleStage = useCallback(async (next: string) => {
    stage.current = next;
  }, []);

  const handleReady = useCallback(async () => {
    perf.measure('map ready');
    autoRetries.current = 0;
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

  // Android can kill a backgrounded WebView renderer, and remounting is the
  // right answer once or twice. But a renderer that dies immediately, every
  // time, used to remount for ever — and because each remount resets the
  // start timer below, the screen would sit on its spinner permanently no
  // matter how long anyone waited. Automatic remounts are capped; a person
  // pressing Try again always gets a fresh allowance.
  const autoRetries = useRef(0);

  function retry(automatic = false) {
    if (automatic) {
      if (autoRetries.current >= MAX_AUTO_RETRIES) {
        setError('The map view kept restarting. (renderer process gone)');
        return;
      }
      autoRetries.current += 1;
    } else {
      autoRetries.current = 0;
    }
    setError(null);
    setReady(false);
    stage.current = 'waiting for the map view';
    setNonce((n) => n + 1);
  }

  // The map runs inside a WebView. If that WebView fails to start at all —
  // a stripped bridge in a release build, a missing asset, a dead renderer —
  // neither onReady nor onError is ever called, and the screen used to sit on
  // its spinner for ever with nothing for anyone to report. Give up waiting
  // and say so, so a tester sees a reason and a Try again instead of a
  // permanent "Loading map".
  useEffect(() => {
    if (ready || error) return;
    const timer = setTimeout(() => {
      setError('The map did not start. (' + stage.current + ')');
    }, MAP_START_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [ready, error, nonce]);

  return (
    <View style={[styles.fill, rounded && styles.rounded]}>
      <MapEngine
        key={nonce}
        scene={scene}
        styleUrl={styleUrl}
        onReady={handleReady}
        onError={handleError}
        onStage={handleStage}
        onPress={handlePress}
        onCenterChanged={handleCenter}
        onUserGesture={handleGesture}
        dom={{
          // react-native-webview rather than @expo/dom-webview: the Expo one
          // emits only onMessage and onRenderProcessGone, so a page that fails
          // to load at all is indistinguishable from one that loaded and went
          // quiet. This one reports load, HTTP and load-error events, which
          // feed the stage text in the timeout message. One flag to revert.
          useExpoDOMWebView: false,
          onLoadEnd: () => {
            if (stage.current === 'waiting for the map view') {
              stage.current = 'page loaded, waiting for the map script';
            }
          },
          onError: (e: { nativeEvent?: { description?: string } }) => {
            setError('The map page failed to load. (' + (e?.nativeEvent?.description ?? 'unknown error') + ')');
          },
          onHttpError: (e: { nativeEvent?: { statusCode?: number } }) => {
            setError('The map page returned HTTP ' + (e?.nativeEvent?.statusCode ?? '?') + '.');
          },
          style: styles.fill,
          containerStyle: styles.fill,
          scrollEnabled: false,
          bounces: false,
          overScrollMode: 'never',
          // Android can kill a backgrounded WebView renderer; remount instead
          // of leaving a frozen grey rectangle.
          onRenderProcessGone: () => retry(true),
          onContentProcessDidTerminate: () => retry(true),
        }}
      />
      {!ready && !error ? (
        <View style={[styles.overlay, styles.center]} pointerEvents="none">
          <ActivityIndicator color={KimuColors.primary} />
          <Text className="font-sans" style={styles.hint}>{loadingLabel}</Text>
        </View>
      ) : null}
      {error ? (
        <View style={[styles.overlay, styles.center, styles.padded]}>
          <Ionicons name="map-outline" size={36} color={KimuColors.muted} />
          <Text className="font-sans" style={[styles.hint, styles.centerText]}>{errorLabel}</Text>
          {/* The underlying reason, so a failure on someone else's phone can
              be read off the screen instead of guessed at. */}
          <Text className="font-sans" style={[styles.reason, styles.centerText]} numberOfLines={3}>{error}</Text>
          <Pressable onPress={() => retry()} hitSlop={8} style={styles.retry}>
            <Ionicons name="refresh" size={16} color={KimuColors.primary} />
            <Text className="font-sans" style={styles.retryText}>{retryLabel}</Text>
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
  hint: { marginTop: 8, fontSize: 12, color: KimuColors.textSecondary, fontFamily: 'Inter_400Regular' },
  // Small and quiet: useful to a tester, not shouting at a rider.
  reason: { marginTop: 4, fontSize: 11, color: KimuColors.muted, fontFamily: 'Inter_400Regular' },
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
  retryText: { marginLeft: 6, fontSize: 14, fontWeight: '600', color: KimuColors.primary, fontFamily: 'Inter_600SemiBold' },
});
