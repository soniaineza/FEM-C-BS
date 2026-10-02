import { useEffect } from 'react';
import { View, Text, Pressable, Linking, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '../../../components/Button';
import { MapSheet } from '../../../components/map/MapSheet';
import { useTranslation } from '../../../hooks/useTranslation';
import { useRideTracking } from '../../../hooks/useRideTracking';
import { usePassengerLocationReporting } from '../../../hooks/usePassengerLocationReporting';
import { useMapScene } from '../../../hooks/useMapScene';
import { useTripMap } from '../../../hooks/useTripMap';
import { cancelRide } from '../../../services/ride-service';

const PADDING = { top: 90, bottom: 380, left: 50, right: 50 };

export default function DriverAcceptedScreen() {
  const { t } = useTranslation();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { ride, driverLocation, serverTimeOffsetMs } = useRideTracking(rideId ?? null);
  usePassengerLocationReporting(!!ride);
  const { scene, etaMinutes } = useTripMap(ride, driverLocation, serverTimeOffsetMs, PADDING);
  useMapScene(scene);

  useEffect(() => {
    if (ride && (ride.status === 'pinVerified' || ride.status === 'inProgress' || ride.status === 'arrived' || ride.status === 'paymentPending')) {
      router.replace({ pathname: '/(main)/ride/tracking', params: { rideId: ride.id } });
    }
    if (ride && ride.status === 'cancelled') {
      router.replace('/(main)/(tabs)');
    }
  }, [ride]);

  if (!ride || !ride.driver) {
    return (
      <MapSheet collapsible={false}>
        <View className="flex-row items-center py-4">
          <ActivityIndicator color="#0E7C4A" />
          <Text className="ml-3 text-text-secondary">{t('waitingDriver')}</Text>
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
      <MapSheet
        header={
          <View className="mb-3">
            <Text className="text-xl font-bold text-ink">
              {arrived ? t('driverHere') : etaMinutes != null ? t('driverArrivingIn', { minutes: etaMinutes }) : t('driverOnWay')}
            </Text>
            <Text className="mt-0.5 text-[13px] text-text-secondary" numberOfLines={1}>{ride.pickup.address}</Text>
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
        {!driverLocation ? <Text className="mb-3 text-sm text-error">{t('driverLocationUnavailable')}</Text> : null}
        <View className="flex-row items-center rounded-2xl border border-border p-3.5">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-ink">
            <Text className="text-base font-bold text-white">{initials}</Text>
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-base font-bold text-ink">{driver.name}</Text>
            <View className="mt-0.5 flex-row items-center">
              <Ionicons name="star" size={13} color="#111" />
              <Text className="ml-1 text-[13px] text-text-secondary">
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

        {ride.pin ? (
          <View className="mt-3 flex-row items-center justify-between rounded-2xl bg-primary/10 px-4 py-3">
            <View className="flex-1 pr-3">
              <Text className="text-[13px] font-semibold text-ink">{t('shareYourPin')}</Text>
              <Text className="mt-0.5 text-xs text-text-secondary">{t('pinHint')}</Text>
            </View>
            <Text className="text-2xl font-bold tracking-[6px] text-ink">{ride.pin}</Text>
          </View>
        ) : null}
      </MapSheet>
    </View>
  );
}
