import { useEffect } from 'react';
import { View, Text, SafeAreaView, Pressable, Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '../../../components/Button';
import { RideMap } from '../../../components/RideMap';
import { useTranslation } from '../../../hooks/useTranslation';
import { useRideTracking } from '../../../hooks/useRideTracking';
import { cancelRide } from '../../../services/ride-service';
import { MapDefaults } from '../../../services/location-service';

export default function DriverAcceptedScreen() {
  const { t } = useTranslation();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { ride, driverLocation } = useRideTracking(rideId ?? null);

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
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <Text className="text-text-secondary">{t('waitingDriver')}</Text>
      </SafeAreaView>
    );
  }

  const center = driverLocation ?? { latitude: ride.pickup.latitude ?? MapDefaults.latitude, longitude: ride.pickup.longitude ?? MapDefaults.longitude };
  const markers = [
    { id: 'pickup', position: { latitude: ride.pickup.latitude!, longitude: ride.pickup.longitude! }, icon: 'pickup' as const },
    ...(driverLocation ? [{ id: 'driver', position: { latitude: driverLocation.latitude, longitude: driverLocation.longitude }, icon: 'driver' as const }] : []),
  ];

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="h-64 w-full">
        <RideMap center={center} markers={markers} />
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
    </SafeAreaView>
  );
}
