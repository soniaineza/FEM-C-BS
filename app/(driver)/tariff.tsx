import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../components/SafeAreaViewPlaceholder';
import { BackHeader } from '../../components/BackHeader';
import { ErrorMessage } from '../../components/ErrorMessage';
import { Ionicons } from '@expo/vector-icons';

import { useTranslation } from '../../hooks/useTranslation';
import { fetchVehicles } from '../../services/ride-service';
import { Vehicle } from '../../types/vehicle';
import { formatFare } from '../../types/ride';

// Tariff information screen — the reference's "Amakuru ku giciro" page. Lists
// every vehicle class's base fare and per-km rate straight from the
// catalogue, so the driver sees the same numbers the passenger sees.
export default function DriverTariffScreen() {
  const { t } = useTranslation();
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setVehicles(await fetchVehicles());
    } catch {
      setError(t('tryAgain'));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-dark-bg">
      <ScrollView contentContainerClassName="px-5 pb-8">
        <BackHeader title={t('driverTariffTitle')} />

        {vehicles === null && !error ? (
          <View className="items-center py-16">
            <ActivityIndicator color="#16A34A" />
          </View>
        ) : error ? (
          <View className="mt-4">
            <ErrorMessage message={error} retryLabel={t('tryAgain')} onRetry={load} dark />
          </View>
        ) : (
          vehicles!.map((vehicle) => (
            <View key={vehicle.id} className="mb-3 rounded-2xl border border-dark-border bg-dark-surface p-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="text-base font-bold text-dark-text">{vehicle.name}</Text>
                  {vehicle.description ? (
                    <Text numberOfLines={2} className="mt-0.5 text-[12.5px] text-dark-sub">{vehicle.description}</Text>
                  ) : null}
                </View>
                <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(22,163,74,0.16)' }}>
                  <Ionicons name="car-sport" size={17} color="#16A34A" />
                </View>
              </View>

              <View className="mt-3 flex-row items-stretch">
                <View className="flex-1">
                  <Text className="text-[11px] text-dark-muted">{t('driverTariffBaseFare')}</Text>
                  <Text className="mt-0.5 text-[15px] font-bold text-primary">{formatFare(vehicle.baseFare)}</Text>
                </View>
                <View className="w-px bg-dark-border" />
                <View className="flex-1 pl-4">
                  <Text className="text-[11px] text-dark-muted">{t('driverTariffPerKm')}</Text>
                  <Text className="mt-0.5 text-[15px] font-bold text-dark-text">{formatFare(vehicle.farePerKm)}</Text>
                </View>
                <View className="w-px bg-dark-border" />
                <View className="flex-1 pl-4">
                  <Text className="text-[11px] text-dark-muted">{t('driverTariffCapacity')}</Text>
                  <Text className="mt-0.5 text-[15px] font-bold text-dark-text">{vehicle.capacity}</Text>
                </View>
              </View>
            </View>
          ))
        )}

        <Text className="mt-2 text-center text-[12px] leading-5 text-dark-muted">{t('driverTariffNote')}</Text>
      </ScrollView>
    </SafeAreaViewPlaceholder>
  );
}