import { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
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
</style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map', { zoomControl: false, attributionControl: false }).setView(${centerJson}, ${zoom});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

  function markerIcon(color) {
    return L.divIcon({ className: '', html: '<div class="fem-pin" style="background:' + color + '"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
  }

  var markerLayer = L.layerGroup().addTo(map);
  var routeLine = null;

  function renderMarkers(markers) {
    markerLayer.clearLayers();
    (markers || []).forEach(function (m) {
      L.marker([m.lat, m.lng], { icon: markerIcon(m.color) }).addTo(markerLayer);
    });
  }

  function renderRoute(points) {
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    if (points && points.length > 1) {
      routeLine = L.polyline(points, { color: '#16A34A', weight: 4 }).addTo(map);
    }
  }

  renderMarkers(${markerJson});
  renderRoute(${routeJson});

  map.on('click', function (e) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
      JSON.stringify({ type: 'press', latitude: e.latlng.lat, longitude: e.latlng.lng })
    );
  });

  // Fired by injectJavaScript when the center prop changes.
  document.addEventListener('message', function () {});
  window.__femSetView = function (lat, lng, z) {
    map.setView([lat, lng], z == null ? map.getZoom() : z);
  };
  window.__femSetMarkers = function (markersJson) {
    renderMarkers(JSON.parse(markersJson));
  };
  window.__femSetRoute = function (routeJson) {
    renderRoute(JSON.parse(routeJson));
  };

  map.whenReady(function () {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
  });
</script>
</body>
</html>`;
}

export function RideMap({ center, zoom = 15, markers = [], routePolyline, onMapPress }: RideMapProps) {
  const webviewRef = useRef<WebView>(null);
  const onMapPressRef = useRef(onMapPress);
  onMapPressRef.current = onMapPress;

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
  useEffect(() => {
    const payload = JSON.stringify(
      markers.map((m) => ({ id: m.id, lat: m.position.latitude, lng: m.position.longitude, color: ICON_COLORS[m.icon] }))
    );
    webviewRef.current?.injectJavaScript(`window.__femSetMarkers(${JSON.stringify(payload)}); true;`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerSignature]);

  // Recenter when the center prop changes.
  useEffect(() => {
    webviewRef.current?.injectJavaScript(`window.__femSetView(${center.latitude}, ${center.longitude}, ${zoom}); true;`);
  }, [center.latitude, center.longitude, zoom]);

  function onMessage(event: WebViewMessageEvent) {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'press' && onMapPressRef.current) {
        onMapPressRef.current({ latitude: data.latitude, longitude: data.longitude });
      }
    } catch {
      // Ignore malformed messages — never crash the app over a bridge hiccup.
    }
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
        style={{ flex: 1, backgroundColor: '#F5F5F5' }}
      />
    </View>
  );
}
