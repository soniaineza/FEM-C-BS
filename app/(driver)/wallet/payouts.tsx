import { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';

import { BackHeader } from '../../../components/BackHeader';
import { Button } from '../../../components/Button';
import { useTranslation } from '../../../hooks/useTranslation';
import { getDriverPayouts } from '../../../services/driver-profile-service';
import { DriverPayout } from '../../../types/driver';
import { formatFare } from '../../../types/ride';

const STATUS_COLORS: Record<DriverPayout['status'], string> = {
  pending: '#D97706',
  processing: '#D97706',
  completed: '#0E7C4A',
  failed: '#DC2626',
  reversed: '#DC2626',
};

const STATUS_KEYS: Record<DriverPayout['status'], string> = {
  pending: 'payoutStatusPending',
  processing: 'payoutStatusProcessing',
  completed: 'payoutStatusCompleted',
  failed: 'payoutStatusFailed',
  reversed: 'payoutStatusReversed',
};

export default function DriverPayoutsScreen() {
  const { t } = useTranslation();
  const [payouts, setPayouts] = useState<DriverPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  function load() {
    setLoading(true);
    setError(undefined);
    getDriverPayouts()
      .then(setPayouts)
      .catch(() => setError(t('requestFailed')))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-white">
      <View className="flex-1 px-6 pt-2">
        <BackHeader />
        <Text className="mt-2 text-xl text-ink font-display">{t('driverPayouts')}</Text>

        {loading ? (
          <ActivityIndicator className="mt-8" color="#0E7C4A" />
        ) : error ? (
          <View className="mt-8 gap-4">
            <Text className="text-center text-error">{error}</Text>
            <Button title={t('tryAgain')} variant="outline" onPress={load} />
          </View>
        ) : payouts.length === 0 ? (
          <Text className="mt-8 text-text-secondary">{t('driverNoPayoutsYet')}</Text>
        ) : (
          <FlatList
            className="mt-4"
            data={payouts}
            keyExtractor={(p) => p.id}
            renderItem={({ item }) => (
              <View className="mb-3 flex-row items-center justify-between rounded-xl border border-border p-4">
                <View>
                  <Text className="text-base font-semibold text-ink">{formatFare(item.amount)}</Text>
                  <Text className="mt-0.5 text-xs text-text-secondary">{item.method}</Text>
                </View>
                <Text className="text-xs font-semibold" style={{ color: STATUS_COLORS[item.status] }}>
                  {t(STATUS_KEYS[item.status] as any)}
                </Text>
              </View>
            )}
          />
        )}
      </View>
    </SafeAreaViewPlaceholder>
  );
}
