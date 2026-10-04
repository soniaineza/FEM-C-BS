import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { ErrorState, LoadingState, Screen, ScreenHeader, Text } from '../../../components/ui';
import { RouteTimeline } from '../../../components/TripRouteCard';
import { useTranslation } from '../../../hooks/useTranslation';
import { getCachedRide } from '../../../hooks/useRideTracking';
import { getRideDetails } from '../../../services/ride-service';
import { Ride, formatFare } from '../../../types/ride';
import { goHome } from '../../../utils/navigation';
import { Colors } from '../../../constants/theme';

export default function CompletedScreen() {
  const { t } = useTranslation();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [ride, setRide] = useState<Ride | null>(() => getCachedRide(rideId));
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
      <Screen background="surface">
        {error ? (
          <View className="flex-1 justify-center">
            <ErrorState message={error} retryLabel={t('tryAgain')} onRetry={load} />
            <Button title={t('backHome')} variant="ghost" onPress={goHome} />
          </View>
        ) : (
          <View className="flex-1 justify-center"><LoadingState /></View>
        )}
      </Screen>
    );
  }

  return (
    <Screen
      background="surface"
      header={<ScreenHeader back={goHome} />}
      footer={
        <>
          {ride.rating == null ? (
            <Button title={t('rating')} icon="star" onPress={() => router.push({ pathname: '/(main)/ride/rating', params: { rideId: ride.id } })} />
          ) : null}
          <Button title={t('backHome')} variant={ride.rating == null ? 'ghost' : 'primary'} onPress={goHome} />
        </>
      }
    >
      <View className="items-center pt-4">
        <View className="h-20 w-20 items-center justify-center rounded-full bg-primary-soft">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-primary">
            <Ionicons name="checkmark" size={32} color={Colors['primary-fg']} />
          </View>
        </View>
        <Text variant="title-1" align="center" style={{ marginTop: 16 }} accessibilityRole="header">{t('tripCompleted')}</Text>
        <Text variant="subhead" tone="muted" style={{ marginTop: 16 }}>{t('finalFare')}</Text>
        <Text variant="large-title" style={{ marginTop: 2 }}>{formatFare(ride.finalFare ?? ride.estimatedFare)}</Text>
      </View>

      <Card className="mt-8">
        <RouteTimeline pickup={ride.pickup.address} destination={ride.destination.address} />
        <View className="mt-4 flex-row gap-6 border-t border-divider pt-4">
          <Text variant="callout" weight="semibold">{ride.distanceKm.toFixed(1)} <Text variant="subhead" tone="muted">km</Text></Text>
          <Text variant="callout" weight="semibold">{ride.durationMinutes} <Text variant="subhead" tone="muted">min</Text></Text>
        </View>
      </Card>
    </Screen>
  );
}
