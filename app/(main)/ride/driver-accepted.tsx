import { useEffect, useState } from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';
import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '../../../components/Button';
import { RideMap } from '../../../components/RideMap';
import { useTranslation } from '../../../hooks/useTranslation';
import { useRideTracking } from '../../../hooks/useRideTracking';
import { usePassengerLocationReporting } from '../../../hooks/usePassengerLocationReporting';
import { cancelRide } from '../../../services/ride-service';
import { MapDefaults, getRoute } from '../../../services/location-service';
import { RoutePoint } from '../../../types/ride';

export default function DriverAcceptedScreen() {
  const { t } = useTranslation();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { ride, driverLocation } = useRideTracking(rideId ?? null);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  usePassengerLocationReporting(!!ride);

  useEffect(() => {
    if (!ride) return;
    getRoute({ from: ride.pickup, to: ride.destination }).then((route) => {
      setRoutePoints(route?.points ?? []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride?.id]);

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
      <SafeAreaViewPlaceholder className="flex-1 items-center justify-center bg-white">
        <Text className="text-text-secondary">{t('waitingDriver')}</Text>
      </SafeAreaViewPlaceholder>
    );
  }

  const center = driverLocation ?? { latitude: ride.pickup.latitude ?? MapDefaults.latitude, longitude: ride.pickup.longitude ?? MapDefaults.longitude };
  const markers = [
    { id: 'pickup', position: { latitude: ride.pickup.latitude!, longitude: ride.pickup.longitude! }, icon: 'pickup' as const },
    { id: 'dest', position: { latitude: ride.destination.latitude!, longitude: ride.destination.longitude! }, icon: 'destination' as const },
    ...(driverLocation ? [{ id: 'driver', position: { latitude: driverLocation.latitude, longitude: driverLocation.longitude }, icon: 'driver' as const }] : []),
  ];

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-white">
      <View className="h-52 w-full">
        <RideMap
          center={center}
          markers={markers}
          routePolyline={routePoints}
          retryLabel={t('tryAgain')}
          loadingLabel={t('mapLoading')}
          errorLabel={t('mapError')}
        />
      </View>
      <View className="flex-1 px-6 pt-6">
        <Text className="text-lg font-bold text-primary">{t('driverOnWay')}</Text>

        <View className="mt-4 rounded border border-border p-4">
          <Text className="text-base font-semibold text-ink">{ride.driver.name}</Text>
          <Text className="mt-1 text-sm text-text-secondary">
            {ride.driver.vehicleColor} {ride.driver.vehicleModel} - {ride.driver.licensePlate}
          </Text>
          <Text className="mt-1 text-sm text-text-secondary">
            {t('avgRating')}: {ride.driver.rating.toFixed(1)}
          </Text>

          <View className="mt-3 flex-row gap-3">
            <Pressable
              className="flex-1 items-center rounded border border-primary py-2"
              onPress={() => Linking.openURL(`tel:${ride.driver!.phone}`)}
            >
              <Text className="font-medium text-primary">{t('call')}</Text>
            </Pressable>
            <Pressable
              className="flex-1 items-center rounded border border-primary py-2"
              onPress={() => Linking.openURL(`sms:${ride.driver!.phone}`)}
            >
              <Text className="font-medium text-primary">{t('message')}</Text>
            </Pressable>
          </View>
        </View>

        {ride.pin ? (
          <View className="mt-4 items-center rounded bg-gray-light p-4">
            <Text className="text-sm text-text-secondary">{t('showPinToDriver')}</Text>
            <Text className="mt-1 text-3xl font-bold tracking-widest text-ink">{ride.pin}</Text>
            <Text className="mt-1 text-xs text-text-secondary">{t('pinHint')}</Text>
          </View>
        ) : null}

        <View className="mt-auto gap-3 pb-8">
          <Button title={t('safety')} variant="outline" onPress={() => router.push({ pathname: '/(main)/ride/safety', params: { rideId: ride.id } })} />
          {ride.status === 'driverAssigned' ? (
            <Button title={t('cancelRide')} variant="text" onPress={async () => { await cancelRide(ride.id); router.replace('/(main)/(tabs)'); }} />
          ) : null}
        </View>
      </View>
    </SafeAreaViewPlaceholder>
  );
}
