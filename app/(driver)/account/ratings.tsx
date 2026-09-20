import { useEffect, useState } from 'react';
import { View, Text, SafeAreaView, FlatList, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { BackHeader } from '../../../components/BackHeader';
import { useTranslation } from '../../../hooks/useTranslation';
import { getDriverRatings } from '../../../services/driver-profile-service';
import { DriverRating, DriverRatingSummary } from '../../../types/driver';

export default function DriverRatingsScreen() {
  const { t } = useTranslation();
  const [ratings, setRatings] = useState<DriverRating[]>([]);
  const [summary, setSummary] = useState<DriverRatingSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDriverRatings()
      .then((r) => {
        setRatings(r.ratings);
        setSummary(r.summary);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6 pt-2">
        <BackHeader />
        <Text className="mt-2 text-xl font-bold text-ink">{t('ratings')}</Text>

        {loading ? (
          <ActivityIndicator className="mt-8" color="#16A34A" />
        ) : (
          <>
            <View className="mt-4 flex-row items-center rounded-2xl border border-border p-4">
              <Text className="text-3xl font-bold text-ink">{summary?.average.toFixed(1) ?? '—'}</Text>
              <View className="ml-4 flex-1">
                {[5, 4, 3, 2, 1].map((stars) => {
                  const count = summary?.breakdown.find((b) => b.stars === stars)?.count ?? 0;
                  const total = summary?.total || 1;
                  return (
                    <View key={stars} className="mb-1 flex-row items-center">
                      <Text className="w-4 text-xs text-text-secondary">{stars}</Text>
                      <Ionicons name="star" size={11} color="#D97706" />
                      <View className="ml-2 h-1.5 flex-1 overflow-hidden rounded-full bg-gray-light">
                        <View className="h-1.5 rounded-full bg-warning" style={{ width: `${(count / total) * 100}%` }} />
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            <FlatList
              className="mt-4"
              data={ratings}
              keyExtractor={(_, i) => String(i)}
              ListEmptyComponent={<Text className="mt-6 text-text-secondary">{t('driverNoRatingsYet')}</Text>}
              renderItem={({ item }) => (
                <View className="border-b border-border py-3">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-[14.5px] font-semibold text-ink">{item.passengerName}</Text>
                    <View className="flex-row items-center">
                      <Ionicons name="star" size={13} color="#D97706" />
                      <Text className="ml-1 text-[13px] text-ink">{item.rating}</Text>
                    </View>
                  </View>
                  {item.comment ? <Text className="mt-1 text-[13px] text-text-secondary">{item.comment}</Text> : null}
                </View>
              )}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
