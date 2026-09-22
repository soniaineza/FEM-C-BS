import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../global.css';

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
  recenterToken?: number;
  retryLabel?: string;
  loadingLabel?: string;
  errorLabel?: string;
}

// Web map: react-leaflet over raw OpenStreetMap tiles — same tile source
// the old Flutter app used via flutter_map, deliberately keyless. Metro
// resolves this file on web and RideMap.native.tsx on iOS/Android.
const ICON_COLORS: Record<RideMapMarker['icon'], string> = {
  pickup: '#16A34A',
  destination: '#DC2626',
  driver: '#111111',
  me: '#16A34A',
};

const iconCache = new Map<string, L.DivIcon>();

function markerIcon(kind: RideMapMarker['icon']) {
  if (iconCache.has(kind)) return iconCache.get(kind)!;
  
  const color = ICON_COLORS[kind];
  const icon = L.divIcon({
    className: 'fem-map-marker',
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });
  iconCache.set(kind, icon);
  return icon;
}

function ClickHandler({ onMapPress }: { onMapPress?: (pos: LatLng) => void }) {
  const map = useMap();
  useEffect(() => {
    if (!onMapPress) return;
    const handler = (e: L.LeafletMouseEvent) => onMapPress({ latitude: e.latlng.lat, longitude: e.latlng.lng });
    map.on('click', handler);
    return () => {
      map.off('click', handler);
    };
  }, [map, onMapPress]);
  return null;
}

function RecenterOnChange({ center, token }: { center: LatLng; token?: number }) {
  const map = useMap();
  useEffect(() => {
    if (map && center) {
      map.setView([center.latitude, center.longitude], map.getZoom(), { animate: true, duration: 0.3 });
    }
  }, [map, center.latitude, center.longitude, token]);
  return null;
}

// Fit the viewport to route + markers so the whole itinerary is on screen.
// Mirrors the WebView map's fitContent() — without it a map centered on the
// pickup shows a distant destination with no path in frame.
function FitBounds({ routePolyline, markers }: { routePolyline?: LatLng[]; markers?: RideMapMarker[] }) {
  const map = useMap();
  const signature = [
    (routePolyline ?? []).map((p) => `${p.latitude.toFixed(5)},${p.longitude.toFixed(5)}`).join('|'),
    (markers ?? []).map((m) => `${m.position.latitude.toFixed(5)},${m.position.longitude.toFixed(5)}`).join('|'),
  ].join(':');
  useEffect(() => {
    const pts: [number, number][] = [];
    (routePolyline ?? []).forEach((p) => pts.push([p.latitude, p.longitude]));
    if (pts.length === 0) {
      (markers ?? []).forEach((m) => pts.push([m.position.latitude, m.position.longitude]));
    }
    if (pts.length >= 2) {
      map.fitBounds(L.latLngBounds(pts).pad(0.2), { animate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, signature]);
  return null;
}

export function RideMap({ center, zoom = 15, markers = [], routePolyline, onMapPress, recenterToken }: RideMapProps) {
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const mapRef = useState<L.Map | null>(null);

  if (!center || typeof center.latitude !== 'number' || typeof center.longitude !== 'number') {
    return null;
  }

  return (
    <MapContainer
      center={[center.latitude, center.longitude]}
      zoom={zoom}
      style={{ width: '100%', height: '100%' }}
      zoomControl={false}
      attributionControl={false}
      whenReady={() => setMapReady(true)}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        subdomains={['a', 'b', 'c']}
        maxZoom={19}
        crossOrigin=""
      />
      {markers.map((m) => (
        <Marker
          key={m.id}
          position={[m.position.latitude, m.position.longitude]}
          icon={markerIcon(m.icon)}
        />
      ))}
      {routePolyline && routePolyline.length > 1 ? (
        <Polyline positions={routePolyline.map((p) => [p.latitude, p.longitude])} color="#16A34A" weight={4} />
      ) : null}
      <FitBounds routePolyline={routePolyline} markers={markers} />
      {onMapPress && <ClickHandler onMapPress={onMapPress} />}
      {center && <RecenterOnChange center={center} token={recenterToken} />}
    </MapContainer>
  );
}
