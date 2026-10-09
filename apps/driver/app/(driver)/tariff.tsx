import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, ScrollView } from 'react-native';
import { ScreenShell } from '@kimu/shared/components/ScreenShell';
import { FareTable } from '@kimu/shared/components/FareTable';
import { ErrorMessage } from '@kimu/shared/components/ErrorMessage';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { fetchVehicles } from '../../services/driver-service';
import { Vehicle } from '@kimu/shared/types/vehicle';

// The published tariff, straight from the catalogue the server prices with,
// so a driver quoting a fare at the roadside is reading the same numbers the
// rider was charged. Every class is on one tariff, so the table is shown once
// and the classes below it differ only by the car.
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
    <ScreenShell title={t('driverTariffTitle')} back background="bg-bg-light" backLabel={t('back')}>
      <ScrollView contentContainerClassName="px-5 pb-8 pt-4">
        {vehicles === null && !error ? (
          <View className="items-center py-16">
            <ActivityIndicator color="#0E7C4A" />
          </View>
        ) : error ? (
          <ErrorMessage message={error} retryLabel={t('tryAgain')} onRetry={load} />
        ) : vehicles && vehicles.length ? (
          <>
            <FareTable vehicle={vehicles[0]!} />

            <View className="mt-5">
              {vehicles.map((vehicle) => (
                <View key={vehicle.id} className="mb-3 flex-row items-center rounded-2xl border border-border bg-white p-4">
                  <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <Ionicons name="car-sport" size={18} color="#0E7C4A" />
                  </View>
                  <View className="ml-3 flex-1">
                    <Text className="text-[15px] font-bold text-ink">{vehicle.name}</Text>
                    {vehicle.description ? (
                      <Text numberOfLines={2} className="font-sans mt-0.5 text-[12.5px] text-text-secondary">
                        {vehicle.description}
                      </Text>
                    ) : null}
                  </View>
                  <View className="items-end">
                    <Text className="text-[15px] font-bold text-ink">{vehicle.capacity}</Text>
                    <Text className="font-sans text-[11px] text-text-secondary">{t('driverTariffCapacity')}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}

        <Text className="font-sans mt-2 text-center text-[12px] leading-5 text-text-secondary">{t('driverTariffNote')}</Text>
      </ScrollView>
    </ScreenShell>
  );
}
