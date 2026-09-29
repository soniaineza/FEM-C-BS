import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { appAlert } from '../../../utils/dialog';
import { router, useIsFocused } from 'expo-router';
import { goBack } from '../../../utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../../../components/Button';
import { MapSheet } from '../../../components/map/MapSheet';
import { FareBreakdownView, clockIn } from '../../../components/FareBreakdownView';
import { useTranslation } from '../../../hooks/useTranslation';
import { useMapScene } from '../../../hooks/useMapScene';
import { useNearbyCars } from '../../../hooks/useNearbyCars';
import { useRideWizardStore } from '../../../stores/useRideWizardStore';
import { fetchTripQuote, fetchVehicles, TripQuote, TripQuoteOption } from '../../../services/ride-service';
import { Vehicle } from '../../../types/vehicle';
import { formatFare } from '../../../types/ride';
import { placeHasCoordinates } from '../../../types/place';
import type { MapScene } from '../../../components/map/map-types';
import { Colors, Elevation } from '../../../constants/theme';

const SHEET_PADDING = { top: 90, bottom: 430, left: 40, right: 40 };

// "Choose a ride": the road route on the shared map, live cars around the
// pickup, and every vehicle class with its upfront price, pickup ETA and
// drop-off time from one GET /rides/quote.
export default function VehicleSelectionScreen() {
  const { t } = useTranslation();
  const isFocused = useIsFocused();
  const pickup = useRideWizardStore((s) => s.pickup);
  const destination = useRideWizardStore((s) => s.destination);
  const rideType = useRideWizardStore((s) => s.rideType);
  const setVehicle = useRideWizardStore((s) => s.setVehicle);
  const setFareEstimate = useRideWizardStore((s) => s.setFareEstimate);

  const [quote, setQuote] = useState<TripQuote | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();

  const ready = pickup && destination && placeHasCoordinates(pickup) && placeHasCoordinates(destination);
  const pickupPoint = ready ? { latitude: pickup!.latitude!, longitude: pickup!.longitude! } : null;
  const { cars, serverTimeOffsetMs } = useNearbyCars(pickupPoint);

  const load = useCallback(() => {
    if (!ready) return;
    setLoading(true);
    setLoadError(undefined);
    Promise.all([fetchTripQuote({ pickup: pickup!, destination: destination!, rideType }), fetchVehicles()])
      .then(([q, list]) => {
        setQuote(q);
        setVehicles(list);
        // Preselect the cheapest class that has a car nearby, like Uber.
        const firstAvailable = q.options.find((o) => o.pickupEtaMinutes != null) ?? q.options[0];
        setSelectedId((prev) => prev ?? firstAvailable?.vehicleId ?? null);
      })
      .catch((err) => setLoadError(err?.message ?? t('requestFailed')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup, destination, rideType]);

  useEffect(() => {
    if (!isFocused) return;
    if (!ready) {
      router.replace('/(main)/(tabs)');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, isFocused]);

  const scene = useMemo<MapScene | null>(() => {
    if (!pickupPoint || !destination) return null;
    return {
      camera: { mode: 'fit', padding: SHEET_PADDING, zoom: 16 },
      routes: quote ? [{ coordinates: quote.route.coordinates, animateIn: true }] : [],
      markers: [
        { id: 'pickup', kind: 'pickup', ...pickupPoint, label: pickup!.address.split(',')[0] },
        { id: 'destination', kind: 'destination', latitude: destination.latitude!, longitude: destination.longitude!, label: destination.address.split(',')[0] },
      ],
      cars,
      serverTimeOffsetMs,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote, cars, serverTimeOffsetMs, pickupPoint?.latitude, pickupPoint?.longitude, destination]);
  useMapScene(scene);

  function select(option: TripQuoteOption) {
    Haptics.selectionAsync().catch(() => {});
    if (option.vehicleId === selectedId) {
      setExpandedId((id) => (id === option.vehicleId ? null : option.vehicleId));
    } else {
      setSelectedId(option.vehicleId);
      setExpandedId(null);
    }
  }

  function proceed() {
    const option = quote?.options.find((o) => o.vehicleId === selectedId);
    const vehicle = vehicles.find((v) => v.id === selectedId);
    if (!quote || !option || !vehicle) {
      appAlert(t('locationDialogTitle'), t('chooseVehicleFirst'));
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setVehicle(vehicle);
    setFareEstimate({
      vehicle,
      distanceKm: quote.route.distanceKm,
      durationMinutes: quote.route.durationMinutes,
      estimatedFare: option.fare.total,
      rideType,
      isEstimate: false,
      quoteId: option.quoteId,
      breakdown: option.fare,
      pickupEtaMinutes: option.pickupEtaMinutes,
      routeCoordinates: quote.route.coordinates,
      routeSource: quote.route.source,
    });
    router.push('/(main)/request/fare-estimate');
  }

  if (!ready) return null;
  const selected = quote?.options.find((o) => o.vehicleId === selectedId);

  return (
    <View style={{ flex: 1 }}>
      <SafeAreaView edges={['top']} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('back')}
          onPress={() => goBack()}
          className="ml-4 mt-2 h-11 w-11 items-center justify-center rounded-full bg-surface"
          style={Elevation[3]}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.fg} />
        </Pressable>
      </SafeAreaView>

      <MapSheet
        header={
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-title-3 font-bold text-fg">{t('chooseRide')}</Text>
            {quote ? (
              <Text className="text-caption text-fg-muted">
                {quote.route.distanceKm.toFixed(1)} km · {quote.route.durationMinutes} min
              </Text>
            ) : null}
          </View>
        }
        footer={
          <Button
            title={selected ? `${t('continueLabel')} · ${formatFare(selected.fare.total)}` : t('continueLabel')}
            onPress={proceed}
            disabled={!selected}
          />
        }
      >
        {loading ? (
          <ActivityIndicator className="my-8" color={Colors.primary} />
        ) : loadError ? (
          <View className="my-4">
            <Text className="text-fg-muted">{loadError}</Text>
            <View className="mt-3 self-start">
              <Button title={t('retryLabel')} variant="outline" onPress={load} />
            </View>
          </View>
        ) : quote ? (
          <View>
            {quote.surge.multiplier > 1 ? (
              <View className="mb-2 flex-row items-center rounded-xl bg-warning/10 px-3 py-2">
                <Ionicons name="flash" size={16} color={Colors.warning} />
                <Text className="ml-2 flex-1 text-caption text-warning">{t('surgeNotice')}</Text>
              </View>
            ) : null}
            {quote.route.source === 'estimate' ? (
              <Text className="mb-2 text-caption text-fg-muted">{t('routeEstimateNotice')}</Text>
            ) : null}
            {quote.options.map((option) => (
              <VehicleRow
                key={option.vehicleId}
                option={option}
                selected={option.vehicleId === selectedId}
                expanded={option.vehicleId === expandedId}
                distanceKm={quote.route.distanceKm}
                durationMinutes={quote.route.durationMinutes}
                onPress={() => select(option)}
              />
            ))}
          </View>
        ) : null}
      </MapSheet>
    </View>
  );
}

function VehicleRow({
  option,
  selected,
  expanded,
  distanceKm,
  durationMinutes,
  onPress,
}: {
  option: TripQuoteOption;
  selected: boolean;
  expanded: boolean;
  distanceKm: number;
  durationMinutes: number;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const eta = option.pickupEtaMinutes;
  const icon = option.vehicleId === 'fem_xl' ? 'bus' : option.vehicleId === 'fem_comfort' ? 'car-sport' : 'car';
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      onPress={onPress}
      className="mb-2.5 rounded-card bg-surface px-4 py-3.5"
      style={{
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? Colors.primary : 'rgba(15,23,42,0.08)',
        opacity: eta == null ? 0.55 : 1,
        shadowColor: '#0F172A',
        shadowOpacity: selected ? 0.1 : 0.04,
        shadowRadius: selected ? 14 : 8,
        shadowOffset: { width: 0, height: selected ? 6 : 3 },
        elevation: selected ? 3 : 1,
      }}
    >
      <View className="flex-row items-center">
        <View className="h-12 w-14 items-center justify-center rounded-xl bg-surface-muted">
          <Ionicons name={icon} size={28} color={Colors.fg} />
        </View>
        <View className="ml-3 flex-1">
          <View className="flex-row items-center">
            <Text className="text-callout font-bold text-fg">{option.name}</Text>
            <Ionicons name="person" size={12} color={Colors['fg-muted']} style={{ marginLeft: 8 }} />
            <Text className="ml-0.5 text-caption text-fg-muted">{option.capacity}</Text>
          </View>
          <Text className="mt-0.5 text-caption text-fg-muted">
            {eta == null
              ? t('noCarsNearby')
              : `${t('minAway', { minutes: eta })} · ${t('dropoffAt', { time: clockIn(eta + durationMinutes) })}`}
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-body font-bold text-fg">{formatFare(option.fare.total)}</Text>
          {selected ? <Ionicons name={expanded ? 'chevron-up' : 'information-circle-outline'} size={16} color={Colors['fg-muted']} /> : null}
        </View>
      </View>
      {selected && expanded ? (
        <View className="mt-3">
          <FareBreakdownView breakdown={option.fare} distanceKm={distanceKm} durationMinutes={durationMinutes} />
        </View>
      ) : null}
    </Pressable>
  );
}
