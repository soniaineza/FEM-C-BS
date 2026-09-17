import { useEffect, useState } from 'react';
import { View, Text, SafeAreaView, ScrollView, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '../../../../components/Button';
import { useTranslation } from '../../../../hooks/useTranslation';
import { getRideDetails } from '../../../../services/ride-service';
import { Ride, formatFare } from '../../../../types/ride';

export default function RideDetailsScreen() {
  const { t } = useTranslation();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [ride, setRide] = useState<Ride | null>(null);

  useEffect(() => {
    if (rideId) getRideDetails(rideId).then(setRide);
  }, [rideId]);

  if (!ride) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#16A34A" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerClassName="px-6 pt-6 pb-10">
        <Text className="text-xl font-bold text-ink">{t('rideDetails')}</Text>

        <View className="mt-4 gap-2 rounded border border-border p-4">
          <Text className="text-ink">{ride.pickup.address}</Text>
          <Text className="text-ink">{ride.destination.address}</Text>
          <View className="mt-2 flex-row justify-between">
            <Text className="text-text-secondary">{ride.distanceKm.toFixed(1)} km</Text>
            <Text className="text-text-secondary">{ride.durationMinutes} min</Text>
          </View>
          <View className="mt-2 flex-row justify-between">
            <Text className="text-base font-semibold text-ink">{t('finalFare')}</Text>
            <Text className="text-lg font-bold text-primary">{formatFare(ride.finalFare ?? ride.estimatedFare)}</Text>
          </View>
          <Text className="mt-1 text-xs text-text-secondary">{ride.status}</Text>
        </View>

        {ride.driver ? (
          <View className="mt-4 rounded border border-border p-4">
            <Text className="text-base font-semibold text-ink">{ride.driver.name}</Text>
            <Text className="mt-1 text-sm text-text-secondary">
              {ride.driver.vehicleColor} {ride.driver.vehicleModel} - {ride.driver.licensePlate}
            </Text>
          </View>
        ) : null}

        {ride.rating == null && ride.status === 'completed' ? (
          <View className="mt-4">
            <Button title={t('rating')} onPress={() => router.push({ pathname: '/(main)/ride/rating', params: { rideId: ride.id } })} />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
