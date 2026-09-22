import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, ActivityIndicator, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface RideMapMarker {
  id: string;
  position: LatLng;
  icon: 'pickup' | 'destination' | 'driver' | 'me';
}

interface RideMapProps {
  center: LatLng;
  zoom?: number;
  markers?: RideMapMarker[];
  routePolyline?: LatLng[];
  onMapPress?: (pos: LatLng) => void;
  // Bump this to force the map to re-apply `center`/`zoom` even when they
  // haven't changed (e.g. a recenter button after the user pans the map).
  recenterToken?: number;
  // Optional label for the error state's retry action.
  retryLabel?: string;
  loadingLabel?: string;
  errorLabel?: string;
}

// Native map: a WebView running Leaflet over raw OpenStreetMap tiles — the
// same keyless tile source the old Flutter app used via flutter_map, and the
// same visual stack as RideMap.tsx (web). react-native-maps was rejected
// because it needs Google/Apple Maps API keys. Props flow in via injected
// JS; taps flow back out via postMessage → onMapPress.
const ICON_COLORS: Record<RideMapMarker['icon'], string> = {
  pickup: '#16A34A',
  destination: '#DC2626',
  driver: '#111111',
  me: '#16A34A',
};

function buildLeafletHtml(center: LatLng, zoom: number, markers: RideMapMarker[], routePolyline?: LatLng[]): string {
  const markerJson = JSON.stringify(
    markers.map((m) => ({ id: m.id, lat: m.position.latitude, lng: m.position.longitude, color: ICON_COLORS[m.icon] }))
  );
  const routeJson = JSON.stringify((routePolyline ?? []).map((p) => [p.latitude, p.longitude]));
  const centerJson = JSON.stringify([center.latitude, center.longitude]);

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #F5F5F5; }
  #map { width: 100%; height: 100%; }
  .fem-pin { width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 4px rgba(0,0,0,0.4); }
  .leaflet-container { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map', { zoomControl: false, attributionControl: false, preferCanvas: true }).setView(${centerJson}, ${zoom});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, crossOrigin: true }).addTo(map);

  function markerIcon(color) {
    return L.divIcon({ className: '', html: '<div class="fem-pin" style="background:' + color + '"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
  }

  var markerLayer = L.layerGroup().addTo(map);
  var routeLine = null;

  // Fit the viewport to whatever content exists (route first, else markers).
  // Without this, a fare-estimate/tracking map centered on the pickup shows a
  // destination far away with no visible path — the reported "map isn't
  // showing where I'm going" issue.
  function fitContent() {
    var lats = [];
    if (routeLine && routeLine.getLatLngs().length) {
      routeLine.getLatLngs().forEach(function (latlng) {
        if (Array.isArray(latlng)) {
          latlng.forEach(function (p) { lats.push([p.lat, p.lng]); });
        } else {
          lats.push([latlng.lat, latlng.lng]);
        }
      });
    }
    if (!lats.length) {
      markerLayer.eachLayer(function (layer) {
        var p = layer.getLatLng();
        lats.push([p.lat, p.lng]);
      });
    }
    if (lats.length >= 2) {
      map.fitBounds(L.latLngBounds(lats).pad(0.2), { animate: false });
    } else if (lats.length === 1) {
      map.setView(lats[0], Math.max(map.getZoom(), 14), { animate: false });
    }
  }

  function renderMarkers(markers) {
    markerLayer.clearLayers();
    (markers || []).forEach(function (m) {
      L.marker([m.lat, m.lng], { icon: markerIcon(m.color) }).addTo(markerLayer);
    });
  }

  function renderRoute(points) {
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    if (points && points.length > 1) {
      routeLine = L.polyline(points, { color: '#16A34A', weight: 4, smoothFactor: 1 }).addTo(map);
    }
  }

  renderMarkers(${markerJson});
  renderRoute(${routeJson});
  fitContent();

  map.on('click', function (e) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
      JSON.stringify({ type: 'press', latitude: e.latlng.lat, longitude: e.latlng.lng })
    );
  });

  // Fired by injectJavaScript when the center prop changes.
  document.addEventListener('message', function () {});
  window.__femSetView = function (lat, lng, z) {
    map.setView([lat, lng], z == null ? map.getZoom() : z, { animate: true, duration: 0.3 });
  };
  window.__femSetMarkers = function (markersJson) {
    renderMarkers(JSON.parse(markersJson));
  };
  window.__femSetRoute = function (routeJson) {
    renderRoute(JSON.parse(routeJson));
    fitContent();
  };
  window.__femFitRoute = fitContent;

  map.whenReady(function () {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
  });
</script>
</body>
</html>`;
}

export function RideMap({
  center,
  zoom = 15,
  markers = [],
  routePolyline,
  onMapPress,
  recenterToken,
  retryLabel = 'Retry',
  loadingLabel = 'Loading map…',
  errorLabel = 'The map could not be loaded. Check your connection.',
}: RideMapProps) {
  const webviewRef = useRef<WebView>(null);
  const onMapPressRef = useRef(onMapPress);
  onMapPressRef.current = onMapPress;

  // Incremented to remount the WebView after Android kills its renderer.
  const [renderNonce, setRenderNonce] = useState(0);
  // Tile/WebView lifecycle: show a spinner until the map reports ready, and a
  // retryable error state instead of a frozen grey rectangle if it fails.
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  // The full HTML (and thus the WebView page) is keyed on the route shape
  // only. Marker and center updates are pushed incrementally via
  // injectJavaScript below, so a driver GPS tick doesn't reload the page or
  // re-download tiles.
  const routeSignature = useMemo(
    () => JSON.stringify((routePolyline ?? []).map((p) => [p.latitude.toFixed(5), p.longitude.toFixed(5)])),
    [routePolyline]
  );
  const html = useMemo(
    () => buildLeafletHtml(center, zoom, markers, routePolyline),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [routeSignature]
  );

  const markerSignature = useMemo(
    () => JSON.stringify(markers.map((m) => [m.id, m.position.latitude.toFixed(6), m.position.longitude.toFixed(6), m.icon])),
    [markers]
  );

  // Push marker updates without reloading the page.
  const updateMarkers = useCallback(() => {
    const payload = JSON.stringify(
      markers.map((m) => ({ id: m.id, lat: m.position.latitude, lng: m.position.longitude, color: ICON_COLORS[m.icon] }))
    );
    webviewRef.current?.injectJavaScript(`window.__femSetMarkers(${JSON.stringify(payload)}); true;`);
  }, [markers]);

  useEffect(() => {
    updateMarkers();
  }, [updateMarkers]);

  // Debounced center update to avoid excessive injectJavaScript calls
  const centerUpdateTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateCenter = useCallback(() => {
    if (centerUpdateTimeout.current) {
      clearTimeout(centerUpdateTimeout.current);
    }
    centerUpdateTimeout.current = setTimeout(() => {
      webviewRef.current?.injectJavaScript(`window.__femSetView(${center.latitude}, ${center.longitude}, ${zoom}); true;`);
    }, 100);
  }, [center.latitude, center.longitude, zoom]);

  useEffect(() => {
    updateCenter();
    return () => {
      if (centerUpdateTimeout.current) {
        clearTimeout(centerUpdateTimeout.current);
      }
    };
  }, [updateCenter]);

  function onMessage(event: WebViewMessageEvent) {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'ready') {
        setLoaded(true);
        setErrored(false);
        return;
      }
      if (data.type === 'press' && onMapPressRef.current) {
        onMapPressRef.current({ latitude: data.latitude, longitude: data.longitude });
      }
    } catch {
      // Ignore malformed messages — never crash the app over a bridge hiccup.
    }
  }

  // Recenter on demand (recenterToken change) even if center/zoom are the same.
  useEffect(() => {
    if (recenterToken === undefined) return;
    webviewRef.current?.injectJavaScript(
      `window.__femSetView && window.__femSetView(${center.latitude}, ${center.longitude}, ${zoom}); true;`
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterToken]);

  function retry() {
    setErrored(false);
    setLoaded(false);
    setRenderNonce((n) => n + 1);
  }

  return (
    <View className="flex-1 overflow-hidden rounded-xl" style={{ backgroundColor: '#F5F5F5' }}>
      <WebView
        ref={webviewRef}
        source={{ html }}
        onMessage={onMessage}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        geolocationEnabled
        setSupportMultipleWindows={false}
        cacheEnabled
        pullToRefreshEnabled={false}
        allowsBackForwardNavigationGestures={false}
        onLoadEnd={() => setLoaded(true)}
        onError={() => setErrored(true)}
        onHttpError={() => setErrored(true)}
        // Android kills backgrounded renderers under memory pressure; without
        // this the map turned into a frozen grey rectangle after returning
        // from the background (part of the reported "crashing/freezing").
        // onRenderProcessGoneDetail requires a changed key to remount, hence
        // the renderNonce below.
        onRenderProcessGone={(e) => {
          const { didCrash } = e.nativeEvent ?? {};
          console.warn(`[RideMap] render process ${didCrash ? 'crashed' : 'was killed'} — remounting`);
          setLoaded(false);
          setRenderNonce((n) => n + 1);
        }}
        style={{ flex: 1, backgroundColor: '#F5F5F5' }}
        key={renderNonce}
      />

      {!loaded && !errored ? (
        <View className="absolute inset-0 items-center justify-center" style={{ backgroundColor: '#F5F5F5' }}>
          <ActivityIndicator color="#16A34A" />
          <Text className="mt-2 text-xs text-text-secondary">{loadingLabel}</Text>
        </View>
      ) : null}

      {errored ? (
        <View className="absolute inset-0 items-center justify-center px-6" style={{ backgroundColor: '#F5F5F5' }}>
          <Ionicons name="map-outline" size={36} color="#9CA3AF" />
          <Text className="mt-2 text-center text-sm text-text-secondary">
            {errorLabel}
          </Text>
          <Pressable
            onPress={retry}
            hitSlop={8}
            className="mt-3 flex-row items-center rounded-full border border-primary px-4 py-2"
          >
            <Ionicons name="refresh" size={16} color="#16A34A" />
            <Text className="ml-1.5 text-sm font-semibold text-primary">{retryLabel}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
