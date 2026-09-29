import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '../../../../components/Button';
import { Card } from '../../../../components/Card';
import { Avatar, ErrorState, LoadingState, Screen, ScreenHeader, Text } from '../../../../components/ui';
import { RouteTimeline } from '../../../../components/TripRouteCard';
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
      <Screen header={<ScreenHeader back title={t('rideDetails')} />}>
        <LoadingState />
      </Screen>
    );
  }

  if (error && !ride) {
    return (
      <Screen header={<ScreenHeader back title={t('rideDetails')} />}>
        <ErrorState message={error} retryLabel={t('tryAgain')} onRetry={load} />
      </Screen>
    );
  }

  if (!ride) return null;

  const liveHref = liveRideHref(ride);
  const canRate = ride.rating == null && ride.status === 'completed';
  return (
    <Screen
      header={<ScreenHeader back title={t('rideDetails')} />}
      footer={
        liveHref || canRate ? (
          <>
            {liveHref ? <Button title={t('trackLiveRide')} icon="navigate" onPress={() => router.replace(liveHref)} /> : null}
            {canRate ? (
              <Button
                title={t('rating')}
                icon="star-outline"
                variant={liveHref ? 'secondary' : 'primary'}
                onPress={() => router.push({ pathname: '/(main)/ride/rating', params: { rideId: ride.id } })}
              />
            ) : null}
          </>
        ) : undefined
      }
    >
      <Card tone="primary" className="mt-2">
        <View className="flex-row items-center justify-between">
          <Text variant="subhead" tone="inverse" style={{ opacity: 0.85 }}>{t('finalFare')}</Text>
          <View className="rounded-full bg-surface/20 px-2.5 py-1">
            <Text variant="caption" weight="semibold" tone="inverse">{t(rideStatusKey(ride.status))}</Text>
          </View>
        </View>
        <Text variant="large-title" tone="inverse" style={{ marginTop: 6 }}>
          {formatFare(ride.finalFare ?? ride.estimatedFare)}
        </Text>
        <View className="mt-3 flex-row gap-5">
          <Text variant="subhead" tone="inverse" style={{ opacity: 0.85 }}>{ride.distanceKm.toFixed(1)} km</Text>
          <Text variant="subhead" tone="inverse" style={{ opacity: 0.85 }}>
            {ride.durationMinutes} {t('minutesShort')}
          </Text>
        </View>
      </Card>

      <Card className="mt-4">
        <RouteTimeline pickup={ride.pickup.address} destination={ride.destination.address} />
      </Card>

      {ride.driver ? (
        <Card className="mt-4 flex-row items-center">
          <Avatar name={ride.driver.name} size={48} />
          <View className="ml-3.5 flex-1">
            <Text variant="headline">{ride.driver.name}</Text>
            <Text variant="subhead" tone="muted" style={{ marginTop: 2 }}>
              {ride.driver.vehicleColor} {ride.driver.vehicleModel}
            </Text>
          </View>
          <View className="rounded-lg border border-border-strong bg-surface-muted px-2.5 py-1">
            <Text variant="subhead" weight="bold">{ride.driver.licensePlate}</Text>
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}

// Routes an in-progress ride back into its live screen (the back buttons
// on driver-accepted/tracking leave the ride running, so this is the way
// back in from Activity > Active). Returns null for terminal rides.
function liveRideHref(ride: Ride): {
  pathname:
    | '/(main)/ride/searching-driver'
    | '/(main)/ride/driver-accepted'
    | '/(main)/ride/tracking'
    | '/(main)/ride/completed';
  params: { rideId: string };
} | null {
  const params = { rideId: ride.id };
  switch (ride.status) {
    case 'searchingDriver':
    case 'scheduled':
      return { pathname: '/(main)/ride/searching-driver', params };
    case 'driverAssigned':
    case 'driverArriving':
    case 'driverArrived':
      return { pathname: '/(main)/ride/driver-accepted', params };
    case 'pinVerified':
    case 'inProgress':
    case 'arrived':
    case 'paymentPending':
      return { pathname: '/(main)/ride/tracking', params };
    case 'completed':
      return { pathname: '/(main)/ride/completed', params };
    default:
      return null;
  }
}
