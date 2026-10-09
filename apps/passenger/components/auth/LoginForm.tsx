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

// Phone/email + password on one screen, POSTed as { identifier, password } to
// /auth/login. "Remember me" decides whether the session survives closing
// the app. Google sign-in is deliberately NOT rendered: the backend has no
// Google auth endpoint, and the UI must never pretend otherwise.
export function LoginForm({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const { t } = useTranslation();
  const logIn = useAuthStore((s) => s.logIn);

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    const idError = validators.identifier(identifier, t('invalidIdentifier'));
    if (idError) return setError(idError);
    if (!password) return setError(t('enterPassword'));

    setError(undefined);
    setLoading(true);
    try {
      const passenger = await logIn({ identifier: identifier.trim(), password, remember });
      if (!passenger.isVerified) router.replace('/(auth)/verification');
      // Stack.Protected in the root layout swaps to profile-setup or (main)
      // automatically once currentUser updates — no manual navigation here.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('signInFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View>
      <View className="gap-4">
        <Input
          placeholder={t('phoneOrEmail')}
          accessibilityLabel={t('phoneOrEmail')}
          value={identifier}
          onChangeText={(v) => {
            setIdentifier(v);
            if (error) setError(undefined);
          }}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="username"
          textContentType="username"
          returnKeyType="next"
          prefixIcon="mail-outline"
        />
        <Input
          placeholder={t('password')}
          accessibilityLabel={t('password')}
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            if (error) setError(undefined);
          }}
          secureTextEntry
          autoComplete="password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
          prefixIcon="lock-closed-outline"
        />
      </View>

      <View className="mt-4 flex-row items-center justify-between">
        <Pressable
          className="flex-row items-center"
          onPress={() => setRemember((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: remember }}
          hitSlop={8}
        >
          <Ionicons name={remember ? 'checkbox' : 'square-outline'} size={22} color={remember ? '#0E7C4A' : '#9CA3AF'} />
          <Text className="font-sans ml-2 text-sm text-ink">{t('rememberMe')}</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/(auth)/forgot-password')} hitSlop={8} accessibilityRole="link">
          <Text className="text-sm font-semibold text-primary">{t('forgotPassword')}</Text>
        </Pressable>
      </View>

      {error ? (
        <View className="mt-3">
          <ErrorMessage message={error} />
        </View>
      ) : null}

      <View className="mt-6">
        <Button title={t('login')} icon="arrow-forward" iconPosition="right" onPress={handleSubmit} loading={loading} />
      </View>

      <View className="mt-6 flex-row justify-center">
        <Text className="font-sans text-[15px] text-text-secondary">{t('noAccount')}</Text>
        <Pressable onPress={onSwitchToRegister} hitSlop={8} accessibilityRole="button">
          <Text className="text-[15px] font-semibold text-primary">{t('register')}</Text>
        </Pressable>
      </View>
    </View>
  );
}
