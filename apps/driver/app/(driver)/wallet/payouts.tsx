import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaViewPlaceholder } from '@kimu/shared/components/SafeAreaViewPlaceholder';

import { BackHeader } from '@kimu/shared/components/BackHeader';
import { Button } from '@kimu/shared/components/Button';
import { Input } from '@kimu/shared/components/Input';
import { ErrorMessage } from '@kimu/shared/components/ErrorMessage';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { getDriverPayouts, quoteDriverPayout, requestDriverPayout, settleDriverCommission } from '../../../services/driver-profile-service';
import { ApiError } from '../../../services/driver-api-client';
import { DriverBalance, DriverPayout, DriverPayoutQuote } from '../../../types/driver';
import { formatFare } from '@kimu/shared/types/ride';

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

// The driver's account with the platform: money available to withdraw (fares
// paid digitally), or commission owed on cash trips, plus payout history.
// Withdrawals are requested here and sent once an operator approves them.
export default function DriverPayoutsScreen() {
  const { t } = useTranslation();
  const [payouts, setPayouts] = useState<DriverPayout[]>([]);
  const [balance, setBalance] = useState<DriverBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [amount, setAmount] = useState('');
  const [actionError, setActionError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  // The server's figures for the typed amount, shown for the driver to confirm.
  const [quote, setQuote] = useState<DriverPayoutQuote | null>(null);

  function load() {
    setLoading(true);
    setError(undefined);
    getDriverPayouts()
      .then((res) => {
        setPayouts(res.payouts);
        setBalance(res.balance);
      })
      .catch(() => setError(t('requestFailed')))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const payoutInProgress = payouts.some((p) => p.status === 'pending' || p.status === 'processing');
  const canWithdraw = !!balance && balance.available >= balance.minPayout && !payoutInProgress;

  async function run(action: () => Promise<string>) {
    setActionError(undefined);
    setNotice(undefined);
    setSubmitting(true);
    try {
      setNotice(await action());
      const res = await getDriverPayouts();
      setPayouts(res.payouts);
      setBalance(res.balance);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t('requestFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  function handleWithdraw() {
    const value = Math.floor(Number(amount.replace(/[^\d.]/g, '')));
    if (!balance || !Number.isFinite(value) || value < balance.minPayout || value > balance.available) {
      setNotice(undefined);
      setActionError(t('driverPayoutAmountInvalid', {
        min: formatFare(balance?.minPayout ?? 0),
        max: formatFare(Math.floor(balance?.available ?? 0)),
      }));
      return;
    }
    // Step 1: ask the server what this payout costs. Nothing is requested yet.
    setActionError(undefined);
    setNotice(undefined);
    setSubmitting(true);
    quoteDriverPayout(value)
      .then(setQuote)
      .catch((err) => setActionError(err instanceof ApiError ? err.message : t('requestFailed')))
      .finally(() => setSubmitting(false));
  }

  // Step 2: the driver has seen the fee and what they will receive.
  function handleConfirmPayout() {
    if (!quote) return;
    const value = quote.requestedAmount;
    run(async () => {
      await requestDriverPayout(value);
      setAmount('');
      setQuote(null);
      return t('driverPayoutRequested');
    });
  }

  function handleSettle() {
    run(async () => {
      const settlement = await settleDriverCommission();
      return t(settlement.status === 'succeeded' ? 'driverCommissionPaid' : 'driverCommissionPaymentStarted');
    });
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-white">
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerClassName="px-6 pt-2 pb-10">
        <BackHeader />
        <Text className="mt-2 text-xl text-ink font-display">{t('driverPayouts')}</Text>

        {loading ? (
          <ActivityIndicator className="mt-8" color="#0E7C4A" />
        ) : error || !balance ? (
          <View className="mt-8 gap-4">
            <Text className="text-center text-error">{error ?? t('requestFailed')}</Text>
            <Button title={t('tryAgain')} variant="outline" onPress={load} />
          </View>
        ) : (
          <>
            {balance.owed > 0 ? (
              <View className="mt-4 rounded-2xl border border-error/40 bg-error/5 p-4">
                <Text className="text-xs font-medium text-text-secondary">{t(balance.driverShareRate ? 'driverCommissionOwed' : 'driverCashToRemit')}</Text>
                <Text className="mt-1 text-2xl font-bold text-error">{formatFare(Math.ceil(balance.owed))}</Text>
                <Text className="mt-1 text-xs text-text-secondary">
                  {t(balance.blocked ? 'driverCommissionBlocked' : balance.driverShareRate ? 'driverCommissionOwedHint' : 'driverCashToRemitHint', { limit: formatFare(balance.debtLimit) })}
                </Text>
                <View className="mt-3">
                  <Button title={t(balance.driverShareRate ? 'driverPayCommission' : 'driverSendCash')} onPress={handleSettle} loading={submitting} />
                </View>
              </View>
            ) : (
              <View className="mt-4 rounded-2xl border border-border bg-white p-4">
                <Text className="text-xs font-medium text-text-secondary">{t('driverAvailableBalance')}</Text>
                <Text className="mt-1 text-2xl font-bold text-primary">{formatFare(Math.floor(balance.available))}</Text>
                <Text className="mt-1 text-xs text-text-secondary">
                  {payoutInProgress
                    ? t('driverPayoutInProgress')
                    : t('driverPayoutHint', { min: formatFare(balance.minPayout) })}
                </Text>
                {canWithdraw && quote ? (
                  <View className="mt-3 gap-3">
                    <View className="rounded-xl bg-gray-light p-3">
                      <QuoteRow label={t('driverPayoutAmount')} value={formatFare(quote.requestedAmount)} />
                      <QuoteRow label={t('driverPayoutFee')} value={`- ${formatFare(quote.fee)}`} />
                      <View className="my-1.5 h-px bg-border" />
                      <QuoteRow label={t('driverPayoutYouReceive')} value={formatFare(quote.amountReceived)} strong />
                    </View>
                    <Button title={t('driverConfirmPayout')} onPress={handleConfirmPayout} loading={submitting} />
                    <Button title={t('cancel')} variant="outline" onPress={() => setQuote(null)} disabled={submitting} />
                  </View>
                ) : canWithdraw ? (
                  <View className="mt-3 gap-3">
                    <Input
                      label={t('driverPayoutAmount')}
                      value={amount}
                      onChangeText={setAmount}
                      keyboardType="number-pad"
                      placeholder={String(Math.floor(balance.available))}
                      prefixIcon="cash-outline"
                    />
                    <Button title={t('driverRequestPayout')} onPress={handleWithdraw} loading={submitting} />
                  </View>
                ) : null}
              </View>
            )}

            {actionError ? <View className="mt-3"><ErrorMessage message={actionError} /></View> : null}
            {notice ? <Text className="mt-3 text-sm font-medium text-primary">{notice}</Text> : null}

            <Text className="mt-7 text-base font-bold text-ink">{t('driverPayoutHistory')}</Text>
            {payouts.length === 0 ? (
              <Text className="mt-3 text-text-secondary">{t('driverNoPayoutsYet')}</Text>
            ) : (
              <View className="mt-3">
                {payouts.map((item) => (
                  <View key={item.id} className="mb-3 flex-row items-center justify-between rounded-xl border border-border p-4">
                    <View className="flex-1 pr-3">
                      <Text className="text-base font-semibold text-ink">{formatFare(item.amountReceived ?? item.amount)}</Text>
                      <Text className="mt-0.5 text-xs text-text-secondary">
                        {new Date(item.createdAt).toLocaleDateString()}
                        {item.phone ? ` · ${item.phone}` : ''}
                        {item.fee ? ` · ${t('driverPayoutFee')} ${formatFare(item.fee)}` : ''}
                      </Text>
                    </View>
                    <Text className="text-xs font-semibold" style={{ color: STATUS_COLORS[item.status] }}>
                      {t(STATUS_KEYS[item.status] as any)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </KeyboardAwareScrollView>
    </SafeAreaViewPlaceholder>
  );
}

function QuoteRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="flex-row items-center justify-between py-1">
      <Text className={strong ? 'text-sm font-bold text-ink' : 'text-sm text-text-secondary'}>{label}</Text>
      <Text className={strong ? 'text-base font-bold text-primary' : 'text-sm font-semibold text-ink'}>{value}</Text>
    </View>
  );
}
