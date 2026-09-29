import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../../components/SafeAreaViewPlaceholder';
import { useLocalSearchParams } from 'expo-router';

import { Button } from '../../../../components/Button';
import { Card } from '../../../../components/Card';
import { BackHeader } from '../../../../components/BackHeader';
import { ScreenHeader } from '../../../../components/ui/ScreenHeader';
import { useTranslation } from '../../../../hooks/useTranslation';
import { useResponsive } from '../../../../hooks/useResponsive';
import { getDriverRideDetails } from '../../../../services/driver-service';
import { Ride, formatFare, rideStatusKey } from '../../../../types/ride';
import { Colors } from '../../../../constants/theme';
import { LoadingState } from '../../../../components/ui';

export default function DriverTripDetailScreen() {
  const { t } = useTranslation();
  const { contentStyle } = useResponsive();
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
      <SafeAreaViewPlaceholder className="flex-1 bg-surface" edges={['top', 'left', 'right']}>
        <View className="flex-1 px-5 pt-2">
          <BackHeader />
          {!error ? (
            <LoadingState />
          ) : (
            <View className="mt-10 items-center">
              <Text className="text-center text-fg-muted">{error}</Text>
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
    <SafeAreaViewPlaceholder className="flex-1 bg-surface" edges={['top', 'left', 'right']}>
      <ScrollView contentContainerClassName="pt-2 pb-10">
        <View style={contentStyle} className="px-5">
        <ScreenHeader back title={t('rideDetails')} />

        <Card className="mt-4 gap-2">
          <Text className="text-fg">{ride.pickup.address}</Text>
          <Text className="text-fg">{ride.destination.address}</Text>
          <View className="mt-2 flex-row justify-between">
            <Text className="text-fg-muted">{ride.distanceKm.toFixed(1)} km</Text>
            <Text className="text-fg-muted">{ride.durationMinutes} {t('minutesShort')}</Text>
          </View>
          <View className="mt-2 flex-row justify-between">
            <Text className="text-body font-semibold text-fg">{t('fare')}</Text>
            <Text className="text-title-3 font-bold text-primary-text">{formatFare(ride.finalFare ?? ride.estimatedFare)}</Text>
          </View>
          <Text className="mt-1 text-caption text-fg-muted">{t(rideStatusKey(ride.status))}</Text>
        </Card>

        {ride.rider ? (
          <Card className="mt-4">
            <Text className="text-body font-semibold text-fg">{ride.rider.name}</Text>
          </Card>
        ) : null}

        {ride.rating != null ? (
          <Card className="mt-4">
            <Text className="text-subhead font-semibold text-fg">{t('driverRiderRating')}</Text>
            <Text className="mt-1 text-title-3 font-bold text-primary-text">{ride.rating} / 5</Text>
          </Card>
        ) : null}
      </View>
      </ScrollView>
    </SafeAreaViewPlaceholder>
  );
}
