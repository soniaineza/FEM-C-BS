import { View } from 'react-native';
import { memo } from 'react';

import { Colors } from '../constants/theme';
import { Place } from '../types/place';
import { Card } from './Card';
import { Text } from './ui/Text';

/** Pickup → destination timeline card with optional distance/duration. */
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
    <Card>
      <RouteTimeline pickup={pickup.address} destination={destination.address} />
      {distanceKm != null ? (
        <View style={{ flexDirection: 'row', marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: Colors.divider, gap: 24 }}>
          <Metric label="km" value={distanceKm.toFixed(1)} />
          {durationMinutes != null ? <Metric label="min" value={`~${durationMinutes}`} /> : null}
        </View>
      ) : null}
    </Card>
  );
});

TripRouteCard.displayName = 'TripRouteCard';

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <Text variant="callout" weight="semibold">
      {value} <Text variant="subhead" tone="muted">{label}</Text>
    </Text>
  );
}

/** Two stops joined by a vertical rail: ring for pickup, square for drop-off. */
export function RouteTimeline({ pickup, destination }: { pickup: string; destination: string }) {
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ width: 20, alignItems: 'center', paddingTop: 5 }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 3, borderColor: Colors.primary, backgroundColor: Colors.surface }} />
        </View>
        <Text variant="callout" weight="medium" numberOfLines={2} style={{ flex: 1, marginLeft: 10 }}>
          {pickup}
        </Text>
      </View>
      <View style={{ width: 20, alignItems: 'center' }}>
        <View style={{ width: 2, height: 18, marginVertical: 2, backgroundColor: Colors.border, borderRadius: 1 }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ width: 20, alignItems: 'center', paddingTop: 5 }}>
          <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: Colors.fg }} />
        </View>
        <Text variant="callout" weight="medium" numberOfLines={2} style={{ flex: 1, marginLeft: 10 }}>
          {destination}
        </Text>
      </View>
    </View>
  );
}
