import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { ScreenShell } from '@kimu/shared/components/ScreenShell';
import { router } from 'expo-router';

import { Button } from '@kimu/shared/components/Button';
import { Input } from '@kimu/shared/components/Input';
import { ErrorMessage } from '@kimu/shared/components/ErrorMessage';
import { useDriverAuthStore } from '../../stores/useDriverAuthStore';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { validators } from '@kimu/shared/utils/validators';
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
    <ScreenShell title={t('driverWelcomeBack')} back background="bg-white" backLabel={t('back')}>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerClassName="flex-grow px-6 pt-2 pb-8">
        <Text className="font-sans mt-1 text-text-secondary">{t('driverLoginSubtitle')}</Text>

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

      </KeyboardAwareScrollView>
    </ScreenShell>
  );
}
