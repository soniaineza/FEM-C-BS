import { useCallback, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';
import { router } from 'expo-router';

import { Button } from '../../../components/Button';
import { BackHeader } from '../../../components/BackHeader';
import { RideMap } from '../../../components/RideMap';
import { useTranslation } from '../../../hooks/useTranslation';
import { useRideWizardStore } from '../../../stores/useRideWizardStore';
import { fetchServerEstimate } from '../../../services/ride-service';
import { getRoute, MapDefaults } from '../../../services/location-service';
import { formatFare, FareEstimate } from '../../../types/ride';
import { placeHasCoordinates } from '../../../types/place';

export default function FareEstimateScreen() {
  const { t } = useTranslation();
  const pickup = useRideWizardStore((s) => s.pickup);
  const destination = useRideWizardStore((s) => s.destination);
  const vehicle = useRideWizardStore((s) => s.vehicle);
  const rideType = useRideWizardStore((s) => s.rideType);
  const setFareEstimate = useRideWizardStore((s) => s.setFareEstimate);

  const [estimate, setEstimate] = useState<FareEstimate | null>(null);
  const [routePoints, setRoutePoints] = useState<{ latitude: number; longitude: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();

  // load is re-runnable so failures get an explicit Try-again instead of an
  // eternal spinner: previously a failed GET /rides/estimate (cold-start
  // blip, dropped request) left this screen wedged on the loading state with
  // no Continue button rendered at all — reported as "buttons stop working".
  const load = useCallback(() => {
    if (!pickup || !destination || !vehicle) {
      router.replace('/(main)/request/pickup');
      return;
    }
    setLoading(true);
    setLoadError(undefined);
    Promise.all([
      fetchServerEstimate({ pickup, destination, vehicle, rideType }),
      getRoute({ from: pickup, to: destination }),
    ])
      .then(([serverEstimate, route]) => {
        setEstimate(serverEstimate);
        setFareEstimate(serverEstimate);
        setRoutePoints(route?.points ?? []);
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : t('requestFailed'));
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup, destination, vehicle, rideType]);

  useEffect(() => {
    load();
  }, [load]);

  function proceed() {
    if (!estimate) return;
    router.push('/(main)/request/payment-method');
  }

  if (loading || !pickup || !destination) {
    return (
      <SafeAreaViewPlaceholder className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#16A34A" />
      </SafeAreaViewPlaceholder>
    );
  }

  // Coordinates are optional on Place (see types/place.ts): only render
  // map markers when both sides have real coordinates, and keep the map at
  // the default Kigali view otherwise instead of asserting non-null and
  // drawing markers at "0,0".
  const pickupCoords = placeHasCoordinates(pickup) ? { latitude: pickup.latitude!, longitude: pickup.longitude! } : null;
  const destinationCoords = placeHasCoordinates(destination) ? { latitude: destination.latitude!, longitude: destination.longitude! } : null;
  const mapMarkers = pickupCoords && destinationCoords
    ? [
        { id: 'pickup', position: pickupCoords, icon: 'pickup' as const },
        { id: 'dest', position: destinationCoords, icon: 'destination' as const },
      ]
    : [];

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-white">
      <View className="h-52 w-full">
        <RideMap
          center={pickupCoords ?? MapDefaults}
          markers={mapMarkers}
          routePolyline={routePoints}
          retryLabel={t('retryLabel')}
          loadingLabel={t('mapLoading')}
          errorLabel={t('mapError')}
        />
      </View>
      <View className="flex-1 px-6 pt-2">
        <BackHeader />
        <Text className="mt-1 text-xl font-bold text-ink">{t('rideSummary')}</Text>

        <View className="mt-4 gap-2">
          <Text className="text-text-secondary">{pickup.address}</Text>
          <Text className="text-text-secondary">{destination.address}</Text>
        </View>

        {loadError ? (
          <View className="mt-6 rounded border border-error/40 bg-error/5 p-4">
            <Text className="text-sm text-error">{loadError}</Text>
            <View className="mt-3 self-start">
              <Button title={t('retryLabel')} variant="outline" onPress={load} />
            </View>
          </View>
        ) : estimate ? (
          <View className="mt-6 rounded border border-border p-4">
            <View className="flex-row justify-between">
              <Text className="text-text-secondary">{t('vehicle')}</Text>
              <Text className="text-ink">{estimate.vehicle.name}</Text>
            </View>
            <View className="mt-2 flex-row justify-between">
              <Text className="text-text-secondary">{estimate.distanceKm.toFixed(1)} km</Text>
              <Text className="text-text-secondary">~{estimate.durationMinutes} min</Text>
            </View>
            <View className="mt-2 flex-row justify-between">
              <Text className="text-base font-semibold text-ink">{t('fare')}</Text>
              <Text className="text-lg font-bold text-primary">{formatFare(estimate.estimatedFare)}</Text>
            </View>
          </View>
        ) : null}

        <View className="mt-auto pb-8">
          <Button title={t('continueLabel')} onPress={proceed} disabled={!estimate} />
        </View>
      </View>
    </SafeAreaViewPlaceholder>
  );
}
