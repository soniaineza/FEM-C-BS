import { useCallback, useMemo, useState } from 'react';
import { View, FlatList } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../../components/SafeAreaViewPlaceholder';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { Card } from '../../../../components/Card';
import { RideStatusBadge } from '../../../../components/RideStatusBadge';
import { RouteTimeline } from '../../../../components/TripRouteCard';
import { EmptyState, ErrorState, LoadingState, ScreenHeader, SegmentedControl, Text } from '../../../../components/ui';
import { useResponsive } from '../../../../hooks/useResponsive';
import { useTranslation } from '../../../../hooks/useTranslation';
import { TranslationKey } from '../../../../locales';
import { getRideHistory } from '../../../../services/ride-service';
import { Ride, formatFare, rideStatusKey } from '../../../../types/ride';
import { ApiError } from '../../../../services/api-client';

// My Rides — the ride history screen with Upcoming/Active/Completed tabs.
// Network failures (server cold start, offline) land on an explicit error
// card with a retry button instead of an unhandled promise rejection. Empty
// states are tab-specific and intentional (icon + title + hint), never blank.
export default function RideHistoryScreen() {
  const { t } = useTranslation();
  const { contentStyle } = useResponsive();
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [tab, setTab] = useState<'upcoming' | 'active' | 'completed'>('upcoming');

  const load = useCallback(() => {
    setLoading(true);
    setError(undefined);
    getRideHistory()
      .then(setRides)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('requestFailed')))
      .finally(() => setLoading(false));
  }, [t]);

  useFocusEffect(load);

  // Single GET /rides backs all three tabs (the backend has one history
  // endpoint) — filtering is client-side, deterministic, and free.
  const upcoming = useMemo(() => rides.filter((r) => r.status === 'scheduled'), [rides]);
  const active = useMemo(
    () =>
      rides.filter((r) =>
        [
          'searchingDriver',
          'driverAssigned',
          'driverArriving',
          'driverArrived',
          'pinVerified',
          'inProgress',
          'arrived',
          'paymentPending',
        ].includes(r.status)
      ),
    [rides]
  );
  const completed = useMemo(
    () => rides.filter((r) => r.status === 'completed' || r.status === 'cancelled'),
    [rides]
  );

  const sections: Record<
    'upcoming' | 'active' | 'completed',
    { data: Ride[]; title: TranslationKey; hint: TranslationKey; icon: keyof typeof Ionicons.glyphMap }
  > = {
    upcoming: { data: upcoming, title: 'ridesEmptyUpcoming', hint: 'ridesEmptyUpcomingHint', icon: 'calendar-outline' },
    active: { data: active, title: 'ridesEmptyActive', hint: 'ridesEmptyActiveHint', icon: 'navigate-outline' },
    completed: { data: completed, title: 'ridesEmptyCompleted', hint: 'ridesEmptyCompletedHint', icon: 'checkmark-done-outline' },
  };
  const section = sections[tab];

  const TABS: { id: 'upcoming' | 'active' | 'completed'; label: string }[] = [
    { id: 'upcoming', label: t('rideTabUpcoming') },
    { id: 'active', label: t('rideTabActive') },
    { id: 'completed', label: t('rideTabCompleted') },
  ];

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <View style={[{ flex: 1 }, contentStyle]} className="px-5 pt-3">
        <ScreenHeader title={t('myRides')} />

        <View className="mt-3">
          <SegmentedControl options={TABS} value={tab} onChange={setTab} />
        </View>

        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} retryLabel={t('tryAgain')} onRetry={load} />
        ) : section.data.length === 0 ? (
          <EmptyState icon={section.icon} tone="primary" title={t(section.title)} message={t(section.hint)} />
        ) : (
          <FlatList
            className="mt-4"
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
            data={section.data}
            keyExtractor={(r) => r.id}
            renderItem={({ item }) => <RideCard ride={item} />}
          />
        )}
      </View>
    </SafeAreaViewPlaceholder>
  );
}

function RideCard({ ride }: { ride: Ride }) {
  const { t } = useTranslation();
  const date = new Date(ride.completedAt ?? ride.createdAt ?? Date.now());
  const dateText = `${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <Card
      className="mb-3"
      onPress={() => router.push({ pathname: '/(main)/(tabs)/activity/[rideId]', params: { rideId: ride.id } })}
      accessibilityLabel={`${t(rideStatusKey(ride.status))} · ${ride.destination.address}`}
    >
      <View className="flex-row items-center justify-between">
        <Text variant="footnote" tone="muted">{dateText}</Text>
        <RideStatusBadge status={ride.status} />
      </View>

      <View className="mt-3">
        <RouteTimeline pickup={ride.pickup.address} destination={ride.destination.address} />
      </View>

      <View className="mt-3 flex-row items-center justify-between border-t border-divider pt-3">
        <Text variant="footnote" tone="muted">
          {t(ride.rideType === 'shared' ? 'shareRide' : 'privateRide')}
        </Text>
        <Text variant="headline" weight="bold">
          {formatFare(ride.finalFare ?? ride.estimatedFare)}
        </Text>
      </View>
    </Card>
  );
}
