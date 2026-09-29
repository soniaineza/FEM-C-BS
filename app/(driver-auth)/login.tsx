import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../components/SafeAreaViewPlaceholder';
import { router } from 'expo-router';

import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { ErrorMessage } from '../../components/ErrorMessage';
import { ScreenHeader } from '../../components/ui/ScreenHeader';
import { KeyboardFormScrollView } from '../../components/layout/KeyboardFormScrollView';
import { useDriverAuthStore } from '../../stores/useDriverAuthStore';
import { useTranslation } from '../../hooks/useTranslation';
import { validators } from '../../utils/validators';
import { ApiError } from '../../services/driver-api-client';

export default function DriverLoginScreen() {
  const { t } = useTranslation();
  const logIn = useDriverAuthStore((s) => s.logIn);

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    const phoneError = validators.phone(phone);
    if (phoneError) return setError(phoneError);
    if (!password) return setError(t('enterPassword'));

    setError(undefined);
    setLoading(true);
    try {
      await logIn({ phone: phone.trim(), password });
      // The root layout's Stack.Protected swaps to (driver) automatically
      // once currentDriver updates — no manual navigation here.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('driverSignInFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-surface">
      <KeyboardFormScrollView>
        <ScreenHeader back title={t('driverWelcomeBack')} />
        <Text className="mt-1 text-fg-muted">{t('driverLoginSubtitle')}</Text>

        <View className="mt-8 gap-4">
          <Input
            label={t('phoneNumber')}
            value={phone}
            onChangeText={setPhone}
            autoCapitalize="none"
            keyboardType="phone-pad"
            prefixIcon="call-outline"
          />
          <Input
            label={t('password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            prefixIcon="lock-closed-outline"
          />
          {error ? <ErrorMessage message={error} /> : null}
        </View>

        <View className="mt-8">
          <Button title={t('login')} onPress={handleSubmit} loading={loading} />
        </View>

        <View className="mt-6 flex-row justify-center">
          <Text className="text-fg-muted">{t('driverNewDriverQuestion')} </Text>
          <Pressable onPress={() => router.push('/(driver-auth)/register')}>
            <Text className="font-semibold text-primary-text">{t('signUp')}</Text>
          </Pressable>
        </View>
      </KeyboardFormScrollView>
    </SafeAreaViewPlaceholder>
  );
}
