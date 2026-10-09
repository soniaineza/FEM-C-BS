import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaViewPlaceholder } from '@kimu/shared/components/SafeAreaViewPlaceholder';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { Button } from '@kimu/shared/components/Button';
import { DriverTopBar } from '../../../components/driver/DriverTopBar';
import { getDriverEarningsSummary, getDriverEarningsHistory } from '../../../services/driver-profile-service';
import { DriverEarningEntry, DriverEarningsSummary } from '../../../types/driver';
import { formatFare } from '@kimu/shared/types/ride';

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

// Earnings + payouts — the driver-app counterpart to the rider Wallet tab:
// a balance hero (money to withdraw, or commission owed on cash trips), a
// bucketed earnings summary and the per-trip ledger. Withdrawing and paying
// commission happen on the payouts screen.
export default function DriverWalletScreen() {
  const { t } = useTranslation();
  const isFocused = useIsFocused();
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

  // Reload on focus so the balance reflects a payout or commission payment
  // just made on the payouts screen.
  useFocusEffect(useCallback(() => { load(); }, []));

  const owed = summary?.balance?.owed ?? 0;
  // With no driver share, every fare goes to Kimu: the dashboard then shows
  // the fares the driver's trips brought in rather than a balance to withdraw.
  const noShare = !!summary && !summary.balance?.driverShareRate;
  const shown = (bucket?: { amount: number; fares: number }) => (noShare ? bucket?.fares : bucket?.amount) ?? 0;

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-primary" edges={['left', 'right']}>
      {isFocused ? <StatusBar style="light" /> : null}
      <DriverTopBar title={t('wallet')} />

      {loading ? (
        <View className="flex-1 bg-bg-light">
          <ActivityIndicator className="mt-8" color="#0E7C4A" />
        </View>
      ) : error ? (
        <View className="flex-1 gap-4 bg-bg-light px-5 pt-8">
          <Text className="font-sans text-center text-error">{error}</Text>
          <Button title={t('tryAgain')} variant="outline" onPress={load} />
        </View>
      ) : (
        <ScrollView className="flex-1 bg-bg-light" contentContainerClassName="px-5 pb-8 pt-4">
          <View
            className="rounded-2xl bg-primary p-5"
            style={{ shadowColor: '#0E7C4A', shadowOpacity: 0.26, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 4 }}
          >
            <Text className="text-xs font-medium text-white/80">
              {t(owed > 0 ? (noShare ? 'driverCashToRemit' : 'driverCommissionOwed') : noShare ? 'driverFaresSentToKimu' : 'driverAvailableBalance')}
            </Text>
            <Text className="mt-1 text-3xl font-bold text-white">
              {formatFare(owed > 0 ? Math.ceil(owed) : noShare ? summary?.total.fares ?? 0 : Math.floor(summary?.balance?.available ?? 0))}
            </Text>
            {summary?.balance?.blocked ? (
              <Text className="mt-1 text-xs font-medium text-white">
                {t('driverCommissionBlocked', { limit: formatFare(summary.balance.debtLimit) })}
              </Text>
            ) : null}
            {owed > 0 || !noShare ? (
              <Pressable
                className="mt-4 min-h-[44px] flex-row items-center justify-center rounded-xl bg-white/15 py-2.5"
                onPress={() => router.push('/(driver)/wallet/payouts' as any)}
              >
                <Ionicons name="cash-outline" size={16} color="#fff" />
                <Text className="ml-2 font-semibold text-white">
                  {t(owed > 0 ? (noShare ? 'driverSendCash' : 'driverPayCommission') : 'driverViewPayouts')}
                </Text>
              </Pressable>
            ) : null}
          </View>

          <View className="mt-4 flex-row gap-3">
            <SummaryCard label={t('driverToday')} amount={shown(summary?.today)} rides={summary?.today.rides ?? 0} />
            <SummaryCard label={t('thisWeek')} amount={shown(summary?.week)} rides={summary?.week.rides ?? 0} />
          </View>
          <View className="mt-3 flex-row gap-3">
            <SummaryCard label={t('thisMonth')} amount={shown(summary?.month)} rides={summary?.month.rides ?? 0} />
            <SummaryCard label={t('driverAllTime')} amount={shown(summary?.total)} rides={summary?.total.rides ?? 0} />
          </View>

          <Text className="mt-6 text-base font-bold text-ink">{t(noShare ? 'driverRecentFares' : 'driverRecentEarnings')}</Text>
          {history.length === 0 ? (
            <Text className="font-sans mt-3 text-sm text-text-secondary">{t('driverNoEarningsYet')}</Text>
          ) : (
            <View className="mt-3 gap-2.5">
              {history.map((entry) => (
                <View key={entry.id} className="flex-row items-center justify-between rounded-xl border border-border bg-white p-3.5">
                  <View className="flex-1 pr-3">
                    <Text numberOfLines={1} className="text-[13.5px] font-semibold text-ink">{entry.destAddress}</Text>
                    <Text className="font-sans mt-0.5 text-xs text-text-secondary">
                      {entry.distanceKm.toFixed(1)} km · {entry.paymentMethod} · {t(earningStatusKey(entry.status) as any)}
                    </Text>
                  </View>
                  <Text className="font-bold text-primary">{formatFare(noShare ? entry.grossAmount : entry.netAmount)}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaViewPlaceholder>
  );
}

function SummaryCard({ label, amount, rides }: { label: string; amount: number; rides: number }) {
  const { t } = useTranslation();
  return (
    <View className="flex-1 rounded-2xl border border-border bg-white p-4">
      <Text className="text-xs font-medium text-text-secondary">{label}</Text>
      <Text className="mt-1 text-base font-bold text-ink">{formatFare(amount)}</Text>
      <Text className="font-sans mt-0.5 text-[11px] text-text-secondary">{t('driverTripsCount', { count: rides })}</Text>
    </View>
  );
}
