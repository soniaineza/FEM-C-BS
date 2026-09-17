import { useState } from 'react';
import { View, Text, SafeAreaView, ScrollView } from 'react-native';
import { router } from 'expo-router';

import { Button } from '../../../components/Button';
import { Input } from '../../../components/Input';
import { useTranslation } from '../../../hooks/useTranslation';
import { useRideWizardStore } from '../../../stores/useRideWizardStore';
import { requestRide } from '../../../services/ride-service';
import { formatFare } from '../../../types/ride';
import { ApiError } from '../../../services/api-client';

export default function ConfirmRideScreen() {
  const { t } = useTranslation();
  const wizard = useRideWizardStore();
  const { pickup, destination, vehicle, fareEstimate, paymentMethod, rideType, note, setNote, reset } = wizard;

  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

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
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <Text className="text-text-secondary">{t('selectPickupFirst')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerClassName="flex-grow px-6 pt-6 pb-8">
        <Text className="text-xl font-bold text-ink">{t('confirmRide')}</Text>

        <View className="mt-4 gap-2 rounded border border-border p-4">
          <Text className="text-ink">{pickup.address}</Text>
          <Text className="text-ink">{destination.address}</Text>
          <View className="mt-2 flex-row justify-between">
            <Text className="text-text-secondary">{vehicle.name}</Text>
            <Text className="text-text-secondary">{paymentMethod.name}</Text>
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

        <Text className="mt-4 text-xs text-text-secondary">{t('confirmRideNotice')}</Text>
        {error ? <Text className="mt-2 text-sm text-error">{error}</Text> : null}

        <View className="mt-8">
          <Button title={t('requestRide')} onPress={handleConfirm} loading={loading} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
