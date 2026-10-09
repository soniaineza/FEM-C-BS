import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { ScreenShell } from '@kimu/shared/components/ScreenShell';
import { goBack } from '@kimu/shared/utils/navigation';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Button } from '@kimu/shared/components/Button';
import { Input } from '@kimu/shared/components/Input';
import { ErrorMessage } from '@kimu/shared/components/ErrorMessage';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { resetPassword, confirmResetPassword } from '../../services/auth-service';
import { validators } from '@kimu/shared/utils/validators';
import { ApiError } from '../../services/api-client';

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
    <ScreenShell title={t('forgotPassword')} back background="bg-white" backLabel={t('back')}>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerClassName="flex-grow px-6 pt-2 pb-8">
        <View className="w-full max-w-[440px] self-center">
        {stage === 'request' && (
          <>
            <Text className="font-sans mt-1 text-text-secondary">{t('forgotPasswordDescription')}</Text>
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
              <Ionicons name="mail-open-outline" size={56} color="#0E7C4A" />
            </View>
            <Text className="mt-4 text-2xl text-ink font-display">{t('codeArrivalHint')}</Text>
            <Text className="font-sans mt-2 leading-relaxed text-text-secondary">{t('checkPhoneOrEmail')}</Text>
            {devCode ? (
              <View className="mt-4 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                <Text className="text-center font-bold tracking-widest text-primary">
                  {t('devOtpHint', { code: devCode })}
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
              <Ionicons name="checkmark-circle-outline" size={64} color="#0E7C4A" />
            </View>
            <Text className="mt-5 text-center text-xl text-ink font-display">{t('passwordResetDone')}</Text>
            <View className="mt-7">
              <Button
                title={t('backToLogin')}
                icon="arrow-back-outline"
                onPress={() => goBack('/(auth)/login')}
              />
            </View>
          </>
        )}

        {stage !== 'done' && (
          <Pressable className="mt-6 items-center" onPress={() => goBack()}>
            <Text className="font-sans text-primary">{t('backToLogin')}</Text>
          </Pressable>
        )}
        </View>
      </KeyboardAwareScrollView>
    </ScreenShell>
  );
}
