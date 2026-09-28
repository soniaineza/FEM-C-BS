import { useCallback, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../../components/SafeAreaViewPlaceholder';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { Button } from '../../../../components/Button';
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
    <SafeAreaViewPlaceholder className="flex-1 bg-bg-light" edges={['top', 'left', 'right']}>
      <View className="flex-1 px-6 pt-4">
        <Text className="text-2xl font-bold text-ink">{t('myRides')}</Text>

        {/* Segmented control: pill background on the active tab, equal flex
            widths so all locales fit without truncation on 320px screens. */}
        <View className="mt-4 flex-row rounded-xl bg-gray-light p-1">
          {TABS.map((item) => {
            const selected = tab === item.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                className="flex-1 items-center rounded-lg py-2"
                style={{ backgroundColor: selected ? '#fff' : 'transparent' }}
                onPress={() => setTab(item.id)}
              >
                <Text className={`text-[13.5px] ${selected ? 'font-semibold text-ink' : 'font-medium text-text-secondary'}`}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {loading ? (
          <ActivityIndicator className="mt-8" color="#16A34A" />
        ) : error ? (
          <View className="mt-8 items-center">
            <Text className="text-center text-text-secondary">{error}</Text>
            <View className="mt-4 min-w-[160px]">
              <Button title={t('tryAgain')} variant="outline" onPress={load} />
            </View>
          </View>
        ) : section.data.length === 0 ? (
          <View className="mt-14 items-center">
            <View className="h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(22,163,74,0.08)' }}>
              <Ionicons name={section.icon} size={30} color="#16A34A" />
            </View>
            <Text className="mt-4 text-base font-semibold text-ink">{t(section.title)}</Text>
            <Text className="mt-1 px-8 text-center text-sm text-text-secondary">{t(section.hint)}</Text>
          </View>
        ) : (
          <FlatList
            className="mt-4"
            data={section.data}
            keyExtractor={(r) => r.id}
            renderItem={({ item }) => <RideCard ride={item} />}
          />
        )}
      </View>
    </SafeAreaViewPlaceholder>
  );
}

function statusChipStyle(status: Ride['status']) {
  // Status communicated by color AND text (never color alone —
  // accessibility rule), with cancelled/completed getting neutral/positive
  // treatments and everything else rendering as an active-state chip.
  const isCancelled = status === 'cancelled';
  const isCompleted = status === 'completed';
  if (isCancelled) {
    return { bg: 'rgba(220,38,38,0.08)', text: '#DC2626' };
  }
  if (isCompleted) {
    return { bg: 'rgba(22,163,74,0.10)', text: '#15803D' };
  }
  return { bg: 'rgba(217,119,6,0.10)', text: '#D97706' };
}

function RideCard({ ride }: { ride: Ride }) {
  const { t } = useTranslation();
  const chip = statusChipStyle(ride.status);
  const date = new Date(ride.completedAt ?? ride.createdAt ?? Date.now());
  const dateText = `${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <Pressable
      className="mb-3 rounded-2xl border border-border bg-white p-4"
      onPress={() => router.push({ pathname: '/(main)/(tabs)/activity/[rideId]', params: { rideId: ride.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${t(rideStatusKey(ride.status))} · ${ride.destination.address}`}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-medium text-text-secondary">{dateText}</Text>
        <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: chip.bg }}>
          <Text className="text-[11px] font-semibold" style={{ color: chip.text }}>
            {t(rideStatusKey(ride.status))}
          </Text>
        </View>
      </View>

      {/* Route line: pickup dot above, red dot below — the two-stop pattern
          riders recognize from every ride-hailing app. */}
      <View className="mt-3">
        <View className="flex-row items-center">
          <View className="h-2 w-2 rounded-full bg-primary" />
          <Text numberOfLines={1} className="ml-2.5 flex-1 text-[13px] text-text-secondary">
            {ride.pickup.address}
          </Text>
        </View>
        <View className="ml-[3px] h-3 w-px" style={{ backgroundColor: '#E5E7EB', width: 1, height: 10 }} />
        <View className="flex-row items-center">
          <View className="h-2 w-2 rounded-full" style={{ backgroundColor: '#DC2626' }} />
          <Text numberOfLines={1} className="ml-2.5 flex-1 text-[15px] font-semibold text-ink">
            {ride.destination.address}
          </Text>
        </View>
      </View>

      <View className="mt-3 flex-row items-center justify-between border-t border-border pt-3">
        <Text className="text-xs text-text-secondary">
          {t(ride.rideType === 'shared' ? 'shareRide' : 'privateRide')}
        </Text>
        <Text className="font-semibold text-primary">
          {formatFare(ride.finalFare ?? ride.estimatedFare)}
        </Text>
      </View>
    </Pressable>
  );
}
