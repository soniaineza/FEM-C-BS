import { useState } from 'react';
import { View, Text, SafeAreaView, Pressable } from 'react-native';

import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { useTranslation } from '../../hooks/useTranslation';
import { useAuthStore } from '../../stores/useAuthStore';
import { ApiError } from '../../services/api-client';

export default function VerificationScreen() {
  const { t } = useTranslation();
  const pendingPassenger = useAuthStore((s) => s.pendingPassenger);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const resendOtp = useAuthStore((s) => s.resendOtp);

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | undefined>();

  async function handleVerify() {
    if (code.trim().length < 4) return setError(t('invalidIdentifier'));
    setError(undefined);
    setLoading(true);
    try {
      await verifyOtp(code.trim());
      // Root layout's Stack.Protected swaps to profile-setup automatically
      // once currentUser is set.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('signInFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setResendMessage(undefined);
    try {
      await resendOtp('signup');
      setResendMessage(t('languageChanged'));
    } catch (err) {
      setResendMessage(err instanceof ApiError ? err.message : undefined);
    } finally {
      setResending(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6 pt-10">
        <Text className="text-2xl font-bold text-ink">{t('checkPhoneOrEmail')}</Text>
        <Text className="mt-1 text-text-secondary">
          {pendingPassenger ? `${pendingPassenger.phone} / ${pendingPassenger.email}` : ''}
        </Text>

        <View className="mt-8 gap-4">
          <Input
            label={t('resetCodeLabel')}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
          />
          {error ? <Text className="text-sm text-error">{error}</Text> : null}
          <Text className="text-xs text-text-secondary">{t('codeArrivalHint')}</Text>
        </View>

        <View className="mt-8">
          <Button title={t('continueLabel')} onPress={handleVerify} loading={loading} />
        </View>

        <Pressable className="mt-4 items-center" onPress={handleResend} disabled={resending}>
          <Text className="text-primary">{resending ? '...' : t('sendVerification')}</Text>
        </Pressable>
        {resendMessage ? <Text className="mt-2 text-center text-xs text-text-secondary">{resendMessage}</Text> : null}
      </View>
    </SafeAreaView>
  );
}
