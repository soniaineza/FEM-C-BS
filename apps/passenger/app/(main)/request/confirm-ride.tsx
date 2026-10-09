import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaViewPlaceholder } from '@kimu/shared/components/SafeAreaViewPlaceholder';
import { ScreenShell } from '@kimu/shared/components/ScreenShell';
import { router } from 'expo-router';

import { Button } from '@kimu/shared/components/Button';
import { Input } from '@kimu/shared/components/Input';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { useRideWizardStore } from '../../../stores/useRideWizardStore';
import { useAuthStore } from '../../../stores/useAuthStore';
import { requestRide } from '../../../services/ride-service';
import { getWallet } from '../../../services/wallet-service';
import { formatFare } from '@kimu/shared/types/ride';
import { ApiError } from '../../../services/api-client';

export default function ConfirmRideScreen() {
  const { t } = useTranslation();
  const wizard = useRideWizardStore();
  const currentUser = useAuthStore((st) => st.currentUser);
  const { pickup, destination, vehicle, fareEstimate, paymentMethod, paymentPhone, rideType, seats, note, setNote, reset } = wizard;

  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  // Real balance from the backend — only fetched when wallet is the chosen
  // method, so the wallet insufficient-balance warning reflects actual data.
  const isWalletPayment = paymentMethod?.type === 'wallet';
  useEffect(() => {
    if (!isWalletPayment) return;
    getWallet()
      .then((w) => setWalletBalance(w.balance))
      .catch(() => setWalletBalance(null));
  }, [isWalletPayment]);

  const fare = fareEstimate?.estimatedFare ?? 0;
  const walletShort = isWalletPayment && walletBalance != null && walletBalance < fare;

  async function handleConfirm() {
    if (!pickup || !destination || !vehicle || !paymentMethod) return;
    setError(undefined);
    setLoading(true);
    try {
      const ride = await requestRide({
        pickup,
        destination,
        vehicle,
        paymentMethod,
        rideType,
        seats,
        // Only sent when it differs from the account phone, which is the server's default.
        paymentPhone: paymentMethod.type === 'mobileMoney' && paymentPhone.trim() && paymentPhone.trim() !== currentUser?.phone
          ? paymentPhone.trim()
          : undefined,
        note: note.trim() || undefined,
        quoteId: fareEstimate?.quoteId,
      });
      reset();
      router.replace({ pathname: '/(main)/ride/searching-driver', params: { rideId: ride.id } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }

  if (!pickup || !destination || !vehicle || !paymentMethod) {
    return (
      <SafeAreaViewPlaceholder className="flex-1 items-center justify-center bg-white">
        <Text className="font-sans text-text-secondary">{t('selectPickupFirst')}</Text>
      </SafeAreaViewPlaceholder>
    );
  }

  return (
    <ScreenShell title={t('confirmRide')} back background="bg-white" backLabel={t('back')}>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerClassName="flex-grow px-6 pt-2 pb-8">

        <View className="mt-4 gap-2 rounded border border-border p-4">
          <Text className="font-sans text-ink">{pickup.address}</Text>
          <Text className="font-sans text-ink">{destination.address}</Text>
          <View className="mt-2 flex-row justify-between">
            <Text className="font-sans text-text-secondary">{vehicle.name}</Text>
            <Text className="font-sans text-text-secondary">{paymentMethod.name}</Text>
          </View>
          {fareEstimate ? (
            <View className="mt-2 flex-row justify-between">
              <Text className="text-base font-semibold text-ink">{t('fare')}</Text>
              <Text className="text-lg font-bold text-primary">{formatFare(fareEstimate.estimatedFare)}</Text>
            </View>
          ) : null}
        </View>

        <View className="mt-4">
          <Input
            label={t('rideNoteOptional')}
            value={note}
            onChangeText={setNote}
            placeholder={t('rideNoteHint')}
          />
        </View>

        {isWalletPayment ? (
          walletBalance == null ? (
            <Text className="font-sans mt-4 text-xs text-text-secondary">{t('checkingWalletBalance')}</Text>
          ) : walletShort ? (
            <View className="mt-4 rounded-xl border px-3.5 py-3" style={{ backgroundColor: 'rgba(220,38,38,0.06)', borderColor: 'rgba(220,38,38,0.3)' }}>
              <Text className="font-semibold text-error">{t('insufficientWalletBalance')}</Text>
              <Text className="font-sans mt-1 text-xs text-text-secondary">
                {t('walletBalanceLabel')}: {formatFare(walletBalance)} · {t('fare')}: {formatFare(fare)}
              </Text>
              <Pressable className="mt-2 self-start" onPress={() => router.push('/(main)/(tabs)/wallet')}>
                <Text className="font-semibold text-primary">{t('addMoney')}</Text>
              </Pressable>
            </View>
          ) : (
            <Text className="font-sans mt-4 text-xs text-text-secondary">
              {t('walletBalanceLabel')}: {formatFare(walletBalance)}
            </Text>
          )
        ) : null}

        <Text className="font-sans mt-4 text-xs text-text-secondary">{t('confirmRideNotice')}</Text>
        {error ? <Text className="font-sans mt-2 text-sm text-error">{error}</Text> : null}

        <View className="mt-8">
          <Button
            title={t('requestRide')}
            onPress={handleConfirm}
            loading={loading}
            disabled={walletShort}
          />
        </View>
      </KeyboardAwareScrollView>
    </ScreenShell>
  );
}
