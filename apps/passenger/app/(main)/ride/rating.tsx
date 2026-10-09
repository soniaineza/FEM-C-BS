import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ScreenShell } from '@kimu/shared/components/ScreenShell';
import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '@kimu/shared/components/Button';
import { Input } from '@kimu/shared/components/Input';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
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
    <ScreenShell title={t('howWasRide')} back background="bg-white" backLabel={t('back')}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <View className="flex-1 px-6 pt-2">

        <View className="mt-6 flex-row justify-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable
              key={n}
              onPress={() => setStars(n)}
              hitSlop={8}
              accessibilityRole="radio"
              accessibilityState={{ checked: n === stars }}
              aria-checked={n === stars}
              accessibilityLabel={t('starsA11y', { count: n })}
            >
              <Ionicons name={n <= stars ? 'star' : 'star-outline'} size={38} color={n <= stars ? '#F97316' : '#E5E7EB'} />
            </Pressable>
          ))}
        </View>

        <View className="mt-6">
          <Input value={comment} onChangeText={setComment} placeholder={t('commentOptional')} multiline />
        </View>
        {error ? <Text className="font-sans mt-2 text-sm text-error">{error}</Text> : null}

        <View className="mt-8">
          <Button title={t('submitRating')} onPress={handleSubmit} loading={loading} />
        </View>
      </View>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}
