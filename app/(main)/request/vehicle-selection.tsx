import { useEffect, useState } from 'react';
import { View, Text, SafeAreaView, FlatList, Pressable, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { TripRouteCard } from '../../../components/TripRouteCard';
import { SectionTitle } from '../../../components/SectionTitle';
import { Button } from '../../../components/Button';
import { BackHeader } from '../../../components/BackHeader';
import { useTranslation } from '../../../hooks/useTranslation';
import { useRideWizardStore } from '../../../stores/useRideWizardStore';
import { fetchVehicles, straightLineKm, estimateFareLocal } from '../../../services/ride-service';
import { Vehicle } from '../../../types/vehicle';
import { formatFare } from '../../../types/ride';

export default function VehicleSelectionScreen() {
  const { t } = useTranslation();
  const pickup = useRideWizardStore((s) => s.pickup);
  const destination = useRideWizardStore((s) => s.destination);
  const rideType = useRideWizardStore((s) => s.rideType);
  const setVehicle = useRideWizardStore((s) => s.setVehicle);
  const setFareEstimate = useRideWizardStore((s) => s.setFareEstimate);

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();

  function load() {
    setLoading(true);
    setLoadError(undefined);
    fetchVehicles()
      .then((list) => {
        setVehicles(list);
        setSelectedId(list[0]?.id ?? null);
      })
      .catch((err) => {
        setVehicles([]);
        // Server-authoritative catalogue failed — surface it, never fall
        // back to fake vehicles/prices.
        setLoadError(err?.message ?? t('noVehicles'));
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!pickup || !destination) {
      router.replace('/(main)/(tabs)');
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup, destination]);

  function proceed() {
    const vehicle = vehicles.find((v) => v.id === selectedId);
    // Loud failure instead of a silent no-op tap: previously a corrupted
    // wizard state (or a vehicle list that refetched to empty after a
    // cold-start blip) made Continue dead with zero feedback — reported as
    // "the continue button is not working".
    if (!pickup || !destination) {
      Alert.alert(t('locationDialogTitle'), t('selectPickupFirst'));
      return;
    }
    if (!vehicle) {
      Alert.alert(t('locationDialogTitle'), t('chooseVehicleFirst'));
      return;
    }
    const distanceKm = straightLineKm(pickup, destination);
    setVehicle(vehicle);
    setFareEstimate(estimateFareLocal(vehicle, distanceKm, rideType));
    router.push('/(main)/request/fare-estimate');
  }

  if (!pickup || !destination) return null;

  const distanceKm = straightLineKm(pickup, destination);

  return (
    <SafeAreaView className="flex-1 bg-bg-light">
      <View className="flex-1 px-5 pt-2">
        <BackHeader />
        <Text className="mb-4 mt-1 text-xl font-bold text-ink">{t('chooseRide')}</Text>

        <TripRouteCard pickup={pickup} destination={destination} distanceKm={distanceKm} />

        <View className="mt-5 mb-2">
          <SectionTitle>{t('vehicleOptions')}</SectionTitle>
        </View>

        {loading ? (
          <ActivityIndicator className="mt-8" color="#16A34A" />
        ) : loadError ? (
          <View className="mt-4">
            <Text className="text-text-secondary">{loadError}</Text>
            <View className="mt-3 self-start">
              <Button title={t('retryLabel')} variant="outline" onPress={load} />
            </View>
          </View>
        ) : vehicles.length === 0 ? (
          <Text className="mt-4 text-text-secondary">{t('noVehicles')}</Text>
        ) : (
          <FlatList
            data={vehicles}
            keyExtractor={(v) => v.id}
            renderItem={({ item }) => {
              const selected = item.id === selectedId;
              const estimate = estimateFareLocal(item, distanceKm, rideType);
              return (
                <Pressable
                  className="mb-2.5 rounded-xl bg-white p-3.5"
                  style={{ borderWidth: selected ? 2 : 1, borderColor: selected ? '#16A34A' : '#E5E7EB' }}
                  onPress={() => setSelectedId(item.id)}
                >
                  <View className="flex-row items-center">
                    <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? '#16A34A' : '#6B7280'} />
                    <View className="ml-3 flex-1">
                      <Text className="text-[15px] font-bold text-ink">{item.name}</Text>
                      <Text className="mt-0.5 text-[12.5px] leading-4 text-text-secondary">{item.description}</Text>
                      <View className="mt-1.5 flex-row items-center">
                        <Ionicons name="people-outline" size={14} color="#6B7280" />
                        <Text className="ml-1 text-xs text-text-secondary">{t('seatsLabel', { count: item.capacity })}</Text>
                        <View className="w-3.5" />
                        <Ionicons name="time-outline" size={14} color="#6B7280" />
                        <Text className="ml-1 text-xs text-text-secondary">{t('arrivesInMin', { minutes: item.etaMinutes })}</Text>
                      </View>
                    </View>
                    <Text className="text-base font-bold text-primary">{formatFare(estimate.estimatedFare)}</Text>
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </View>
      <View className="border-t border-border bg-white px-5 py-3.5">
        <Button title={t('continueLabel')} onPress={proceed} disabled={!selectedId} />
      </View>
    </SafeAreaView>
  );
}
