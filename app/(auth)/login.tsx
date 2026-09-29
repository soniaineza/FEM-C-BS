import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { KeyboardFormScrollView } from '../../components/layout/KeyboardFormScrollView';
import { SafeAreaViewPlaceholder } from '../../components/SafeAreaViewPlaceholder';
import { router } from 'expo-router';
import { goBack } from '../../utils/navigation';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { ErrorMessage } from '../../components/ErrorMessage';
import { BackHeader } from '../../components/BackHeader';
import { BrandMark } from '../../components/BrandMark';
import { useTranslation } from '../../hooks/useTranslation';
import { useAuthStore } from '../../stores/useAuthStore';
import { validators } from '../../utils/validators';
import { ApiError } from '../../services/api-client';

// Two-step login: identifier first, then password. Splitting the fields keeps
// each step minimal (one question per screen) without changing what the
// backend receives — step 2 still POSTs the same { identifier, password } to
// /auth/login. Google sign-in is deliberately NOT rendered: the backend has
// no Google auth endpoint, and the UI must never pretend otherwise.
export default function LoginScreen() {
  const { t } = useTranslation();
  const logIn = useAuthStore((s) => s.logIn);

  const [step, setStep] = useState<'identifier' | 'password'>('identifier');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  function handleIdentifierContinue() {
    const idError = validators.identifier(identifier, t('invalidIdentifier'));
    if (idError) return setError(idError);
    setError(undefined);
    setStep('password');
  }

  async function handleSubmit() {
    if (!password) return setError(t('enterPassword'));

    setError(undefined);
    setLoading(true);
    try {
      const passenger = await logIn({ identifier: identifier.trim(), password });
      if (!passenger.isVerified) router.replace('/(auth)/verification');
      // Stack.Protected in the root layout swaps to profile-setup or (main)
      // automatically once currentUser updates — no manual navigation here.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('signInFailed'));
      // A failed attempt keeps the user on the password step; they can retry
      // or go back and correct the identifier.
    } finally {
      setLoading(false);
    }
  }

  function back() {
    if (step === 'password') {
      setError(undefined);
      setPassword('');
      setStep('identifier');
    } else {
      goBack();
    }
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-surface">
      <View style={{ flex: 1 }}>
        {/* Back affordance pinned above the centered content; the keyboard-aware scroll view keeps
            everything reachable when the keyboard is up or on short screens. */}
        <View className="px-5 pt-1">
          <BackHeader onBack={back} />
        </View>
        <KeyboardFormScrollView centered bottomPadding={40}>
          <View className="w-full max-w-[420px] self-center">
            <View className="items-center">
              <BrandMark fontSize={26} />
            </View>

            <Text className="mt-10 text-center text-title-1 text-fg font-display">
              {step === 'identifier' ? t('welcomeTo') : t('welcomeBack')}
            </Text>
            <Text className="mt-2 text-center text-callout leading-relaxed text-fg-muted">
              {step === 'identifier' ? t('loginTagline') : t('loginPasswordHint', { identifier: identifier.trim() })}
            </Text>

            <View className="mt-9">
              {step === 'identifier' ? (
                <Input
                  label={t('phoneOrEmail')}
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
                  onSubmitEditing={handleIdentifierContinue}
                  prefixIcon="person-outline"
                  autoFocus
                />
              ) : (
                <Input
                  label={t('password')}
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
                  autoFocus
                />
              )}

              {error ? (
                <View className="mt-3">
                  <ErrorMessage message={error} />
                </View>
              ) : null}

              {step === 'password' ? (
                <Pressable onPress={() => router.push('/(auth)/forgot-password')} hitSlop={8} className="mt-3 self-end">
                  <Text className="text-subhead font-medium text-primary-text">{t('forgotPassword')}</Text>
                </Pressable>
              ) : null}
            </View>

            <View className="mt-8">
              <Button
                title={t('continueLabel')}
                icon="arrow-forward"
                onPress={step === 'identifier' ? handleIdentifierContinue : handleSubmit}
                loading={loading}
              />
            </View>

            <View className="mt-7 flex-row justify-center">
              <Text className="text-fg-muted">{t('noAccount')}</Text>
              <Pressable onPress={() => router.push('/(auth)/signup')} hitSlop={8}>
                <Text className="font-semibold text-primary-text">{t('signUp')}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardFormScrollView>
      </View>
    </SafeAreaViewPlaceholder>
  );
}
