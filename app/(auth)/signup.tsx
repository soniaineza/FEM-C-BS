import { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../components/SafeAreaViewPlaceholder';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { ErrorMessage } from '../../components/ErrorMessage';
import { BackHeader } from '../../components/BackHeader';
import { useTranslation } from '../../hooks/useTranslation';
import { useAuthStore } from '../../stores/useAuthStore';
import { validators } from '../../utils/validators';
import { ApiError } from '../../services/api-client';

export default function SignupScreen() {
  const { t } = useTranslation();
  const signUp = useAuthStore((s) => s.signUp);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    const nameError = validators.fullName(fullName);
    const phoneError = validators.phone(phone);
    const emailError = validators.email(email);
    const passwordError = validators.password(password, t('passwordHint'));
    const confirmError = validators.confirmPassword(confirmPassword, password);
    const firstError = nameError || phoneError || emailError || passwordError || confirmError;
    if (firstError) return setError(firstError);
    if (!acceptedTerms) return setError(t('agreeTerms'));

    setError(undefined);
    setLoading(true);
    try {
      await signUp({ fullName: fullName.trim(), phone: phone.trim(), email: email.trim(), password });
      router.push('/(auth)/verification');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('accountCreatedFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-white">
      <ScrollView contentContainerClassName="flex-grow px-6 pt-2 pb-8" keyboardShouldPersistTaps="handled">
        <View className="w-full max-w-[440px] self-center">
        <BackHeader />
        <Text className="mt-4 text-2xl font-bold text-ink">{t('createAccount')}</Text>
        <Text className="mt-1 text-text-secondary">{t('lessThanMinute')}</Text>

        <View className="mt-8 gap-4">
          <Input
            label={t('fullName')}
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
            prefixIcon="person-outline"
          />
          <Input
            label={t('phoneNumber')}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            prefixIcon="call-outline"
          />
          <Input
            label={t('email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            prefixIcon="mail-outline"
          />
          <Input
            label={t('password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            prefixIcon="lock-closed-outline"
          />
          <Input
            label={t('confirmPassword')}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            prefixIcon="lock-closed-outline"
          />
          <Text className="text-xs text-text-secondary">{t('passwordHint')}</Text>

          <Pressable className="flex-row items-start" onPress={() => setAcceptedTerms((v) => !v)}>
            <Ionicons
              name={acceptedTerms ? 'checkbox' : 'checkbox-outline'}
              size={22}
              color={acceptedTerms ? '#16A34A' : '#6B7280'}
            />
            <Text className="ml-2.5 flex-1 text-sm leading-5 text-ink">{t('agreeTerms')}</Text>
          </Pressable>

          {error ? <ErrorMessage message={error} /> : null}
        </View>

        <View className="mt-8">
          <Button title={t('signUp')} onPress={handleSubmit} loading={loading} />
        </View>

        <View className="mt-6 flex-row justify-center">
          <Text className="text-text-secondary">{t('existingAccount')}</Text>
          <Pressable onPress={() => router.push('/(auth)/login')}>
            <Text className="font-semibold text-primary">{t('login')}</Text>
          </Pressable>
        </View>
        </View>
      </ScrollView>
    </SafeAreaViewPlaceholder>
  );
}
