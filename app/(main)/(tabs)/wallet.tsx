import { useEffect, useState } from 'react';
import { View, Text, SafeAreaView, FlatList, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTranslation } from '../../../hooks/useTranslation';
import { getWallet, Wallet, WalletTransaction } from '../../../services/wallet-service';
import { formatFare } from '../../../types/ride';

export default function WalletScreen() {
  const { t } = useTranslation();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getWallet()
      .then(setWallet)
      .finally(() => setLoading(false));
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-bg-light">
      <View className="px-5 pt-4">
        <Text className="text-xl font-bold text-ink">Wallet</Text>

        <View
          className="mt-4 rounded-2xl bg-primary p-5"
          style={{ shadowColor: '#16A34A', shadowOpacity: 0.26, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 4 }}
        >
          <Text className="text-sm font-medium text-white/85">Balance</Text>
          {loading ? (
            <ActivityIndicator className="mt-2" color="#fff" />
          ) : (
            <Text className="mt-1 text-3xl font-bold text-white">{formatFare(wallet?.balance ?? 0)}</Text>
          )}
        </View>
      </View>

      <View className="mt-5 flex-1 px-5">
        {!loading && (wallet?.transactions.length ?? 0) === 0 ? (
          <View className="mt-10 items-center">
            <Ionicons name="receipt-outline" size={40} color="#6B7280" />
            <Text className="mt-3 text-text-secondary">No transactions yet</Text>
          </View>
        ) : (
          <FlatList
            data={wallet?.transactions ?? []}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <TransactionRow transaction={item} />}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function TransactionRow({ transaction }: { transaction: WalletTransaction }) {
  const isCredit = transaction.type === 'credit';
  return (
    <View className="mb-2 flex-row items-center rounded-xl border border-border bg-white px-3.5 py-3">
      <Ionicons
        name={isCredit ? 'arrow-down-circle-outline' : 'arrow-up-circle-outline'}
        size={28}
        color={isCredit ? '#16A34A' : '#DC2626'}
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
