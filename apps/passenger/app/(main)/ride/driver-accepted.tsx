import { useEffect } from 'react';
import { View, Text, Pressable, Linking, ActivityIndicator, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Button } from '@kimu/shared/components/Button';
import { LiveMap } from '@kimu/shared/components/map/LiveMap';
import { MapSheet } from '../../../components/map/MapSheet';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { useRideTracking } from '../../../hooks/useRideTracking';
import { usePassengerLocationReporting } from '../../../hooks/usePassengerLocationReporting';
import { useTripMap } from '../../../hooks/useTripMap';
import { cancelRide } from '../../../services/ride-service';

const PADDING = { top: 90, bottom: 380, left: 50, right: 50 };

export default function DriverAcceptedScreen() {
  const { t } = useTranslation();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { ride, driverLocation, serverTimeOffsetMs } = useRideTracking(rideId ?? null);
  usePassengerLocationReporting(!!ride);
  const { scene, etaMinutes } = useTripMap(ride, driverLocation, serverTimeOffsetMs, PADDING);
  // Map rendered in-screen so the rider can pan/zoom to see the driver coming.

  useEffect(() => {
    if (ride && (ride.status === 'pinVerified' || ride.status === 'inProgress' || ride.status === 'arrived' || ride.status === 'paymentPending')) {
      router.replace({ pathname: '/(main)/ride/tracking', params: { rideId: ride.id } });
    }
    // The trip is over: there is nothing to come back to on this screen.
    if (ride && (ride.status === 'cancelled' || ride.status === 'completed')) {
      router.replace('/(main)/(tabs)');
    }
  }, [ride]);

  if (!ride || !ride.driver) {
    return (
      <MapSheet collapsible={false}>
        <View className="flex-row items-center py-4">
          <ActivityIndicator color="#0E7C4A" />
          <Text className="font-sans ml-3 text-text-secondary">{t('waitingDriver')}</Text>
        </View>
      </MapSheet>
    );
  }

  const driver = ride.driver;
  const arrived = ride.status === 'driverArrived';
  const initials = driver.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const vehicleSummary = [driver.vehicleColor, driver.vehicleModel].filter(Boolean).join(' ');

  return (
    <View style={{ flex: 1 }}>
      <View style={StyleSheet.absoluteFill}>
        {scene && scene.camera ? (
          <LiveMap scene={{ ...scene, camera: scene.camera, interactive: true }} loadingLabel={t('mapLoading')} errorLabel={t('mapError')} retryLabel={t('tryAgain')} />
        ) : null}
      </View>
      <MapSheet
        header={
          <View className="mb-3">
            <Text className="text-xl font-bold text-ink">
              {arrived ? t('driverHere') : etaMinutes != null ? t('driverArrivingIn', { minutes: etaMinutes }) : t('driverOnWay')}
            </Text>
            <Text className="font-sans mt-0.5 text-[13px] text-text-secondary" numberOfLines={1}>{ride.pickup.address}</Text>
          </View>
        }
        footer={
          <View className="gap-2">
            <Button title={t('safety')} variant="outline" icon="shield-checkmark-outline" onPress={() => router.push({ pathname: '/(main)/ride/safety', params: { rideId: ride.id } })} />
            {ride.status === 'driverAssigned' ? (
              <Button title={t('cancelRide')} variant="text" onPress={async () => { await cancelRide(ride.id); router.replace('/(main)/(tabs)'); }} />
            ) : null}
          </View>
        }
      >
        {!driverLocation ? <Text className="font-sans mb-3 text-sm text-error">{t('driverLocationUnavailable')}</Text> : null}
        <View className="flex-row items-center rounded-2xl border border-border p-3.5">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-ink">
            <Text className="text-base font-bold text-white">{initials}</Text>
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-base font-bold text-ink">{driver.name}</Text>
            <View className="mt-0.5 flex-row items-center">
              <Ionicons name="star" size={13} color="#111" />
              <Text className="font-sans ml-1 text-[13px] text-text-secondary">
                {driver.rating > 0 ? driver.rating.toFixed(1) : t('driverNoRatingYet')}
                {vehicleSummary ? ` · ${vehicleSummary}` : ''}
              </Text>
            </View>
          </View>
          {driver.licensePlate ? (
            <View className="rounded-lg border-2 border-ink bg-white px-2.5 py-1">
              <Text className="text-[13px] font-bold tracking-wider text-ink">{driver.licensePlate}</Text>
            </View>
          ) : null}
        </View>

        <View className="mt-3 flex-row gap-3">
          <Pressable
            accessibilityRole="button"
            className="flex-1 flex-row items-center justify-center rounded-xl bg-gray-light py-3"
            onPress={() => Linking.openURL(`tel:${driver.phone}`)}
          >
            <Ionicons name="call" size={18} color="#111" />
            <Text className="ml-2 font-semibold text-ink">{t('call')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            className="flex-1 flex-row items-center justify-center rounded-xl bg-gray-light py-3"
            onPress={() => Linking.openURL(`sms:${driver.phone}`)}
          >
            <Ionicons name="chatbubble" size={18} color="#111" />
            <Text className="ml-2 font-semibold text-ink">{t('message')}</Text>
          </Pressable>
        </View>

        {arrived ? (
          <View className="mt-3">
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/(main)/ride/pair', params: { rideId: ride.id } })}
              className="h-button w-full flex-row items-center justify-center rounded bg-primary active:opacity-90"
              style={{ shadowColor: '#0E7C4A', shadowOpacity: 0.26, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 4 }}
            >
              <Ionicons name="qr-code-outline" size={20} color="#fff" />
              <Text className="ml-2.5 text-base font-semibold text-white">{t('pairRideButton')}</Text>
            </Pressable>
            <Text className="font-sans mt-2 text-center text-xs text-text-secondary">{t('pairRideCardHint')}</Text>
          </View>
        ) : null}
      </MapSheet>
    </View>
  );
}
