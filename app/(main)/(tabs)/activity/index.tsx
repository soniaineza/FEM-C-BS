import { useEffect, useState } from 'react';
import { View, Text, SafeAreaView, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';

import { useTranslation } from '../../../../hooks/useTranslation';
import { getRideHistory } from '../../../../services/ride-service';
import { Ride, formatFare } from '../../../../types/ride';

export default function RideHistoryScreen() {
  const { t } = useTranslation();
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRideHistory()
      .then(setRides)
      .finally(() => setLoading(false));
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-bg-light">
      <View className="flex-1 px-6 pt-10">
        <Text className="text-2xl font-bold text-ink">{t('rideHistory')}</Text>

        {loading ? (
          <ActivityIndicator className="mt-8" color="#16A34A" />
        ) : rides.length === 0 ? (
          <Text className="mt-8 text-text-secondary">{t('noRidesYet')}</Text>
        ) : (
          <FlatList
            className="mt-4"
            data={rides}
            keyExtractor={(r) => r.id}
            renderItem={({ item }) => (
              <Pressable
                className="mb-3 rounded border border-border bg-white p-4"
                onPress={() => router.push({ pathname: '/(main)/(tabs)/activity/[rideId]', params: { rideId: item.id } })}
              >
                <View className="flex-row justify-between">
                  <Text className="text-base font-medium text-ink">{item.destination.address}</Text>
                  <Text className="font-semibold text-primary">{formatFare(item.finalFare ?? item.estimatedFare)}</Text>
                </View>
                <Text className="mt-1 text-xs text-text-secondary">{item.status}</Text>
              </Pressable>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
