import { useState } from 'react';
import { View, Text, SafeAreaView, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { ErrorMessage } from '../../components/ErrorMessage';
import { useTranslation } from '../../hooks/useTranslation';
import { resetPassword, confirmResetPassword } from '../../services/auth-service';
import { validators } from '../../utils/validators';
import { ApiError } from '../../services/api-client';

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();

  const [stage, setStage] = useState<'request' | 'confirm' | 'done'>('request');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function handleRequest() {
    const idError = validators.identifier(identifier, t('invalidIdentifier'));
    if (idError) return setError(idError);
    setError(undefined);
    setLoading(true);
    try {
      await resetPassword(identifier.trim());
      setStage('confirm');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    const passwordError = validators.password(newPassword, t('passwordHint'));
    const confirmError = validators.confirmPassword(confirmPassword, newPassword);
    const firstError = passwordError || confirmError;
    if (firstError) return setError(firstError);
    setError(undefined);
    setLoading(true);
    try {
      await confirmResetPassword({ identifier: identifier.trim(), code: code.trim(), newPassword });
      setStage('done');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6 pt-10">
        {stage === 'request' && (
          <>
            <Text className="text-2xl font-bold text-ink">{t('forgotPassword')}</Text>
            <Text className="mt-1 text-text-secondary">{t('forgotPasswordDescription')}</Text>
            <View className="mt-6 gap-4">
              <Input
                label={t('emailOrPhone')}
                value={identifier}
                onChangeText={setIdentifier}
                autoCapitalize="none"
                prefixIcon="at-outline"
              />
              {error ? <ErrorMessage message={error} /> : null}
            </View>
            <View className="mt-6">
              <Button title={t('sendVerification')} onPress={handleRequest} loading={loading} />
            </View>
          </>
        )}

        {stage === 'confirm' && (
          <>
            <View className="items-center">
              <Ionicons name="mail-open-outline" size={56} color="#16A34A" />
            </View>
            <Text className="mt-4 text-2xl font-bold text-ink">{t('codeArrivalHint')}</Text>
            <Text className="mt-2 leading-relaxed text-text-secondary">{t('checkPhoneOrEmail')}</Text>
            <View className="mt-6 gap-4">
              <Input
                label={t('resetCodeLabel')}
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                maxLength={6}
                prefixIcon="keypad-outline"
              />
              <Input
                label={t('newPassword')}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                prefixIcon="lock-closed-outline"
              />
              <Input
                label={t('confirmPasswordShort')}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                prefixIcon="lock-closed-outline"
              />
              {error ? <ErrorMessage message={error} /> : null}
            </View>
            <View className="mt-6">
              <Button title={t('setNewPassword')} onPress={handleConfirm} loading={loading} />
            </View>
          </>
        )}

        {stage === 'done' && (
          <>
            <View className="items-center pt-6">
              <Ionicons name="checkmark-circle-outline" size={64} color="#16A34A" />
            </View>
            <Text className="mt-5 text-center text-xl font-bold text-ink">{t('passwordResetDone')}</Text>
            <View className="mt-7">
              <Button
                title={t('backToLogin')}
                icon="arrow-back-outline"
                onPress={() => router.replace('/(auth)/login')}
              />
            </View>
          </>
        )}

        {stage !== 'done' && (
          <Pressable className="mt-6 items-center" onPress={() => router.back()}>
            <Text className="text-primary">{t('backToLogin')}</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}
