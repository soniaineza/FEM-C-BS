import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';
import { goBack } from '../../../utils/navigation';

import { Button } from '../../../components/Button';
import { Input } from '../../../components/Input';
import { ErrorMessage } from '../../../components/ErrorMessage';
import { BackHeader } from '../../../components/BackHeader';
import { useAuthStore } from '../../../stores/useAuthStore';
import { useTranslation } from '../../../hooks/useTranslation';
import { topUpWallet, refreshWalletTopup, WalletTopup } from '../../../services/wallet-service';
import { formatFare } from '../../../types/ride';
import { ApiError } from '../../../services/api-client';

const QUICK_AMOUNTS = [1000, 2000, 5000, 10000, 20000];

// Deposit money into the FEM Wallet: enter the mobile money number to charge
// and the amount, same phone+amount shape as any other mobile-money top-up.
// Goes through the real Paypack collect flow (services/wallet-service.ts);
// when no processor is configured this honestly stays pending rather than
// pretending the deposit succeeded — matching this app's payment screens.
export default function WalletTopUpScreen() {
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.currentUser);
  const [phone, setPhone] = useState(currentUser?.phone ?? '');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [topup, setTopup] = useState<WalletTopup | null>(null);

  async function handleDeposit() {
    const value = Number(amount);
    if (!phone.trim()) return setError(t('enterMomoNumber'));
    if (!Number.isFinite(value) || value <= 0) return setError(t('enterValidAmount'));
    setError(undefined);
    setLoading(true);
    try {
      setTopup(await topUpWallet({ phone: phone.trim(), amount: value }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('depositFailedStart'));
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckStatus() {
    if (!topup) return;
    setChecking(true);
    try {
      const updated = await refreshWalletTopup(topup.id);
      setTopup(updated);
      if (updated.status === 'succeeded') goBack();
    } catch {
      // Keep showing the last known state — a transient check failure isn't fatal.
    } finally {
      setChecking(false);
    }
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-white">
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerClassName="px-6 pb-10">
        <BackHeader />
        <Text className="mt-2 text-xl font-bold text-ink">{t('topUpTitle')}</Text>
        <Text className="mt-1 text-sm text-text-secondary">{t('topUpSubtitle')}</Text>

        {!topup ? (
          <View className="mt-6 gap-4">
            <Input label={t('mobileMoneyNumber')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" prefixIcon="call-outline" />
            <View>
              <Text className="mb-1.5 text-sm font-medium text-ink">{t('amountRwf')}</Text>
              <Input value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder={t('amountRwf')} prefixIcon="cash-outline" />
              <View className="mt-2.5 flex-row flex-wrap gap-2">
                {QUICK_AMOUNTS.map((a) => (
                  <Pressable key={a} className="rounded-full border border-border px-3 py-1.5" onPress={() => setAmount(String(a))}>
                    <Text className="text-[13px] text-ink">{formatFare(a)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            {error ? <ErrorMessage message={error} /> : null}
            <Button title={t('deposit')} onPress={handleDeposit} loading={loading} />
          </View>
        ) : (
          <View className="mt-6 rounded-2xl border border-border p-5">
            <Text className="text-sm text-text-secondary">{t('depositing')}</Text>
            <Text className="mt-1 text-2xl font-bold text-ink">{formatFare(topup.amount)}</Text>
            <Text className="mt-1 text-xs text-text-secondary">{t('depositTo', { phone: topup.phone })}</Text>

            {topup.status === 'succeeded' ? (
              <Text className="mt-4 font-semibold text-primary">{t('depositReceived')}</Text>
            ) : topup.status === 'failed' ? (
              <Text className="mt-4 font-semibold text-error">{t('depositFailed')}</Text>
            ) : (
              <>
                <Text className="mt-4 text-sm text-text-secondary">{t('depositPendingHint')}</Text>
                <View className="mt-3">
                  <Button title={t('checkStatus')} variant="outline" onPress={handleCheckStatus} loading={checking} />
                </View>
              </>
            )}
            {topup.status !== 'succeeded' ? (
              <Pressable className="mt-4 items-center" onPress={() => setTopup(null)}>
                <Text className="text-sm font-semibold text-text-secondary">{t('startOver')}</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaViewPlaceholder>
  );
}
