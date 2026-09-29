import { useCallback, useState } from 'react';
import { View, FlatList, ActivityIndicator } from 'react-native';
import { Pressable } from '../../../components/ui/Pressable';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';

import { Card } from '../../../components/Card';
import { EmptyState, ErrorState, ScreenHeader, Text } from '../../../components/ui';
import { Colors } from '../../../constants/theme';
import { useResponsive } from '../../../hooks/useResponsive';
import { useTranslation } from '../../../hooks/useTranslation';
import { getWallet, Wallet, WalletTransaction } from '../../../services/wallet-service';
import { formatFare } from '../../../types/ride';
import { ApiError } from '../../../services/api-client';

// Wallet must never show a wrong balance: while loading it shows a spinner,
// and if the backend is unreachable (Render cold start, offline) it shows an
// explicit error card with a retry action instead of a fake RWF 0 balance.
export default function WalletScreen() {
  const { t } = useTranslation();
  const { contentStyle } = useResponsive();
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
    <SafeAreaViewPlaceholder className="flex-1 bg-canvas" edges={['top', 'left', 'right']}>
      <View style={[{ flex: 1 }, contentStyle]} className="px-5 pt-3">
        <ScreenHeader title={t('wallet')} />

        <Card tone="primary" className="mt-3">
          <Text variant="subhead" weight="medium" tone="inverse" style={{ opacity: 0.85 }}>{t('balance')}</Text>
          {loading ? (
            <ActivityIndicator style={{ marginTop: 12, alignSelf: 'flex-start' }} color={Colors['fg-inverse']} />
          ) : (
            <Text variant="large-title" tone="inverse" style={{ marginTop: 4 }}>
              {error ? '—' : formatFare(wallet?.balance ?? 0)}
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            className="mt-5 flex-row items-center justify-center self-start rounded-full bg-surface px-4 py-2.5"
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
            onPress={() => router.push('/(main)/wallet/top-up' as any)}
          >
            <Ionicons name="add" size={18} color={Colors['primary-text']} />
            <Text variant="subhead" weight="semibold" tone="primary" style={{ marginLeft: 6 }}>{t('topUp')}</Text>
          </Pressable>
        </Card>

        {!loading && error ? (
          <ErrorState message={error} retryLabel={t('tryAgain')} onRetry={load} />
        ) : !loading && (wallet?.transactions.length ?? 0) === 0 ? (
          <EmptyState icon="receipt-outline" title={t('walletTransactionsEmpty')} />
        ) : (
          <FlatList
            className="mt-6"
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
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
    <View className="mb-2 flex-row items-center rounded-2xl border border-border bg-surface px-4 py-3.5">
      <View
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: isCredit ? Colors['primary-soft'] : Colors['surface-muted'] }}
      >
        <Ionicons name={isCredit ? 'arrow-down' : 'arrow-up'} size={18} color={isCredit ? Colors['primary-text'] : Colors.fg} />
      </View>
      <View className="ml-3 flex-1">
        <Text variant="callout" weight="medium" style={{ textTransform: 'capitalize' }}>{transaction.source.replace(/_/g, ' ')}</Text>
        <Text variant="footnote" tone="muted">{new Date(transaction.createdAt).toLocaleDateString()}</Text>
      </View>
      <Text variant="callout" weight="semibold" tone={isCredit ? 'primary' : 'default'}>
        {isCredit ? '+' : '−'}
        {formatFare(transaction.amount)}
      </Text>
    </View>
  );
}
