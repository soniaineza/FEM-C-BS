import { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { ScreenShell } from '@kimu/shared/components/ScreenShell';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Button } from '@kimu/shared/components/Button';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { getDriverRatings } from '../../../services/driver-profile-service';
import { DriverRating, DriverRatingSummary } from '../../../types/driver';

export default function DriverRatingsScreen() {
  const { t } = useTranslation();
  const [ratings, setRatings] = useState<DriverRating[]>([]);
  const [summary, setSummary] = useState<DriverRatingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  function load() {
    setLoading(true);
    setError(undefined);
    getDriverRatings()
      .then((r) => {
        setRatings(r.ratings);
        setSummary(r.summary);
      })
      .catch(() => setError(t('requestFailed')))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  return (
    <ScreenShell title={t('ratings')} back background="bg-white" backLabel={t('back')}>
      <View className="flex-1 px-6 pt-2">

        {loading ? (
          <ActivityIndicator className="mt-8" color="#0E7C4A" />
        ) : error ? (
          <View className="mt-8 gap-4">
            <Text className="font-sans text-center text-error">{error}</Text>
            <Button title={t('tryAgain')} variant="outline" onPress={load} />
          </View>
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
                      <Text className="font-sans w-4 text-xs text-text-secondary">{stars}</Text>
                      <Ionicons name="star" size={11} color="#F97316" />
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
              ListEmptyComponent={<Text className="font-sans mt-6 text-text-secondary">{t('driverNoRatingsYet')}</Text>}
              renderItem={({ item }) => (
                <View className="border-b border-border py-3">
                  <View className="flex-row items-center justify-between">
                    <Text className="text-[14.5px] font-semibold text-ink">{item.passengerName}</Text>
                    <View className="flex-row items-center">
                      <Ionicons name="star" size={13} color="#F97316" />
                      <Text className="font-sans ml-1 text-[13px] text-ink">{item.rating}</Text>
                    </View>
                  </View>
                  {item.comment ? <Text className="font-sans mt-1 text-[13px] text-text-secondary">{item.comment}</Text> : null}
                </View>
              )}
            />
          </>
        )}
      </View>
    </ScreenShell>
  );
}
