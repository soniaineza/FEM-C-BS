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

export default function DriverRegisterScreen() {
  const { t } = useTranslation();
  const register = useDriverAuthStore((s) => s.register);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    const nameError = validators.fullName(fullName);
    if (nameError) return setError(nameError);
    const phoneError = validators.phone(phone);
    if (phoneError) return setError(phoneError);
    const passwordError = validators.password(password);
    if (passwordError) return setError(passwordError);
    const confirmError = validators.confirmPassword(confirmPassword, password);
    if (confirmError) return setError(confirmError);

    setError(undefined);
    setLoading(true);
    try {
      await register({
        fullName: fullName.trim(),
        phone: phone.trim(),
        password,
        licenseNumber: licenseNumber.trim() || undefined,
      });
      // Root layout's Stack.Protected swaps to driver-profile-setup once
      // currentDriver is set (isProfileComplete is false right after
      // registration — see driverProfile.routes.js's PUT /me gate).
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('driverRegisterFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-surface">
      <KeyboardFormScrollView>
        <ScreenHeader back title={t('driverBecomeDriver')} />
        <Text className="mt-1 text-fg-muted">{t('driverCreateAccountSubtitle')}</Text>

        <View className="mt-6 gap-3">
          <Input label={t('fullName')} value={fullName} onChangeText={setFullName} prefixIcon="person-outline" />
          <Input
            label={t('phoneNumber')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            prefixIcon="call-outline"
          />
          <Input
            label={t('driverLicenseNumberOptional')}
            value={licenseNumber}
            onChangeText={setLicenseNumber}
            prefixIcon="card-outline"
          />
          <Input label={t('password')} value={password} onChangeText={setPassword} secureTextEntry prefixIcon="lock-closed-outline" />
          <Input
            label={t('confirmPassword')}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            prefixIcon="lock-closed-outline"
          />
          {error ? <ErrorMessage message={error} /> : null}
        </View>

        <View className="mt-6">
          <Button title={t('driverCreateAccount')} onPress={handleSubmit} loading={loading} />
        </View>

        <View className="mt-6 flex-row justify-center">
          <Text className="text-fg-muted">{t('alreadyHaveAccount')} </Text>
          <Pressable onPress={() => router.push('/(driver-auth)/login')}>
            <Text className="font-semibold text-primary-text">{t('login')}</Text>
          </Pressable>
        </View>
      </KeyboardFormScrollView>
    </SafeAreaViewPlaceholder>
  );
}
