import { useState } from 'react';
import { View, Text, SafeAreaView, Pressable } from 'react-native';
import { router } from 'expo-router';

import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
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
            <View className="mt-8 gap-4">
              <Input label={t('emailOrPhone')} value={identifier} onChangeText={setIdentifier} autoCapitalize="none" />
              {error ? <Text className="text-sm text-error">{error}</Text> : null}
            </View>
            <View className="mt-8">
              <Button title={t('sendVerification')} onPress={handleRequest} loading={loading} />
            </View>
          </>
        )}

        {stage === 'confirm' && (
          <>
            <Text className="text-2xl font-bold text-ink">{t('setNewPassword')}</Text>
            <Text className="mt-1 text-text-secondary">{t('checkPhoneOrEmail')}</Text>
            <View className="mt-8 gap-4">
              <Input label={t('resetCodeLabel')} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
              <Input label={t('newPassword')} value={newPassword} onChangeText={setNewPassword} secureTextEntry />
              <Input
                label={t('confirmPasswordShort')}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />
              {error ? <Text className="text-sm text-error">{error}</Text> : null}
            </View>
            <View className="mt-8">
              <Button title={t('setNewPassword')} onPress={handleConfirm} loading={loading} />
            </View>
          </>
        )}

        {stage === 'done' && (
          <>
            <Text className="text-2xl font-bold text-ink">{t('passwordResetDone')}</Text>
            <View className="mt-8">
              <Button title={t('backToLogin')} onPress={() => router.replace('/(auth)/login')} />
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
