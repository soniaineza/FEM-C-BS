import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { KeyboardFormScrollView } from '../../../components/layout/KeyboardFormScrollView';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';
import { router } from 'expo-router';

import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { Input } from '../../../components/Input';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { useTranslation } from '../../../hooks/useTranslation';
import { useRideWizardStore } from '../../../stores/useRideWizardStore';
import { requestRide } from '../../../services/ride-service';
import { getWallet } from '../../../services/wallet-service';
import { formatFare } from '../../../types/ride';
import { ApiError } from '../../../services/api-client';
import { Colors } from '../../../constants/theme';

export default function ConfirmRideScreen() {
  const { t } = useTranslation();
  const wizard = useRideWizardStore();
  const { pickup, destination, vehicle, fareEstimate, paymentMethod, rideType, note, setNote, reset } = wizard;

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
      <SafeAreaViewPlaceholder className="flex-1 items-center justify-center bg-surface">
        <Text className="text-fg-muted">{t('selectPickupFirst')}</Text>
      </SafeAreaViewPlaceholder>
    );
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-surface">
      <KeyboardFormScrollView>
        <ScreenHeader back title={t('confirmRide')} />

        <Card className="mt-4 gap-2">
          <Text className="text-fg">{pickup.address}</Text>
          <Text className="text-fg">{destination.address}</Text>
          <View className="mt-2 flex-row justify-between">
            <Text className="text-fg-muted">{vehicle.name}</Text>
            <Text className="text-fg-muted">{paymentMethod.name}</Text>
          </View>
          {fareEstimate ? (
            <View className="mt-2 flex-row justify-between">
              <Text className="text-body font-semibold text-fg">{t('fare')}</Text>
              <Text className="text-title-3 font-bold text-primary-text">{formatFare(fareEstimate.estimatedFare)}</Text>
            </View>
          ) : null}
        </Card>

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
            <Text className="mt-4 text-caption text-fg-muted">{t('checkingWalletBalance')}</Text>
          ) : walletShort ? (
            <View className="mt-4 rounded-xl border px-3.5 py-3" style={{ backgroundColor: Colors['danger-soft'], borderColor: 'rgba(220,38,38,0.3)' }}>
              <Text className="font-semibold text-danger">{t('insufficientWalletBalance')}</Text>
              <Text className="mt-1 text-caption text-fg-muted">
                {t('walletBalanceLabel')}: {formatFare(walletBalance)} · {t('fare')}: {formatFare(fare)}
              </Text>
              <Pressable className="mt-2 self-start" onPress={() => router.push('/(main)/(tabs)/wallet')}>
                <Text className="font-semibold text-primary-text">{t('addMoney')}</Text>
              </Pressable>
            </View>
          ) : (
            <Text className="mt-4 text-caption text-fg-muted">
              {t('walletBalanceLabel')}: {formatFare(walletBalance)}
            </Text>
          )
        ) : null}

        <Text className="mt-4 text-caption text-fg-muted">{t('confirmRideNotice')}</Text>
        {error ? <Text className="mt-2 text-subhead text-danger">{error}</Text> : null}

        <View className="mt-8">
          <Button
            title={t('requestRide')}
            onPress={handleConfirm}
            loading={loading}
            disabled={walletShort}
          />
        </View>
      </KeyboardFormScrollView>
    </SafeAreaViewPlaceholder>
  );
}
