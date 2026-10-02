import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';
import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '../../../components/Button';
import { useTranslation } from '../../../hooks/useTranslation';
import { getRideDetails } from '../../../services/ride-service';
import { Ride, formatFare } from '../../../types/ride';

export default function CompletedScreen() {
  const { t } = useTranslation();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [ride, setRide] = useState<Ride | null>(null);
  const [error, setError] = useState<string | undefined>();

  function load() {
    if (!rideId) { setError(t('requestFailed')); return; }
    setError(undefined);
    getRideDetails(rideId).then(setRide).catch(() => setError(t('requestFailed')));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideId]);

  if (!ride) {
    return (
      <SafeAreaViewPlaceholder className="flex-1 items-center justify-center bg-white px-6">
        {error ? (
          <View className="w-full gap-4">
            <Text className="text-center text-error">{error}</Text>
            <Button title={t('tryAgain')} variant="outline" onPress={load} />
            <Button title={t('backHome')} variant="text" onPress={() => router.replace('/(main)/(tabs)')} />
          </View>
        ) : <ActivityIndicator color="#0E7C4A" />}
      </SafeAreaViewPlaceholder>
    );
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-white">
      <View className="flex-1 px-6 pt-10">
        <Text className="text-2xl text-primary font-display">{t('tripCompleted')}</Text>

        <View className="mt-6 rounded border border-border p-4">
          <Text className="text-ink">{ride.pickup.address}</Text>
          <Text className="mt-1 text-ink">{ride.destination.address}</Text>
          <View className="mt-3 flex-row justify-between">
            <Text className="text-text-secondary">{ride.distanceKm.toFixed(1)} km</Text>
            <Text className="text-text-secondary">{ride.durationMinutes} min</Text>
          </View>
          <View className="mt-3 flex-row justify-between">
            <Text className="text-base font-semibold text-ink">{t('finalFare')}</Text>
            <Text className="text-lg font-bold text-primary">{formatFare(ride.finalFare ?? ride.estimatedFare)}</Text>
          </View>
        </View>

        {ride.rating == null ? (
          <View className="mt-6">
            <Button title={t('rating')} onPress={() => router.push({ pathname: '/(main)/ride/rating', params: { rideId: ride.id } })} />
          </View>
        ) : null}

        <View className="mt-auto pb-8">
          <Button title={t('backHome')} variant="outline" onPress={() => router.replace('/(main)/(tabs)')} />
        </View>
      </View>
    </SafeAreaViewPlaceholder>
  );
}
