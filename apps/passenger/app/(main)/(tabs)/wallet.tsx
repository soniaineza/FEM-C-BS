import { useCallback, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, Pressable } from 'react-native';
import { SafeAreaViewPlaceholder } from '@kimu/shared/components/SafeAreaViewPlaceholder';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { Button } from '@kimu/shared/components/Button';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { getWallet, Wallet, WalletTransaction } from '../../../services/wallet-service';
import { formatFare } from '@kimu/shared/types/ride';
import { ApiError } from '../../../services/api-client';

// Wallet must never show a wrong balance: while loading it shows a spinner,
// and if the backend is unreachable (Render cold start, offline) it shows an
// explicit error card with a retry action instead of a fake RWF 0 balance.
export default function WalletScreen() {
  const { t } = useTranslation();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const load = useCallback(() => {
    setLoading(true);
    setError(undefined);
    getWallet()
      .then(setWallet)
      .catch((err) => setError(err instanceof ApiError ? err.message : t('requestFailed')))
      .finally(() => setLoading(false));
  }, [t]);

  useFocusEffect(load);

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-bg-light" edges={['top', 'left', 'right']}>
      <View className="px-5 pt-4">
        <Text className="text-xl text-ink font-display">{t('wallet')}</Text>

        <View
          className="mt-4 rounded-2xl bg-primary p-5"
          style={{ shadowColor: '#0E7C4A', shadowOpacity: 0.26, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 4 }}
        >
          <Text className="text-sm font-medium text-white/85">{t('balance')}</Text>
          {loading ? (
            <ActivityIndicator className="mt-2" color="#fff" />
          ) : error ? (
            <Text className="mt-1 text-lg font-semibold text-white/90">—</Text>
          ) : (
            <Text className="mt-1 text-3xl font-bold text-white">{formatFare(wallet?.balance ?? 0)}</Text>
          )}
          <Pressable
            className="mt-4 flex-row items-center justify-center rounded-xl bg-white/15 py-2.5"
            onPress={() => router.push('/(main)/wallet/top-up' as any)}
          >
            <Ionicons name="add-circle-outline" size={16} color="#fff" />
            <Text className="ml-2 font-semibold text-white">{t('topUp')}</Text>
          </Pressable>
        </View>
      </View>

      <View className="mt-5 flex-1 px-5">
        {!loading && error ? (
          <View className="mt-10 items-center">
            <Ionicons name="cloud-offline-outline" size={40} color="#6B7280" />
            <Text className="mt-3 text-center text-text-secondary">{error}</Text>
            <View className="mt-4 min-w-[160px]">
              <Button title={t('tryAgain')} variant="outline" onPress={load} />
            </View>
          </View>
        ) : !loading && (wallet?.transactions.length ?? 0) === 0 ? (
          <View className="mt-10 items-center">
            <Ionicons name="receipt-outline" size={40} color="#6B7280" />
            <Text className="mt-3 text-text-secondary">{t('walletTransactionsEmpty')}</Text>
          </View>
        ) : (
          <FlatList
            data={wallet?.transactions ?? []}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <TransactionRow transaction={item} />}
          />
        )}
      </View>
    </SafeAreaViewPlaceholder>
  );
}

function TransactionRow({ transaction }: { transaction: WalletTransaction }) {
  const isCredit = transaction.type === 'credit';
  return (
    <View className="mb-2 flex-row items-center rounded-xl border border-border bg-white px-3.5 py-3">
      <Ionicons
        name={isCredit ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
        size={28}
        color={isCredit ? '#0E7C4A' : '#DC2626'}
      />
      <View className="ml-3 flex-1">
        <Text className="text-[14px] font-semibold capitalize text-ink">{transaction.source.replace(/_/g, ' ')}</Text>
        <Text className="text-xs text-text-secondary">{new Date(transaction.createdAt).toLocaleDateString()}</Text>
      </View>
      <Text className={`text-base font-bold ${isCredit ? 'text-primary' : 'text-error'}`}>
        {isCredit ? '+' : '-'}
        {formatFare(transaction.amount)}
      </Text>
    </View>
  );
}
