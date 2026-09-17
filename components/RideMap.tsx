import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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

// Web map: react-leaflet over raw OpenStreetMap tiles — same tile source
// the old Flutter app used via flutter_map, deliberately keyless. Metro
// resolves this file on web and RideMap.native.tsx on iOS/Android.
const ICON_COLORS: Record<RideMapMarker['icon'], string> = {
  pickup: '#16A34A',
  destination: '#DC2626',
  driver: '#111111',
  me: '#16A34A',
};

function markerIcon(kind: RideMapMarker['icon']) {
  const color = ICON_COLORS[kind];
  return L.divIcon({
    className: '',
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
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

function RecenterOnChange({ center }: { center: LatLng }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.latitude, center.longitude]);
  }, [map, center.latitude, center.longitude]);
  return null;
}

export function RideMap({ center, zoom = 15, markers = [], routePolyline, onMapPress }: RideMapProps) {
  return (
    <MapContainer
      center={[center.latitude, center.longitude]}
      zoom={zoom}
      style={{ width: '100%', height: '100%' }}
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {markers.map((m) => (
        <Marker key={m.id} position={[m.position.latitude, m.position.longitude]} icon={markerIcon(m.icon)} />
      ))}
      {routePolyline && routePolyline.length > 1 ? (
        <Polyline positions={routePolyline.map((p) => [p.latitude, p.longitude])} color="#16A34A" weight={4} />
      ) : null}
      <ClickHandler onMapPress={onMapPress} />
      <RecenterOnChange center={center} />
    </MapContainer>
  );
}
