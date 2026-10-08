import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator, Pressable } from 'react-native';
import { router, useIsFocused } from 'expo-router';
import { goBack } from '@kimu/shared/utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@kimu/shared/components/Button';
import { MapSheet } from '../../../components/map/MapSheet';
import { FareBreakdownView, clockIn } from '../../../components/FareBreakdownView';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { useMapScene } from '../../../hooks/useMapScene';
import { useRideWizardStore } from '../../../stores/useRideWizardStore';
import { fetchServerEstimate } from '../../../services/ride-service';
import { getRoute } from '@kimu/shared/services/location-service';
import { formatFare, FareEstimate } from '@kimu/shared/types/ride';
import { placeHasCoordinates } from '@kimu/shared/types/place';
import type { MapScene } from '@kimu/shared/components/map/map-types';

const PADDING = { top: 90, bottom: 460, left: 40, right: 40 };

// Trip summary before payment: the locked upfront price from the vehicle
// choice (itemised), the road route on the shared map, and the arrival time.
export default function FareEstimateScreen() {
  const { t } = useTranslation();
  const isFocused = useIsFocused();
  const pickup = useRideWizardStore((s) => s.pickup);
  const destination = useRideWizardStore((s) => s.destination);
  const vehicle = useRideWizardStore((s) => s.vehicle);
  const rideType = useRideWizardStore((s) => s.rideType);
  const seats = useRideWizardStore((s) => s.seats);
  const locked = useRideWizardStore((s) => s.fareEstimate);
  const setFareEstimate = useRideWizardStore((s) => s.setFareEstimate);

  const [estimate, setEstimate] = useState<FareEstimate | null>(locked?.quoteId ? locked : null);
  const [loading, setLoading] = useState(!locked?.quoteId);
  const [loadError, setLoadError] = useState<string | undefined>();

  // Fallback when there is no locked quote (e.g. an older entry point):
  // the server estimate plus the road route, as before.
  const load = useCallback(() => {
    if (!isFocused) return;
    if (!pickup || !destination || !vehicle) {
      router.replace('/(main)/request/pickup');
      return;
    }
    if (locked?.quoteId) return;
    setLoading(true);
    setLoadError(undefined);
    Promise.all([fetchServerEstimate({ pickup, destination, vehicle, rideType, seats }), getRoute({ from: pickup, to: destination })])
      .then(([serverEstimate, route]) => {
        const next: FareEstimate = {
          ...serverEstimate,
          routeCoordinates: route?.points.map((p) => [p.longitude, p.latitude] as [number, number]),
        };
        setEstimate(next);
        setFareEstimate(next);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : t('requestFailed')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup, destination, vehicle, rideType, seats, isFocused]);

  useEffect(() => {
    load();
  }, [load]);

  const scene = useMemo<MapScene | null>(() => {
    if (!pickup || !destination || !placeHasCoordinates(pickup) || !placeHasCoordinates(destination)) return null;
    return {
      camera: { mode: 'fit', padding: PADDING, zoom: 16 },
      routes: estimate?.routeCoordinates?.length ? [{ coordinates: estimate.routeCoordinates }] : [],
      markers: [
        { id: 'pickup', kind: 'pickup', latitude: pickup.latitude!, longitude: pickup.longitude!, label: pickup.address.split(',')[0] },
        { id: 'destination', kind: 'destination', latitude: destination.latitude!, longitude: destination.longitude!, label: destination.address.split(',')[0] },
      ],
    };
  }, [pickup, destination, estimate]);
  useMapScene(scene);

  if (!pickup || !destination) return null;

  const eta = estimate?.pickupEtaMinutes ?? null;

  return (
    <View style={{ flex: 1 }}>
      <SafeAreaView edges={['top']} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('back')}
          onPress={() => goBack()}
          className="ml-4 mt-2 h-11 w-11 items-center justify-center rounded-full bg-white"
          style={{ elevation: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6 }}
        >
          <Ionicons name="arrow-back" size={22} color="#111" />
        </Pressable>
      </SafeAreaView>

      <MapSheet
        header={<Text className="mb-3 text-xl text-ink font-display">{t('rideSummary')}</Text>}
        footer={
          <Button
            title={estimate ? `${t('continueLabel')} · ${formatFare(estimate.estimatedFare)}` : t('continueLabel')}
            onPress={() => estimate && router.push('/(main)/request/payment-method')}
            disabled={!estimate}
          />
        }
      >
        <View className="mb-3 rounded-2xl border border-border p-3.5">
          <View className="flex-row items-center">
            <View className="h-2.5 w-2.5 rounded-full bg-ink" />
            <Text className="ml-3 flex-1 text-[13px] text-ink" numberOfLines={1}>{pickup.address}</Text>
          </View>
          <View className="ml-[4px] h-4 w-px bg-border" />
          <View className="flex-row items-center">
            <View className="h-2.5 w-2.5 bg-ink" />
            <Text className="ml-3 flex-1 text-[13px] text-ink" numberOfLines={1}>{destination.address}</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator className="my-6" color="#0E7C4A" />
        ) : loadError ? (
          <View className="rounded-2xl border border-error/40 bg-error/5 p-4">
            <Text className="text-sm text-error">{loadError}</Text>
            <View className="mt-3 self-start">
              <Button title={t('retryLabel')} variant="outline" onPress={load} />
            </View>
          </View>
        ) : estimate ? (
          <View>
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-[15px] font-bold text-ink">{estimate.vehicle.name}</Text>
              <Text className="text-[13px] text-text-secondary">
                {estimate.distanceKm.toFixed(1)} km · ~{estimate.durationMinutes} min
                {eta != null ? ` · ${t('dropoffAt', { time: clockIn(eta + estimate.durationMinutes) })}` : ''}
              </Text>
            </View>
            {estimate.breakdown ? (
              <FareBreakdownView breakdown={estimate.breakdown} distanceKm={estimate.distanceKm} durationMinutes={estimate.durationMinutes} />
            ) : (
              <View className="flex-row justify-between rounded-2xl bg-gray-light p-3.5">
                <Text className="text-base font-semibold text-ink">{t('fare')}</Text>
                <Text className="text-lg font-bold text-ink">{formatFare(estimate.estimatedFare)}</Text>
              </View>
            )}
          </View>
        ) : null}
      </MapSheet>
    </View>
  );
}
