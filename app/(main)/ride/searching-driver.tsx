import { useEffect } from 'react';
import { View, Text, SafeAreaView, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '../../../components/Button';
import { useTranslation } from '../../../hooks/useTranslation';
import { useRideTracking } from '../../../hooks/useRideTracking';
import { cancelRide } from '../../../services/ride-service';

export default function SearchingDriverScreen() {
  const { t } = useTranslation();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { ride } = useRideTracking(rideId ?? null);

  useEffect(() => {
    if (ride && ride.status !== 'searchingDriver' && ride.status !== 'scheduled') {
      router.replace({ pathname: '/(main)/ride/driver-accepted', params: { rideId: ride.id } });
    }
    if (ride && ride.status === 'cancelled') {
      router.replace('/(main)/(tabs)');
    }
  }, [ride]);

  async function handleCancel() {
    if (!rideId) return;
    try {
      await cancelRide(rideId);
    } finally {
      router.replace('/(main)/(tabs)');
    }
  }

  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-white px-6">
      <ActivityIndicator size="large" color="#16A34A" />
      <Text className="mt-6 text-xl font-bold text-ink">{t('findingDriver')}</Text>
      <Text className="mt-2 text-center text-text-secondary">{t('matchingDriver')}</Text>

      <View className="mt-10 w-full">
        <Button title={t('cancelRide')} variant="outline" onPress={handleCancel} />
      </View>
    </SafeAreaView>
  );
}
