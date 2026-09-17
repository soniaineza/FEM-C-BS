import { useEffect, useState } from 'react';
import { View, Text, SafeAreaView, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pickup || !destination) {
      router.replace('/(main)/request/pickup');
      return;
    }
    fetchVehicles()
      .then(setVehicles)
      .finally(() => setLoading(false));
  }, [pickup, destination]);

  function choose(vehicle: Vehicle) {
    if (!pickup || !destination) return;
    const distanceKm = straightLineKm(pickup, destination);
    setVehicle(vehicle);
    setFareEstimate(estimateFareLocal(vehicle, distanceKm, rideType));
    router.push('/(main)/request/fare-estimate');
  }

  const distanceKm = pickup && destination ? straightLineKm(pickup, destination) : 0;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6 pt-6">
        <Text className="text-xl font-bold text-ink">{t('vehicleOptions')}</Text>

        {loading ? (
          <ActivityIndicator className="mt-8" color="#16A34A" />
        ) : vehicles.length === 0 ? (
          <Text className="mt-8 text-text-secondary">{t('noVehicles')}</Text>
        ) : (
          <FlatList
            className="mt-4"
            data={vehicles}
            keyExtractor={(v) => v.id}
            renderItem={({ item }) => {
              const estimate = estimateFareLocal(item, distanceKm, rideType);
              return (
                <Pressable className="mb-3 flex-row items-center justify-between rounded border border-border p-4" onPress={() => choose(item)}>
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-ink">{item.name}</Text>
                    <Text className="mt-1 text-sm text-text-secondary">{item.description}</Text>
                    <Text className="mt-1 text-xs text-text-secondary">~{item.etaMinutes} min</Text>
                  </View>
                  <Text className="text-base font-bold text-primary">{formatFare(estimate.estimatedFare)}</Text>
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
