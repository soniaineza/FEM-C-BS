import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useTranslation } from '../../../hooks/useTranslation';
import { getDriverEarningsSummary, getDriverEarningsHistory } from '../../../services/driver-profile-service';
import { DriverEarningEntry, DriverEarningsSummary } from '../../../types/driver';
import { formatFare } from '../../../types/ride';

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
// matching kimu.ride.driver.app.ui.wallet.WalletScreen's balance hero +
// bucketed summary + transaction ledger (top-up/withdraw are not included:
// KIMU gates going online on a prepaid balance our backend has no concept
// of — see the migration report).
export default function DriverWalletScreen() {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<DriverEarningsSummary | null>(null);
  const [history, setHistory] = useState<DriverEarningEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getDriverEarningsSummary(), getDriverEarningsHistory()])
      .then(([s, h]) => {
        setSummary(s);
        setHistory(h);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-bg-light">
      <View className="px-5 pb-3 pt-4">
        <Text className="text-xl font-bold text-ink">{t('wallet')}</Text>
      </View>

      {loading ? (
        <ActivityIndicator className="mt-8" color="#16A34A" />
      ) : (
        <ScrollView contentContainerClassName="px-5 pb-8">
          <View
            className="rounded-2xl bg-primary p-5"
            style={{ shadowColor: '#16A34A', shadowOpacity: 0.26, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 4 }}
          >
            <Text className="text-xs font-medium text-white/80">{t('driverPendingBalance')}</Text>
            <Text className="mt-1 text-3xl font-bold text-white">{formatFare(summary?.pendingBalance ?? 0)}</Text>
            <Pressable
              className="mt-4 flex-row items-center justify-center rounded-xl bg-white/15 py-2.5"
              onPress={() => router.push('/(driver)/wallet/payouts' as any)}
            >
              <Ionicons name="cash-outline" size={16} color="#fff" />
              <Text className="ml-2 font-semibold text-white">{t('driverViewPayouts')}</Text>
            </Pressable>
          </View>

          <View className="mt-4 flex-row gap-3">
            <SummaryCard label={t('driverToday')} amount={summary?.today.amount ?? 0} rides={summary?.today.rides ?? 0} />
            <SummaryCard label={t('thisWeek')} amount={summary?.week.amount ?? 0} rides={summary?.week.rides ?? 0} />
          </View>
          <View className="mt-3 flex-row gap-3">
            <SummaryCard label={t('thisMonth')} amount={summary?.month.amount ?? 0} rides={summary?.month.rides ?? 0} />
            <SummaryCard label={t('driverAllTime')} amount={summary?.total.amount ?? 0} rides={summary?.total.rides ?? 0} />
          </View>

          <Text className="mt-6 text-base font-bold text-ink">{t('driverRecentEarnings')}</Text>
          {history.length === 0 ? (
            <Text className="mt-3 text-sm text-text-secondary">{t('driverNoEarningsYet')}</Text>
          ) : (
            <View className="mt-3 gap-2.5">
              {history.map((entry) => (
                <View key={entry.id} className="flex-row items-center justify-between rounded-xl border border-border bg-white p-3.5">
                  <View className="flex-1 pr-3">
                    <Text numberOfLines={1} className="text-[13.5px] font-semibold text-ink">{entry.destAddress}</Text>
                    <Text className="mt-0.5 text-xs text-text-secondary">
                      {entry.distanceKm.toFixed(1)} km · {entry.paymentMethod} · {t(earningStatusKey(entry.status) as any)}
                    </Text>
                  </View>
                  <Text className="font-bold text-primary">{formatFare(entry.netAmount)}</Text>
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
      <Text className="mt-0.5 text-[11px] text-text-secondary">{t('driverTripsCount', { count: rides })}</Text>
    </View>
  );
}
