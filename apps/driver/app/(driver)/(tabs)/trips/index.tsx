import { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaViewPlaceholder } from '@kimu/shared/components/SafeAreaViewPlaceholder';
import { router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { Button } from '@kimu/shared/components/Button';
import { DriverTopBar } from '../../../../components/driver/DriverTopBar';
import { getDriverRideHistory } from '../../../../services/driver-service';
import { Ride, formatFare, rideStatusKey } from '@kimu/shared/types/ride';

const FILTERS = ['all', 'completed', 'cancelled'] as const;
const FILTER_KEYS: Record<(typeof FILTERS)[number], string> = {
  all: 'driverFilterAll',
  completed: 'driverFilterCompleted',
  cancelled: 'driverFilterCancelled',
};

// Trip history — a leaner stand-in for the reference driver app's month-grid calendar
// (its TripMonthGrid): status filter chips over a
// flat list instead of a calendar picker, to keep this within scope. See
// the migration report for what a full calendar view would add.
export default function DriverTripsScreen() {
  const { t } = useTranslation();
  const isFocused = useIsFocused();
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');

  function load() {
    setLoading(true);
    setError(undefined);
    getDriverRideHistory()
      .then(setRides)
      .catch(() => setError(t('requestFailed')))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const filtered = rides.filter((r) => {
    if (filter === 'completed') return r.status === 'completed';
    if (filter === 'cancelled') return r.status === 'cancelled';
    return true;
  });

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-primary" edges={['left', 'right']}>
      {isFocused ? <StatusBar style="light" /> : null}
      <DriverTopBar title={t('driverMyRides')} />

      <View className="flex-row gap-2 bg-bg-light px-5 pt-4">
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
        <View className="flex-1 bg-bg-light"><ActivityIndicator className="mt-8" color="#0E7C4A" /></View>
      ) : error ? (
        <View className="flex-1 gap-4 bg-bg-light px-5 pt-8">
          <Text className="font-sans text-center text-error">{error}</Text>
          <Button title={t('tryAgain')} variant="outline" onPress={load} />
        </View>
      ) : filtered.length === 0 ? (
        <View className="flex-1 bg-bg-light"><Text className="font-sans mt-8 text-center text-text-secondary">{t('driverNoTripsYet')}</Text></View>
      ) : (
        <FlatList
          className="flex-1 bg-bg-light px-5 pt-3"
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
                  <Text numberOfLines={1} className="font-sans mt-0.5 text-[13px] text-text-secondary">{item.destination.address}</Text>
                </View>
                <Text className="font-bold text-primary">{formatFare(item.finalFare ?? item.estimatedFare)}</Text>
              </View>
              <Text className="font-sans mt-2 text-xs text-text-secondary">{t(rideStatusKey(item.status))}</Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaViewPlaceholder>
  );
}
