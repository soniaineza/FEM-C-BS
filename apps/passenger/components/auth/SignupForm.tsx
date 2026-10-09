import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Button } from '@kimu/shared/components/Button';
import { Input } from '@kimu/shared/components/Input';
import { ErrorMessage } from '@kimu/shared/components/ErrorMessage';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { validators } from '@kimu/shared/utils/validators';
import { useAuthStore } from '../../stores/useAuthStore';
import { ApiError } from '../../services/api-client';

export function SignupForm({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
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
    <View>
      <Text className="font-sans mb-4 text-sm text-text-secondary">{t('lessThanMinute')}</Text>

      <View className="gap-4">
        <Input placeholder={t('fullName')} accessibilityLabel={t('fullName')} value={fullName} onChangeText={setFullName} autoCapitalize="words" prefixIcon="person-outline" />
        <Input placeholder={t('phoneNumber')} accessibilityLabel={t('phoneNumber')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" prefixIcon="call-outline" />
        <Input
          placeholder={t('email')}
          accessibilityLabel={t('email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          prefixIcon="mail-outline"
        />
        <Input placeholder={t('password')} accessibilityLabel={t('password')} value={password} onChangeText={setPassword} secureTextEntry prefixIcon="lock-closed-outline" />
        <Input
          placeholder={t('confirmPassword')}
          accessibilityLabel={t('confirmPassword')}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          prefixIcon="lock-closed-outline"
        />
        <Text className="font-sans text-xs text-text-secondary">{t('passwordHint')}</Text>

        <Pressable
          className="flex-row items-start"
          onPress={() => setAcceptedTerms((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: acceptedTerms }}
        >
          <Ionicons name={acceptedTerms ? 'checkbox' : 'checkbox-outline'} size={22} color={acceptedTerms ? '#0E7C4A' : '#6B7280'} />
          <Text className="font-sans ml-2.5 flex-1 text-sm leading-5 text-ink">{t('agreeTerms')}</Text>
        </Pressable>

        {error ? <ErrorMessage message={error} /> : null}
      </View>

      <View className="mt-6">
        <Button title={t('register')} icon="arrow-forward" iconPosition="right" onPress={handleSubmit} loading={loading} />
      </View>

      <View className="mt-6 flex-row justify-center">
        <Text className="font-sans text-text-secondary">{t('existingAccount')}</Text>
        <Pressable onPress={onSwitchToLogin} hitSlop={8} accessibilityRole="button">
          <Text className="font-semibold text-primary">{t('login')}</Text>
        </Pressable>
      </View>
    </View>
  );
}
