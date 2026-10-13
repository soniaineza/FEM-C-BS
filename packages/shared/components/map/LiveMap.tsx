import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import MapEngine from './MapEngine';
import { MAP_BOOT_SCRIPT, MAP_LOADED_PROBE } from './mapBootScripts';
import { perf } from '../../utils/perf';
import { useMapConfigStore } from '../../stores/useMapConfigStore';
import { useTranslation } from '../../hooks/useTranslation';
import type { MapPadding, MapScene } from './map-types';
import { KimuColors } from '../../constants/theme';

/** How long to wait for the map view to answer before calling it a failure. */
const MAP_START_TIMEOUT_MS = 12000;
/** Remounts to attempt by ourselves before admitting the map is broken. */
const MAX_AUTO_RETRIES = 2;
/** Height the loading/error content keeps for itself whatever panels cover the map. */
const MIN_VISIBLE_HEIGHT = 170;
/**
 * Build with EXPO_PUBLIC_MAP_DEBUG=1 to inspect the map page of a release
 * build from chrome://inspect (WebView.setWebContentsDebuggingEnabled).
 */
const MAP_DEBUG = process.env.EXPO_PUBLIC_MAP_DEBUG === '1';
/** Error text that means the WebView could not even parse the map script. */
const OUTDATED_WEBVIEW = /SyntaxError|Unexpected token|Invalid or unexpected token|Unexpected identifier/i;

const NO_INSETS: MapPadding = { top: 0, bottom: 0, left: 0, right: 0 };

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
  /**
   * Screen space covered by panels over the map (a bottom sheet, a header),
   * so the loading and error content, and the Try again button, sit in the
   * part of the map that can be seen. Defaults to the camera padding.
   */
  insets?: MapPadding;
}

/**
 * Keeps the overlay content inside the uncovered part of the map: panels can
 * ask for more than the map is tall on a short phone, in which case the
 * covered space is scaled down so the content still has room.
 */
function visibleInsets(padding: MapPadding | undefined, height: number): MapPadding {
  if (!padding) return NO_INSETS;
  let top = Math.max(0, padding.top);
  let bottom = Math.max(0, padding.bottom);
  if (height > 0) {
    const room = Math.max(0, height - MIN_VISIBLE_HEIGHT);
    if (top + bottom > room) {
      const k = top + bottom ? room / (top + bottom) : 0;
      top = Math.floor(top * k);
      bottom = Math.floor(bottom * k);
    }
  }
  return { top, bottom, left: Math.min(Math.max(0, padding.left), 40), right: Math.min(Math.max(0, padding.right), 40) };
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
  insets,
}: LiveMapProps) {
  const { t } = useTranslation();
  const styleUrl = useMapConfigStore((s) => s.styleUrl);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [height, setHeight] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => setHeight(Math.round(e.nativeEvent.layout.height)), []);

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

  const readyRef = useRef(false);
  const handleReady = useCallback(async () => {
    perf.measure('map ready');
    autoRetries.current = 0;
    readyRef.current = true;
    setReady(true);
    setError(null);
  }, []);
  // Errors come from MapEngine and from the page's error hooks (mapBoot.ts,
  // mapBootScripts.ts). Once the map is up, a later script error is not
  // worth hiding a working map behind an error screen.
  const handleError = useCallback(async (message: string) => {
    if (readyRef.current) {
      console.warn('[map] error after the map was ready:', message);
      return;
    }
    setError(message);
  }, []);
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
    readyRef.current = false;
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

  const vis = visibleInsets(insets ?? scene.camera.padding, height);
  const overlayPadding = { paddingTop: vis.top, paddingBottom: vis.bottom, paddingLeft: 24 + vis.left, paddingRight: 24 + vis.right };

  return (
    <View style={[styles.fill, rounded && styles.rounded]} onLayout={onLayout}>
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
          // Expo's own WebView (@expo/dom-webview), the default for DOM
          // components. react-native-webview was tried for its page-load
          // events, but on Android it defines ReactNativeWebView
          // .injectedObjectJson() by evaluating a script before the page is
          // loaded, into the document that is about to be replaced. The
          // page's bootstrap then threw "Failed to parse injectedObjectJson",
          // the map script never ran, and every release build sat on
          // "waiting for the map script". Expo's WebView exposes the same
          // function as a synchronous Java method, available in every
          // document from its first line. Page-load observability now comes
          // from the two scripts below instead.
          injectedJavaScriptBeforeContentLoaded: MAP_BOOT_SCRIPT,
          injectedJavaScript: MAP_LOADED_PROBE,
          webviewDebuggingEnabled: MAP_DEBUG || __DEV__,
          style: styles.fill,
          containerStyle: styles.fill,
          // Android can kill a backgrounded WebView renderer; remount instead
          // of leaving a frozen grey rectangle.
          onRenderProcessGone: () => retry(true),
          onContentProcessDidTerminate: () => retry(true),
        }}
      />
      {!ready && !error ? (
        <View style={[styles.overlay, styles.center, overlayPadding]} pointerEvents="none">
          <ActivityIndicator color={KimuColors.primary} />
          <Text className="font-sans" style={styles.hint}>{loadingLabel}</Text>
        </View>
      ) : null}
      {error ? (
        <View style={[styles.overlay, styles.center, overlayPadding]}>
          <Ionicons name="map-outline" size={36} color={KimuColors.muted} />
          <Text className="font-sans" style={[styles.hint, styles.centerText]}>
            {OUTDATED_WEBVIEW.test(error) ? t('mapWebViewOutdated') : errorLabel}
          </Text>
          {/* The underlying reason, so a failure on someone else's phone can
              be read off the screen instead of guessed at. */}
          <Text className="font-sans" style={[styles.reason, styles.centerText]} numberOfLines={4}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => retry()} hitSlop={8} style={styles.retry}>
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
    minHeight: 44,
  },
  retryText: { marginLeft: 6, fontSize: 14, fontWeight: '600', color: KimuColors.primary, fontFamily: 'Inter_600SemiBold' },
});
