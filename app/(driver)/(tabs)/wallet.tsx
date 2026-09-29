import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Pressable } from '../../../components/ui/Pressable';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useTranslation } from '../../../hooks/useTranslation';
import { EmptyState, ErrorState, ListItem, ListSection, LoadingState, Screen, ScreenHeader, Text } from '../../../components/ui';
import { Card } from '../../../components/Card';
import { getDriverEarningsSummary, getDriverEarningsHistory } from '../../../services/driver-profile-service';
import { DriverEarningEntry, DriverEarningsSummary } from '../../../types/driver';
import { formatFare } from '../../../types/ride';
import { Colors } from '../../../constants/theme';

// Backend earning statuses ('pending' | 'settled' | 'failed') rendered
// through the dictionary like everything else.
function earningStatusKey(status: string): string {
  const map: Record<string, string> = {
    pending: 'earningStatusPending',
    settled: 'earningStatusSettled',
    failed: 'earningStatusFailed',
  };
  return map[status] ?? status;
}

// Earnings + payouts — the driver-app counterpart to the rider Wallet tab,
// matching the reference driver app's WalletScreen balance hero +
// bucketed summary + transaction ledger (top-up/withdraw are not included:
// The reference app gates going online on a prepaid balance our backend has no concept
// of — see the migration report).
export default function DriverWalletScreen() {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<DriverEarningsSummary | null>(null);
  const [history, setHistory] = useState<DriverEarningEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  function load() {
    setLoading(true);
    setError(undefined);
    Promise.all([getDriverEarningsSummary(), getDriverEarningsHistory()])
      .then(([s, h]) => {
        setSummary(s);
        setHistory(h);
      })
      .catch(() => setError(t('requestFailed')))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  return (
    <Screen edges={['top', 'left', 'right']} header={<ScreenHeader title={t('wallet')} className="pt-3" />}>
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} retryLabel={t('tryAgain')} onRetry={load} />
      ) : (
        <>
          <Card tone="primary" className="mt-2">
            <Text variant="subhead" weight="medium" tone="inverse" style={{ opacity: 0.85 }}>{t('driverPendingBalance')}</Text>
            <Text variant="large-title" tone="inverse" numberOfLines={1} adjustsFontSizeToFit style={{ marginTop: 4 }}>
              {formatFare(summary?.pendingBalance ?? 0)}
            </Text>
            <Pressable
              accessibilityRole="button"
              className="mt-5 flex-row items-center justify-center self-start rounded-full bg-surface px-4 py-2.5"
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
              onPress={() => router.push('/(driver)/wallet/payouts' as any)}
            >
              <Ionicons name="cash-outline" size={16} color={Colors['primary-text']} />
              <Text variant="subhead" weight="semibold" tone="primary" style={{ marginLeft: 6 }}>{t('driverViewPayouts')}</Text>
            </Pressable>
          </Card>

          <View className="mt-3 flex-row gap-3">
            <SummaryCard label={t('driverToday')} amount={summary?.today.amount ?? 0} rides={summary?.today.rides ?? 0} />
            <SummaryCard label={t('thisWeek')} amount={summary?.week.amount ?? 0} rides={summary?.week.rides ?? 0} />
          </View>
          <View className="mt-3 flex-row gap-3">
            <SummaryCard label={t('thisMonth')} amount={summary?.month.amount ?? 0} rides={summary?.month.rides ?? 0} />
            <SummaryCard label={t('driverAllTime')} amount={summary?.total.amount ?? 0} rides={summary?.total.rides ?? 0} />
          </View>

          {history.length === 0 ? (
            <EmptyState compact icon="receipt-outline" title={t('driverNoEarningsYet')} />
          ) : (
            <ListSection title={t('driverRecentEarnings')}>
              {history.map((entry) => (
                <ListItem
                  key={entry.id}
                  icon="arrow-down"
                  title={entry.destAddress}
                  subtitle={`${entry.distanceKm.toFixed(1)} km · ${entry.paymentMethod} · ${t(earningStatusKey(entry.status) as any)}`}
                  right={<Text variant="callout" weight="semibold" tone="primary" numberOfLines={1}>{formatFare(entry.netAmount)}</Text>}
                />
              ))}
            </ListSection>
          )}
        </>
      )}
    </Screen>
  );
}

function SummaryCard({ label, amount, rides }: { label: string; amount: number; rides: number }) {
  const { t } = useTranslation();
  return (
    <Card padded={false} className="flex-1 p-4">
      <Text variant="caption" weight="medium" tone="muted" numberOfLines={1}>{label}</Text>
      <Text variant="title-3" weight="bold" numberOfLines={1} adjustsFontSizeToFit style={{ marginTop: 4 }}>{formatFare(amount)}</Text>
      <Text variant="caption" tone="subtle" numberOfLines={1} style={{ marginTop: 2 }}>{t('driverTripsCount', { count: rides })}</Text>
    </Card>
  );
}
