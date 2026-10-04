import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';
import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '../../../components/Button';
import { ErrorMessage } from '../../../components/ErrorMessage';
import { Input } from '../../../components/Input';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { useTranslation } from '../../../hooks/useTranslation';
import { rateRide } from '../../../services/ride-service';
import { goHome } from '../../../utils/navigation';
import { ApiError } from '../../../services/api-client';
import { Colors } from '../../../constants/theme';

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
      goHome();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('ratingSaveFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-surface">
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <View className="flex-1 px-5 pt-2">
        <ScreenHeader back title={t('howWasRide')} />

        <View className="mt-8 flex-row justify-center gap-3">
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
              <Ionicons name={n <= stars ? 'star' : 'star-outline'} size={44} color={n <= stars ? Colors.star : Colors['border-strong']} />
            </Pressable>
          ))}
        </View>

        <View className="mt-6">
          <Input value={comment} onChangeText={setComment} placeholder={t('commentOptional')} multiline />
        </View>
        {error ? <View className="mt-3"><ErrorMessage message={error} /></View> : null}

        <View className="mt-8">
          <Button title={t('submitRating')} onPress={handleSubmit} loading={loading} />
        </View>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaViewPlaceholder>
  );
}
