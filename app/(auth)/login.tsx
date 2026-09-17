import { useState } from 'react';
import { View, Text, SafeAreaView, ScrollView, Pressable } from 'react-native';
import { router } from 'expo-router';

import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { useTranslation } from '../../hooks/useTranslation';
import { useAuthStore } from '../../stores/useAuthStore';
import { validators } from '../../utils/validators';
import { ApiError } from '../../services/api-client';

export default function LoginScreen() {
  const { t } = useTranslation();
  const logIn = useAuthStore((s) => s.logIn);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    const idError = validators.identifier(identifier, t('invalidIdentifier'));
    if (idError) return setError(idError);
    if (!password) return setError(t('enterPassword'));

    setError(undefined);
    setLoading(true);
    try {
      await logIn({ identifier: identifier.trim(), password });
      // Stack.Protected in the root layout swaps to profile-setup or (main)
      // automatically once currentUser updates — no manual navigation here.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('signInFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerClassName="flex-grow px-6 pt-10 pb-8" keyboardShouldPersistTaps="handled">
        <Text className="text-2xl font-bold text-ink">{t('welcomeBack')}</Text>
        <Text className="mt-1 text-text-secondary">{t('loginSubtitle')}</Text>

        <View className="mt-8 gap-4">
          <Input
            label={t('phoneOrEmail')}
            value={identifier}
            onChangeText={setIdentifier}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Input label={t('password')} value={password} onChangeText={setPassword} secureTextEntry />
          {error ? <Text className="text-sm text-error">{error}</Text> : null}
          <Pressable onPress={() => router.push('/(auth)/forgot-password')}>
            <Text className="text-right text-sm text-primary">{t('forgotPassword')}</Text>
          </Pressable>
        </View>

        <View className="mt-8">
          <Button title={t('login')} onPress={handleSubmit} loading={loading} />
        </View>

        <View className="mt-6 flex-row justify-center">
          <Text className="text-text-secondary">{t('noAccount')}</Text>
          <Pressable onPress={() => router.push('/(auth)/signup')}>
            <Text className="font-semibold text-primary">{t('signUp')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
