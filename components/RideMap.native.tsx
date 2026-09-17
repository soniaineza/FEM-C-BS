import { View, Text } from 'react-native';

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

// Placeholder — the real native map (react-native-webview + a bundled
// Leaflet HTML page, same keyless OSM stack as RideMap.web.tsx) is built in
// Phase 5. Only the web export ships in this migration, so this stub exists
// purely so the app compiles for native without pulling in react-native-maps
// (which needs Google/Apple Maps API keys — a regression from today's
// deliberately keyless stack).
export function RideMap({ center }: RideMapProps) {
  return (
    <View className="flex-1 items-center justify-center bg-gray-light">
      <Text className="text-text-secondary">
        Map preview unavailable on native yet ({center.latitude.toFixed(4)}, {center.longitude.toFixed(4)})
      </Text>
    </View>
  );
}
