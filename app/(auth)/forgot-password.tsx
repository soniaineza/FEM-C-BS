import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { KeyboardFormScrollView } from '../../components/layout/KeyboardFormScrollView';
import { SafeAreaViewPlaceholder } from '../../components/SafeAreaViewPlaceholder';
import { goBack } from '../../utils/navigation';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { ErrorMessage } from '../../components/ErrorMessage';
import { BackHeader } from '../../components/BackHeader';
import { useTranslation } from '../../hooks/useTranslation';
import { resetPassword, confirmResetPassword } from '../../services/auth-service';
import { validators } from '../../utils/validators';
import { ApiError } from '../../services/api-client';
import { Colors } from '../../constants/theme';

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();

  const [stage, setStage] = useState<'request' | 'confirm' | 'done'>('request');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>();
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
      const result = await resetPassword(identifier.trim());
      setDevCode(result.devCode);
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
    <SafeAreaViewPlaceholder className="flex-1 bg-surface">
      <KeyboardFormScrollView>
        <View className="w-full max-w-[440px] self-center">
        <BackHeader />
        {stage === 'request' && (
          <>
            <Text className="text-title-1 text-fg font-display">{t('forgotPassword')}</Text>
            <Text className="mt-1 text-fg-muted">{t('forgotPasswordDescription')}</Text>
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
              <Ionicons name="mail-open-outline" size={56} color={Colors.primary} />
            </View>
            <Text className="mt-4 text-title-1 text-fg font-display">{t('checkPhoneOrEmail')}</Text>
            <Text className="mt-2 leading-relaxed text-fg-muted">{t('codeArrivalHint')}</Text>
            {devCode ? (
              <View className="mt-4 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                <Text className="text-center font-bold tracking-widest text-primary-text">
                  {t('demoOtpHint', { code: devCode })}
                </Text>
              </View>
            ) : null}
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
              <Ionicons name="checkmark-circle-outline" size={64} color={Colors.primary} />
            </View>
            <Text className="mt-5 text-center text-title-2 text-fg font-display">{t('passwordResetDone')}</Text>
            <View className="mt-7">
              <Button
                title={t('backToLogin')}
                icon="arrow-back-outline"
                // Login is already underneath this screen: go back to it
                // instead of stacking a second login screen.
                onPress={() => goBack('/(auth)/login')}
              />
            </View>
          </>
        )}

        {stage !== 'done' && (
          <Pressable className="mt-6 items-center" onPress={() => goBack()}>
            <Text className="text-primary-text">{t('backToLogin')}</Text>
          </Pressable>
        )}
        </View>
      </KeyboardFormScrollView>
    </SafeAreaViewPlaceholder>
  );
}
