import { useState } from 'react';
import { View, Text, SafeAreaView, Pressable } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '../../../components/Button';
import { Input } from '../../../components/Input';
import { useTranslation } from '../../../hooks/useTranslation';
import { rateRide } from '../../../services/ride-service';
import { ApiError } from '../../../services/api-client';

export default function RatingScreen() {
  const { t } = useTranslation();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();

  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!rideId) return;
    setError(undefined);
    setLoading(true);
    try {
      await rateRide(rideId, stars, comment.trim() || undefined);
      router.replace('/(main)/(tabs)');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('ratingSaveFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6 pt-10">
        <Text className="text-2xl font-bold text-ink">{t('howWasRide')}</Text>

        <View className="mt-6 flex-row justify-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} onPress={() => setStars(n)}>
              <Text className={`text-4xl ${n <= stars ? 'text-primary' : 'text-border'}`}>{'★'}</Text>
            </Pressable>
          ))}
        </View>

        <View className="mt-6">
          <Input value={comment} onChangeText={setComment} placeholder="Add a comment (optional)" multiline />
        </View>
        {error ? <Text className="mt-2 text-sm text-error">{error}</Text> : null}

        <View className="mt-8">
          <Button title={t('submitRating')} onPress={handleSubmit} loading={loading} />
        </View>
      </View>
    </SafeAreaView>
  );
}
