import { View, Text } from 'react-native';
import { memo } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Place } from '../types/place';

// Direct port of lib/widgets/trip_route_card.dart: pickup (filled dot) and
// destination (pin) connected by a short vertical line, with distance/
// duration on the right when known.
export const TripRouteCard = memo(function TripRouteCard({
  pickup,
  destination,
  distanceKm,
  durationMinutes,
}: {
  pickup: Place;
  destination: Place;
  distanceKm?: number;
  durationMinutes?: number;
}) {
  return (
    <View className="flex-row items-center rounded-xl border border-border bg-white p-4">
      <View className="flex-1">
        <View className="flex-row items-start">
          <Ionicons name="ellipse" size={10} color="#0E7C4A" style={{ marginTop: 5 }} />
          <Text className="ml-2.5 flex-1 text-sm font-semibold leading-5 text-ink">{pickup.address}</Text>
        </View>
        <View className="ml-[4.5px] h-[18px] w-[1.6px] bg-border" />
        <View className="flex-row items-start">
          <Ionicons name="location" size={12} color="#F97316" style={{ marginTop: 4, marginLeft: -1 }} />
          <Text className="ml-2.5 flex-1 text-sm font-semibold leading-5 text-ink">{destination.address}</Text>
        </View>
      </View>
      {distanceKm != null ? (
        <View className="ml-3 items-center">
          <Ionicons name="resize-outline" size={16} color="#6B7280" />
          <Text className="mt-1 text-[13px] font-bold text-ink">{distanceKm.toFixed(1)} km</Text>
          {durationMinutes != null ? (
            <Text className="font-sans mt-1.5 text-xs text-text-secondary">~{durationMinutes} min</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

TripRouteCard.displayName = 'TripRouteCard';
