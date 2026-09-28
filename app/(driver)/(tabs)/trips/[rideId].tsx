import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../../components/SafeAreaViewPlaceholder';
import { useLocalSearchParams } from 'expo-router';

import { Button } from '../../../../components/Button';
import { BackHeader } from '../../../../components/BackHeader';
import { useTranslation } from '../../../../hooks/useTranslation';
import { getDriverRideDetails } from '../../../../services/driver-service';
import { Ride, formatFare, rideStatusKey } from '../../../../types/ride';

export default function DriverTripDetailScreen() {
  const { t } = useTranslation();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [ride, setRide] = useState<Ride | null>(null);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(() => {
    if (!rideId) return;
    setError(undefined);
    getDriverRideDetails(rideId)
      .then(setRide)
      .catch((err) => setError(err instanceof Error ? err.message : t('requestFailed')));
  }, [rideId, t]);

  useEffect(load, [load]);

  if (!ride) {
    return (
      <SafeAreaViewPlaceholder className="flex-1 bg-white" edges={['top', 'left', 'right']}>
        <View className="flex-1 px-6 pt-2">
          <BackHeader />
          {!error ? (
            <ActivityIndicator className="mt-10" color="#16A34A" />
          ) : (
            <View className="mt-10 items-center">
              <Text className="text-center text-text-secondary">{error}</Text>
              <View className="mt-4 min-w-[160px]">
                <Button title={t('tryAgain')} variant="outline" onPress={load} />
              </View>
            </View>
          )}
        </View>
      </SafeAreaViewPlaceholder>
    );
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-white" edges={['top', 'left', 'right']}>
      <ScrollView contentContainerClassName="px-6 pt-2 pb-10">
        <BackHeader />
        <Text className="mt-2 text-xl font-bold text-ink">{t('rideDetails')}</Text>

        <View className="mt-4 gap-2 rounded-2xl border border-border p-4">
          <Text className="text-ink">{ride.pickup.address}</Text>
          <Text className="text-ink">{ride.destination.address}</Text>
          <View className="mt-2 flex-row justify-between">
            <Text className="text-text-secondary">{ride.distanceKm.toFixed(1)} km</Text>
            <Text className="text-text-secondary">{ride.durationMinutes} {t('minutesShort')}</Text>
          </View>
          <View className="mt-2 flex-row justify-between">
            <Text className="text-base font-semibold text-ink">{t('fare')}</Text>
            <Text className="text-lg font-bold text-primary">{formatFare(ride.finalFare ?? ride.estimatedFare)}</Text>
          </View>
          <Text className="mt-1 text-xs text-text-secondary">{t(rideStatusKey(ride.status))}</Text>
        </View>

        {ride.rider ? (
          <View className="mt-4 rounded-2xl border border-border p-4">
            <Text className="text-base font-semibold text-ink">{ride.rider.name}</Text>
          </View>
        ) : null}

        {ride.rating != null ? (
          <View className="mt-4 rounded-2xl border border-border p-4">
            <Text className="text-sm font-semibold text-ink">{t('driverRiderRating')}</Text>
            <Text className="mt-1 text-lg font-bold text-primary">{ride.rating} / 5</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaViewPlaceholder>
  );
}
