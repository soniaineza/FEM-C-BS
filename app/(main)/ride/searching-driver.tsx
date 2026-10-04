import { useEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { useTranslation } from '../../../hooks/useTranslation';
import { useRideTracking } from '../../../hooks/useRideTracking';
import { usePassengerLocationReporting } from '../../../hooks/usePassengerLocationReporting';
import { cancelRide, fetchVehicles } from '../../../services/ride-service';
import { MapSheet } from '../../../components/map/MapSheet';
import { MapGestureLayer } from '../../../components/map/MapGestureLayer';
import { goHome } from '../../../utils/navigation';
import { useMapScene } from '../../../hooks/useMapScene';
import { useNearbyCars } from '../../../hooks/useNearbyCars';
import { distanceM } from '../../../components/map/trackInterpolation';
import type { MapScene } from '../../../components/map/map-types';
import { Colors, Elevation } from '../../../constants/theme';

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
  // Vehicle catalogue for naming the nearby cars below (id -> display
  // name). Best-effort: without it each row still shows its distance.
  const [vehicleNames, setVehicleNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    fetchVehicles()
      .then((list) => setVehicleNames(new Map(list.map((v) => [v.id, v.name]))))
      .catch(() => {});
  }, []);  const scene = useMemo<MapScene | null>(
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
          goHome();
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
    } catch {
      // Still searching if the cancel did not go through: Home shows the ride
      // in its banner, from where it can be cancelled again.
    } finally {
      setCancelling(false);
      goHome();
    }
  }

  const timedOut = ride?.status === 'cancelled' && ride.cancelledBy === 'system';

  if (timedOut) {
    return (
      <SafeAreaViewPlaceholder className="flex-1 items-center justify-center bg-surface px-5">
        <View
          className="h-20 w-20 items-center justify-center rounded-full"
          style={{ backgroundColor: Colors['primary-tint'] }}
        >
          <Ionicons name="car-outline" size={36} color={Colors.primary} />
        </View>
        <Text className="mt-5 text-title-2 text-fg font-display">{t('searchTimedOutTitle')}</Text>
        <Text className="mt-2 text-center leading-relaxed text-fg-muted">{t('searchTimedOutBody')}</Text>
        <View className="mt-8 w-full">
          <Button title={t('backHome')} onPress={goHome} />
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
      <MapGestureLayer />
      {/* Back bails out of the search: the ride is cancelled first so no
          driver is dispatched to a passenger who already left. */}
      <SafeAreaView edges={['top']} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('back')}
          onPress={handleCancel}
          className="ml-4 mt-2 h-11 w-11 items-center justify-center rounded-full bg-surface"
          style={Elevation[3]}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.fg} />
        </Pressable>
      </SafeAreaView>
      <MapSheet
        collapsible={false}
        header={
          <View className="mb-1 flex-row items-center">
            <ActivityIndicator color={Colors.primary} />
            <Text className="ml-3 text-title-3 font-bold text-fg">{t('findingDriver')}</Text>
          </View>
        }
        footer={<Button title={t('cancelRide')} variant="outline" onPress={handleCancel} loading={cancelling} />}
      >
        <Text className="leading-relaxed text-fg-muted">{t('matchingDriver')}</Text>
        {cars.length ? (
          <Text className="mt-1 text-caption font-semibold text-primary-text">
            {cars.length === 1 ? t('oneDriverNearby') : t('multipleDriversNearby', { count: cars.length })}
          </Text>
        ) : null}
        {cars.length && pickupPoint ? (
          <View className="mt-3">
            <Text className="text-subhead font-bold text-fg">{t('availableCarsNearby')}</Text>
            <View className="mt-2 gap-2">
              {cars.slice(0, 8).map((car) => {
                const km = distanceM(pickupPoint.latitude, pickupPoint.longitude, car.latitude, car.longitude) / 1000;
                const label = vehicleNames.get(car.vehicleClass ?? '') ?? car.vehicleClass ?? t('nearbyCar');
                return (
                  <Card key={car.id} padded={false} className="flex-row items-center px-3 py-2.5">
                    <View className="h-9 w-11 items-center justify-center rounded-xl bg-surface-muted">
                      <Ionicons name="car" size={20} color={Colors.fg} />
                    </View>
                    <Text className="ml-3 flex-1 text-subhead font-semibold text-fg" numberOfLines={1}>
                      {label}
                    </Text>
                    <Text className="ml-2 text-caption text-fg-muted">
                      {t('kmAway', { distance: km.toFixed(1) })}
                    </Text>
                  </Card>
                );
              })}
            </View>
          </View>
        ) : null}
        {searchSlow ? (
          <View className="mt-3 w-full rounded-xl border border-border bg-canvas px-4 py-3" accessibilityRole="text">
            <Text className="text-center text-subhead text-fg-muted">
              {t('searchTimedOutCountdown', { minutes: `${minutes}:${String(seconds).padStart(2, '0')}` })}
            </Text>
          </View>
        ) : null}
      </MapSheet>
    </View>
  );
}
