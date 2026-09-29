import { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';
import { Ionicons } from '@expo/vector-icons';

import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { useTranslation } from '../../../hooks/useTranslation';
import { useResponsive } from '../../../hooks/useResponsive';
import { getDriverRatings } from '../../../services/driver-profile-service';
import { DriverRating, DriverRatingSummary } from '../../../types/driver';
import { Colors } from '../../../constants/theme';
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui';

export default function DriverRatingsScreen() {
  const { t } = useTranslation();
  const { contentStyle } = useResponsive();
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
    <SafeAreaViewPlaceholder className="flex-1 bg-surface">
      <View style={[{ flex: 1 }, contentStyle]} className="px-5 pt-2">
        <ScreenHeader back title={t('ratings')} />

        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} retryLabel={t('tryAgain')} onRetry={load} />
        ) : (
          <>
            <Card padded={false} className="mt-4 flex-row items-center p-4">
              <Text className="text-large-title font-bold text-fg">{summary?.average.toFixed(1) ?? '—'}</Text>
              <View className="ml-4 flex-1">
                {[5, 4, 3, 2, 1].map((stars) => {
                  const count = summary?.breakdown.find((b) => b.stars === stars)?.count ?? 0;
                  const total = summary?.total || 1;
                  return (
                    <View key={stars} className="mb-1 flex-row items-center">
                      <Text className="w-4 text-caption text-fg-muted">{stars}</Text>
                      <Ionicons name="star" size={11} color={Colors.warning} />
                      <View className="ml-2 h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
                        <View className="h-1.5 rounded-full bg-warning" style={{ width: `${(count / total) * 100}%` }} />
                      </View>
                    </View>
                  );
                })}
              </View>
            </Card>

            <FlatList
              className="mt-4"
              data={ratings}
              keyExtractor={(_, i) => String(i)}
              ListEmptyComponent={<EmptyState icon="star-outline" title={t('driverNoRatingsYet')} />}
              renderItem={({ item }) => (
                <View className="border-b border-border py-3">
                  <View className="flex-row items-center justify-between">
                    <Text className="flex-1 pr-2 text-subhead font-semibold text-fg">{item.passengerName}</Text>
                    <View className="flex-row items-center">
                      <Ionicons name="star" size={13} color={Colors.warning} />
                      <Text className="ml-1 text-footnote text-fg">{item.rating}</Text>
                    </View>
                  </View>
                  {item.comment ? <Text className="mt-1 text-footnote text-fg-muted">{item.comment}</Text> : null}
                </View>
              )}
            />
          </>
        )}
      </View>
    </SafeAreaViewPlaceholder>
  );
}
