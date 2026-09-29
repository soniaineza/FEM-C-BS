import { useEffect, useState } from 'react';
import { View, FlatList } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../../components/SafeAreaViewPlaceholder';
import { router } from 'expo-router';

import { useTranslation } from '../../../../hooks/useTranslation';
import { EmptyState, ErrorState, LoadingState, ScreenHeader, SegmentedControl, Text } from '../../../../components/ui';
import { RideStatusBadge } from '../../../../components/RideStatusBadge';
import { RouteTimeline } from '../../../../components/TripRouteCard';
import { Card } from '../../../../components/Card';
import { useResponsive } from '../../../../hooks/useResponsive';
import { getDriverRideHistory } from '../../../../services/driver-service';
import { Ride, formatFare } from '../../../../types/ride';

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
  const { contentStyle } = useResponsive();
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
    <SafeAreaViewPlaceholder className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <View style={[{ flex: 1 }, contentStyle]} className="px-5 pt-3">
        <ScreenHeader title={t('driverMyRides')} />

        <View className="mt-3">
          <SegmentedControl
            options={FILTERS.map((f) => ({ id: f, label: t(FILTER_KEYS[f] as any) }))}
            value={filter}
            onChange={setFilter}
          />
        </View>

        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} retryLabel={t('tryAgain')} onRetry={load} />
        ) : filtered.length === 0 ? (
          <EmptyState icon="car-outline" tone="primary" title={t('driverNoTripsYet')} />
        ) : (
          <FlatList
            className="mt-4"
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
            data={filtered}
            keyExtractor={(r) => r.id}
            renderItem={({ item }) => (
              <Card
                className="mb-3"
                onPress={() => router.push({ pathname: '/(driver)/(tabs)/trips/[rideId]', params: { rideId: item.id } } as any)}
              >
                <View className="flex-row items-center justify-between">
                  <RideStatusBadge status={item.status} />
                  <Text variant="headline" weight="bold" numberOfLines={1}>{formatFare(item.finalFare ?? item.estimatedFare)}</Text>
                </View>
                <View className="mt-3">
                  <RouteTimeline pickup={item.pickup.address} destination={item.destination.address} />
                </View>
              </Card>
            )}
          />
        )}
      </View>
    </SafeAreaViewPlaceholder>
  );
}
