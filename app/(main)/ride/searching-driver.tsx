import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '../../../components/Button';
import { useTranslation } from '../../../hooks/useTranslation';
import { useRideTracking } from '../../../hooks/useRideTracking';
import { usePassengerLocationReporting } from '../../../hooks/usePassengerLocationReporting';
import { cancelRide } from '../../../services/ride-service';

// The backend auto-cancels rides stuck in searchingDriver after
// RIDE_SEARCH_TIMEOUT_SECONDS (default 5 min, see server/src/services/
// scheduler.js's sweepExpiredSearches). This screen mirrors that server
// deadline with a client-side countdown so the user is never surprised:
// at T-60s it warns the search is taking long, and if the ride flips to
// cancelled with cancelledBy 'system' it explains why instead of silently
// bouncing home (the old behavior, reported as confusing).
const SEARCH_TIMEOUT_SECONDS = 5 * 60;
const SLOW_SEARCH_WARNING_AT_SECONDS = SEARCH_TIMEOUT_SECONDS - 60;

export default function SearchingDriverScreen() {
  const { t } = useTranslation();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { ride } = useRideTracking(rideId ?? null);
  const [elapsed, setElapsed] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  usePassengerLocationReporting(!!ride);

  // Client-side mirror of the server's search deadline. Started on mount;
  // the tracking hook picks up the server's own auto-cancel if it fires
  // first (e.g. the app was backgrounded and the server moved on without
  // us) — both paths land in the same explanation state below.
  useEffect(() => {
    const started = Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (ride && ride.status !== 'searchingDriver' && ride.status !== 'scheduled') {
      if (ride.status === 'cancelled') {
        // Keep this screen mounted for the timed-out explanation; only an
        // explicit passenger cancellation (or any other cancelled-by) still
        // returns straight home.
        if (ride.cancelledBy !== 'system') {
          router.replace('/(main)/(tabs)');
        }
        return;
      }
      router.replace({ pathname: '/(main)/ride/driver-accepted', params: { rideId: ride.id } });
    }
  }, [ride]);

  async function handleCancel() {
    if (!rideId || cancelling) return;
    setCancelling(true);
    try {
      await cancelRide(rideId);
    } finally {
      setCancelling(false);
      router.replace('/(main)/(tabs)');
    }
  }

  const timedOut = ride?.status === 'cancelled' && ride.cancelledBy === 'system';

  if (timedOut) {
    return (
      <SafeAreaViewPlaceholder className="flex-1 items-center justify-center bg-white px-6">
        <View
          className="h-20 w-20 items-center justify-center rounded-full"
          style={{ backgroundColor: 'rgba(22,163,74,0.12)' }}
        >
          <Ionicons name="car-outline" size={36} color="#16A34A" />
        </View>
        <Text className="mt-5 text-xl font-bold text-ink">{t('searchTimedOutTitle')}</Text>
        <Text className="mt-2 text-center leading-relaxed text-text-secondary">{t('searchTimedOutBody')}</Text>
        <View className="mt-8 w-full">
          <Button title={t('backHome')} onPress={() => router.replace('/(main)/(tabs)')} />
        </View>
      </SafeAreaViewPlaceholder>
    );
  }

  const searchSlow = elapsed >= SLOW_SEARCH_WARNING_AT_SECONDS;
  const secondsLeft = Math.max(SEARCH_TIMEOUT_SECONDS - elapsed, 0);
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-white">
      <Pressable className="px-5 pt-2" onPress={() => router.replace('/(main)/(tabs)')}>
        <Ionicons name="chevron-back" size={26} color="#111111" />
      </Pressable>

      <View className="flex-1 items-center justify-center px-6">
        <ActivityIndicator size="large" color="#16A34A" />
        <Text className="mt-6 text-xl font-bold text-ink">{t('findingDriver')}</Text>
        <Text className="mt-2 text-center leading-relaxed text-text-secondary">{t('matchingDriver')}</Text>

        {searchSlow ? (
          <View
            className="mt-6 w-full rounded-xl border border-border bg-bg-light px-4 py-3"
            accessibilityRole="text"
          >
            <Text className="text-center text-sm text-text-secondary">
              {t('searchTimedOutCountdown', { minutes: `${minutes}:${String(seconds).padStart(2, '0')}` })}
            </Text>
          </View>
        ) : null}
      </View>

      <View className="px-6 pb-8">
        <Button title={t('cancelRide')} variant="outline" onPress={handleCancel} loading={cancelling} />
      </View>
    </SafeAreaViewPlaceholder>
  );
}
