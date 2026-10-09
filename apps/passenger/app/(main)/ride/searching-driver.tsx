import { useEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaViewPlaceholder } from '@kimu/shared/components/SafeAreaViewPlaceholder';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Button } from '@kimu/shared/components/Button';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { useRideTracking } from '../../../hooks/useRideTracking';
import { usePassengerLocationReporting } from '../../../hooks/usePassengerLocationReporting';
import { cancelRide } from '../../../services/ride-service';
import { MapSheet } from '../../../components/map/MapSheet';
import { useMapScene } from '../../../hooks/useMapScene';
import { useNearbyCars } from '../../../hooks/useNearbyCars';
import type { MapScene } from '@kimu/shared/components/map/map-types';

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

  const pickupPoint = ride?.pickup.latitude != null && ride?.pickup.longitude != null
    ? { latitude: ride.pickup.latitude, longitude: ride.pickup.longitude }
    : null;
  const { cars, serverTimeOffsetMs } = useNearbyCars(pickupPoint);
  const scene = useMemo<MapScene | null>(
    () =>
      pickupPoint
        ? {
            camera: { mode: 'center', center: pickupPoint, zoom: 15.2, pitch: 40, padding: { top: 40, bottom: 260, left: 0, right: 0 } },
            markers: [{ id: 'radar', kind: 'radar', ...pickupPoint }],
            cars,
            serverTimeOffsetMs,
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pickupPoint?.latitude, pickupPoint?.longitude, cars, serverTimeOffsetMs]
  );
  useMapScene(scene);

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
      // A ride that already finished belongs in Your Rides, not back in the
      // booking flow.
      if (ride.status === 'completed') {
        router.replace('/(main)/(tabs)');
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
          style={{ backgroundColor: 'rgba(14,124,74,0.12)' }}
        >
          <Ionicons name="car-outline" size={36} color="#0E7C4A" />
        </View>
        <Text className="mt-5 text-xl text-ink font-display">{t('searchTimedOutTitle')}</Text>
        <Text className="font-sans mt-2 text-center leading-relaxed text-text-secondary">{t('searchTimedOutBody')}</Text>
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
    <View style={{ flex: 1 }}>
      <MapSheet
        collapsible={false}
        header={
          <View className="mb-1 flex-row items-center">
            <ActivityIndicator color="#0E7C4A" />
            <Text className="ml-3 text-lg font-bold text-ink">{t('findingDriver')}</Text>
          </View>
        }
        footer={<Button title={t('cancelRide')} variant="outline" onPress={handleCancel} loading={cancelling} />}
      >
        <Text className="font-sans leading-relaxed text-text-secondary">{t('matchingDriver')}</Text>
        {cars.length ? (
          <Text className="mt-1 text-xs font-semibold text-primary">
            {cars.length === 1 ? t('oneDriverNearby') : t('multipleDriversNearby', { count: cars.length })}
          </Text>
        ) : null}
        {searchSlow ? (
          <View className="mt-3 w-full rounded-xl border border-border bg-bg-light px-4 py-3" accessibilityRole="text">
            <Text className="font-sans text-center text-sm text-text-secondary">
              {t('searchTimedOutCountdown', { minutes: `${minutes}:${String(seconds).padStart(2, '0')}` })}
            </Text>
          </View>
        ) : null}
      </MapSheet>
    </View>
  );
}
