import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { DriverStop } from '../../services/driver-service';

// The driver's remaining stops on a shared trip, in the order to drive
// them. The first row is always the next thing to do; tapping a stop that
// belongs to another rider switches the trip screen to that rider.
export function StopList({
  stops,
  currentRideId,
  onSelectRide,
}: {
  stops: DriverStop[];
  currentRideId: string;
  onSelectRide: (rideId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="mt-3 rounded-2xl border border-border bg-white p-3">
      <Text className="px-1 text-xs font-semibold uppercase text-text-secondary">{t('driverStopsTitle')}</Text>
      {stops.map((stop, index) => {
        const isPickup = stop.type === 'pickup';
        const isCurrent = stop.rideId === currentRideId;
        const label = t(isPickup ? 'driverStopPickup' : 'driverStopDropoff', { name: stop.passengerName });
        return (
          <Pressable
            key={`${stop.rideId}-${stop.type}`}
            accessibilityRole="button"
            accessibilityLabel={`${index + 1}. ${label}, ${stop.address}`}
            onPress={() => onSelectRide(stop.rideId)}
            className={`mt-1.5 min-h-[48px] flex-row items-center rounded-xl px-2 py-2 ${isCurrent ? 'bg-primary/5' : ''}`}
          >
            <View
              className="h-7 w-7 items-center justify-center rounded-full"
              style={{ backgroundColor: index === 0 ? '#0E7C4A' : '#E5E7EB' }}
            >
              <Text className="text-xs font-bold" style={{ color: index === 0 ? '#FFFFFF' : '#111827' }}>{index + 1}</Text>
            </View>
            <View className="ml-2.5 flex-1">
              <View className="flex-row items-center">
                <Ionicons name={isPickup ? 'arrow-up-circle' : 'arrow-down-circle'} size={14} color={isPickup ? '#0E7C4A' : '#DC2626'} />
                <Text className="ml-1 flex-1 text-[13px] font-semibold text-ink" numberOfLines={1}>
                  {label}
                  {stop.seats > 1 ? ` · ${t('seatsLabel', { count: stop.seats })}` : ''}
                </Text>
              </View>
              <Text className="mt-0.5 text-xs text-text-secondary" numberOfLines={1}>{stop.address}</Text>
            </View>
            <Text className="ml-2 text-xs font-semibold text-text-secondary">{stop.etaMinutes} {t('minutesShort')}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
