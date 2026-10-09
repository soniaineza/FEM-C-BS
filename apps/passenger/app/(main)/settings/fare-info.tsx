import { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { ScreenShell } from '@kimu/shared/components/ScreenShell';
import { FareTable } from '@kimu/shared/components/FareTable';
import { ErrorMessage } from '@kimu/shared/components/ErrorMessage';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { fetchVehicles } from '../../../services/ride-service';
import { Vehicle } from '@kimu/shared/types/vehicle';

type Row = { icon: keyof typeof Ionicons.glyphMap; title: string; body: string };

// The published fare table first — the same numbers the server charges, read
// from the vehicle catalogue rather than retyped here, so the screen can
// never drift from what a rider actually pays. The notes below explain the
// parts a table cannot: surge, and why the price is fixed upfront.
export default function FareInfoScreen() {
  const { t } = useTranslation();
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setVehicles(await fetchVehicles());
    } catch {
      setError(t('requestFailed'));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows: Row[] = [
    { icon: 'trending-up-outline', title: t('fareInfoSurgeTitle'), body: t('fareInfoSurge') },
    { icon: 'shield-checkmark-outline', title: t('fareInfoUpfrontTitle'), body: t('fareInfoUpfront') },
  ];

  // Every class is on the one published tariff, so the table is shown once.
  const tariffVehicle = vehicles?.[0] ?? null;

  return (
    <ScreenShell title={t('drawerFareInfo')} back background="bg-white" backLabel={t('back')}>
      <ScrollView contentContainerClassName="px-6 pb-10 pt-2" showsVerticalScrollIndicator={false}>
        <Text className="font-sans mt-2 leading-relaxed text-text-secondary">{t('fareInfoIntro')}</Text>

        <View className="mt-5">
          {vehicles === null && !error ? (
            <View className="items-center py-10">
              <ActivityIndicator color="#0E7C4A" />
            </View>
          ) : error ? (
            <ErrorMessage message={error} retryLabel={t('tryAgain')} onRetry={load} />
          ) : tariffVehicle ? (
            <FareTable vehicle={tariffVehicle} />
          ) : null}
        </View>

        <View className="mt-5 gap-3">
          {rows.map((r) => (
            <View key={r.title} className="flex-row rounded-2xl border border-border bg-white p-4">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <Ionicons name={r.icon} size={20} color="#0E7C4A" />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-[15px] font-bold text-ink">{r.title}</Text>
                <Text className="font-sans mt-0.5 text-[13px] leading-5 text-text-secondary">{r.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text className="font-sans mt-5 text-xs leading-5 text-text-secondary">{t('fareInfoUpfrontNote')}</Text>
      </ScrollView>
    </ScreenShell>
  );
}
