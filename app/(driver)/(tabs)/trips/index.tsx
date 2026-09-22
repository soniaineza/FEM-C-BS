import { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../../components/SafeAreaViewPlaceholder';
import { router } from 'expo-router';

import { useTranslation } from '../../../../hooks/useTranslation';
import { getDriverRideHistory } from '../../../../services/driver-service';
import { Ride, formatFare, rideStatusKey } from '../../../../types/ride';

const FILTERS = ['all', 'completed', 'cancelled'] as const;
const FILTER_KEYS: Record<(typeof FILTERS)[number], string> = {
  all: 'driverFilterAll',
  completed: 'driverFilterCompleted',
  cancelled: 'driverFilterCancelled',
};

// Trip history — a leaner stand-in for KIMU driver's month-grid calendar
// (kimu.ride.driver.app.ui.trips.TripMonthGrid): status filter chips over a
// flat list instead of a calendar picker, to keep this within scope. See
// the migration report for what a full calendar view would add.
export default function DriverTripsScreen() {
  const { t } = useTranslation();
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');

  useEffect(() => {
    getDriverRideHistory()
      .then(setRides)
      .finally(() => setLoading(false));
  }, []);

  const filtered = rides.filter((r) => {
    if (filter === 'completed') return r.status === 'completed';
    if (filter === 'cancelled') return r.status === 'cancelled';
    return true;
  });

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-bg-light">
      <View className="px-5 pb-3 pt-4">
        <Text className="text-xl font-bold text-ink">{t('driverMyRides')}</Text>
      </View>

      <View className="flex-row gap-2 px-5">
        {FILTERS.map((f) => (
          <Pressable
            key={f}
            className={`rounded-full border px-3.5 py-1.5 ${filter === f ? 'border-primary bg-primary/10' : 'border-border bg-white'}`}
            onPress={() => setFilter(f)}
          >
            <Text className={filter === f ? 'text-[13px] font-semibold text-primary' : 'text-[13px] text-ink'}>{t(FILTER_KEYS[f] as any)}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator className="mt-8" color="#16A34A" />
      ) : filtered.length === 0 ? (
        <Text className="mt-8 text-center text-text-secondary">{t('driverNoTripsYet')}</Text>
      ) : (
        <FlatList
          className="mt-3 px-5"
          data={filtered}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <Pressable
              className="mb-3 rounded-2xl border border-border bg-white p-4"
              onPress={() => router.push({ pathname: '/(driver)/(tabs)/trips/[rideId]', params: { rideId: item.id } } as any)}
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-3">
                  <Text numberOfLines={1} className="text-[14.5px] font-semibold text-ink">{item.pickup.address}</Text>
                  <Text numberOfLines={1} className="mt-0.5 text-[13px] text-text-secondary">{item.destination.address}</Text>
                </View>
                <Text className="font-bold text-primary">{formatFare(item.finalFare ?? item.estimatedFare)}</Text>
              </View>
              <Text className="mt-2 text-xs text-text-secondary">{t(rideStatusKey(item.status))}</Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaViewPlaceholder>
  );
}
