import { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';

import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { useTranslation } from '../../../hooks/useTranslation';
import { useResponsive } from '../../../hooks/useResponsive';
import { getDriverPayouts } from '../../../services/driver-profile-service';
import { DriverPayout } from '../../../types/driver';
import { formatFare } from '../../../types/ride';
import { Colors } from '../../../constants/theme';
import { ErrorState, LoadingState } from '../../../components/ui';

const STATUS_COLORS: Record<DriverPayout['status'], string> = {
  pending: Colors.warning,
  processing: Colors.warning,
  completed: Colors.primary,
  failed: Colors.danger,
  reversed: Colors.danger,
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
  const { contentStyle } = useResponsive();
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
    <SafeAreaViewPlaceholder className="flex-1 bg-surface">
      <View style={[{ flex: 1 }, contentStyle]} className="px-5 pt-2">
        <ScreenHeader back title={t('driverPayouts')} />

        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} retryLabel={t('tryAgain')} onRetry={load} />
        ) : payouts.length === 0 ? (
          <Text className="mt-8 text-fg-muted">{t('driverNoPayoutsYet')}</Text>
        ) : (
          <FlatList
            className="mt-4"
            data={payouts}
            keyExtractor={(p) => p.id}
            renderItem={({ item }) => (
              <Card padded={false} className="mb-3 flex-row items-center justify-between p-4">
                <View className="flex-1 pr-3">
                  <Text className="text-body font-semibold text-fg">{formatFare(item.amount)}</Text>
                  <Text className="mt-0.5 text-subhead text-fg-muted">{item.method}</Text>
                  <Text className="mt-0.5 text-subhead text-fg-muted">{new Date(item.createdAt).toLocaleDateString()}</Text>
                </View>
                <Text className="text-subhead font-semibold" style={{ color: STATUS_COLORS[item.status], flexShrink: 1, textAlign: 'right' }}>
                  {t(STATUS_KEYS[item.status] as any)}
                </Text>
              </Card>
            )}
          />
        )}
      </View>
    </SafeAreaViewPlaceholder>
  );
}
