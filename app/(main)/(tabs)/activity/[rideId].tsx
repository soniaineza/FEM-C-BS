import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../../components/SafeAreaViewPlaceholder';
import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '../../../../components/Button';
import { BackHeader } from '../../../../components/BackHeader';
import { useTranslation } from '../../../../hooks/useTranslation';
import { getRideDetails } from '../../../../services/ride-service';
import { Ride, formatFare, rideStatusKey } from '../../../../types/ride';
import { ApiError } from '../../../../services/api-client';

// Ride details — network failures land on an explicit error card with a
// retry button instead of an infinite spinner (cold-start requests used to
// sit here forever, or worse, crash with an unhandled rejection).
export default function RideDetailsScreen() {
  const { t } = useTranslation();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [ride, setRide] = useState<Ride | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(() => {
    if (!rideId) return;
    setLoading(true);
    setError(undefined);
    getRideDetails(rideId)
      .then(setRide)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('requestFailed')))
      .finally(() => setLoading(false));
  }, [rideId, t]);

  useEffect(load, [load]);

  if (loading && !ride) {
    return (
      <SafeAreaViewPlaceholder className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#16A34A" />
      </SafeAreaViewPlaceholder>
    );
  }

  if (error && !ride) {
    return (
      <SafeAreaViewPlaceholder className="flex-1 bg-white">
        <View className="flex-1 px-6 pt-2">
          <BackHeader />
          <View className="mt-10 items-center">
            <Text className="text-center text-text-secondary">{error}</Text>
            <View className="mt-4 min-w-[160px]">
              <Button title={t('tryAgain')} variant="outline" onPress={load} />
            </View>
          </View>
        </View>
      </SafeAreaViewPlaceholder>
    );
  }

  if (!ride) return null;

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-white">
      <ScrollView contentContainerClassName="px-6 pt-2 pb-10">
        <BackHeader />
        <Text className="mt-2 text-xl font-bold text-ink">{t('rideDetails')}</Text>

        <View className="mt-4 gap-2 rounded border border-border p-4">
          <Text className="text-ink">{ride.pickup.address}</Text>
          <Text className="text-ink">{ride.destination.address}</Text>
          <View className="mt-2 flex-row justify-between">
            <Text className="text-text-secondary">{ride.distanceKm.toFixed(1)} km</Text>
            <Text className="text-text-secondary">
              {ride.durationMinutes} {t('minutesShort')}
            </Text>
          </View>
          <View className="mt-2 flex-row justify-between">
            <Text className="text-base font-semibold text-ink">{t('finalFare')}</Text>
            <Text className="text-lg font-bold text-primary">{formatFare(ride.finalFare ?? ride.estimatedFare)}</Text>
          </View>
          <Text className="mt-1 text-xs text-text-secondary">{t(rideStatusKey(ride.status))}</Text>
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
    </SafeAreaViewPlaceholder>
  );
}
