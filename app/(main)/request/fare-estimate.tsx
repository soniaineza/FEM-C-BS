import { useEffect, useState } from 'react';
import { View, Text, SafeAreaView, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';

import { Button } from '../../../components/Button';
import { RideMap } from '../../../components/RideMap';
import { useTranslation } from '../../../hooks/useTranslation';
import { useRideWizardStore } from '../../../stores/useRideWizardStore';
import { fetchServerEstimate } from '../../../services/ride-service';
import { getRoute } from '../../../services/location-service';
import { formatFare, FareEstimate } from '../../../types/ride';

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

  useEffect(() => {
    if (!pickup || !destination || !vehicle) {
      router.replace('/(main)/request/pickup');
      return;
    }
    Promise.all([
      fetchServerEstimate({ pickup, destination, vehicle, rideType }),
      getRoute({ from: pickup, to: destination }),
    ])
      .then(([serverEstimate, route]) => {
        setEstimate(serverEstimate);
        setFareEstimate(serverEstimate);
        if (route) setRoutePoints(route.points);
      })
      .finally(() => setLoading(false));
  }, [pickup, destination, vehicle, rideType]);

  function proceed() {
    router.push('/(main)/request/payment-method');
  }

  if (loading || !pickup || !destination) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#16A34A" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="h-56 w-full">
        <RideMap
          center={{ latitude: pickup.latitude!, longitude: pickup.longitude! }}
          markers={[
            { id: 'pickup', position: { latitude: pickup.latitude!, longitude: pickup.longitude! }, icon: 'pickup' },
            { id: 'dest', position: { latitude: destination.latitude!, longitude: destination.longitude! }, icon: 'destination' },
          ]}
          routePolyline={routePoints}
        />
      </View>
      <View className="flex-1 px-6 pt-6">
        <Text className="text-xl font-bold text-ink">{t('rideSummary')}</Text>

        <View className="mt-4 gap-2">
          <Text className="text-text-secondary">{pickup.address}</Text>
          <Text className="text-text-secondary">{destination.address}</Text>
        </View>

        {estimate ? (
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
          <Button title={t('continueLabel')} onPress={proceed} />
        </View>
      </View>
    </SafeAreaView>
  );
}
