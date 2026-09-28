import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaViewPlaceholder } from '../../components/SafeAreaViewPlaceholder';

import { Button } from '../../components/Button';
import { ErrorMessage } from '../../components/ErrorMessage';
import { BackHeader } from '../../components/BackHeader';
import { FEMOtpField } from '../../components/FEMOtpField';
import { useTranslation } from '../../hooks/useTranslation';
import { useAuthStore } from '../../stores/useAuthStore';
import { ApiError } from '../../services/api-client';

const OTP_LENGTH = 6;

// Direct port of lib/screens/auth/verification_screen.dart: a large,
// centered, letter-spaced OTP input that auto-submits once 6 digits are
// entered, plus a 30s countdown before "Resend code" becomes tappable.
export default function VerificationScreen() {
  const { t } = useTranslation();
  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const resendOtp = useAuthStore((s) => s.resendOtp);
  const devCode = useAuthStore((s) => s.devCode);

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(30);
  const verifyingRef = useRef(false);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = setTimeout(() => setResendSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendSeconds]);

  async function handleVerify(value: string) {
    if (verifyingRef.current) return;
    if (value.length !== OTP_LENGTH) return setError(t('invalidVerificationCode'));
    verifyingRef.current = true;
    setError(undefined);
    setLoading(true);
    try {
      await verifyOtp(value);
      // Root layout's Stack.Protected swaps to profile-setup automatically
      // once currentUser is set.
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('verificationFailed'));
    } finally {
      setLoading(false);
      verifyingRef.current = false;
    }
  }

  function onChangeCode(text: string) {
    const digits = text.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH);
    setCode(digits);
    if (error) setError(undefined);
    if (digits.length === OTP_LENGTH) handleVerify(digits);
  }

  async function handleResend() {
    if (resendSeconds > 0) return;
    try {
      await resendOtp('signup');
      setResendSeconds(30);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('verificationFailed'));
    }
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-white">
      <View className="px-5 pt-1">
        <BackHeader />
      </View>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled"
        contentContainerClassName="flex-grow justify-center px-6 pb-10 pt-2"
      >
        <View className="w-full max-w-[440px] self-center">
          <Text className="text-center text-2xl font-bold text-ink">{t('verifyAccount')}</Text>
          <Text className="mt-2 text-center leading-relaxed text-text-secondary">
            {t('verificationCodeSent')}
          </Text>

          {devCode ? (
            <View className="mt-4 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
              <Text className="text-center font-bold tracking-widest text-primary">
                {t('demoOtpHint', { code: devCode })}
              </Text>
            </View>
          ) : null}

          <View className="mt-7">
            <FEMOtpField value={code} onChange={onChangeCode} error={Boolean(error)} disabled={loading} />
          </View>

          {error ? (
            <View className="mt-4">
              <ErrorMessage message={error} />
            </View>
          ) : null}

          <View className="mt-6">
            <Button title={t('verify')} onPress={() => handleVerify(code)} loading={loading} />
          </View>

          <Pressable className="mt-5 items-center" onPress={handleResend} disabled={resendSeconds > 0} hitSlop={8}>
            <Text className={resendSeconds > 0 ? 'text-text-secondary' : 'font-semibold text-primary'}>
              {resendSeconds > 0 ? t('resendCodeIn', { seconds: resendSeconds }) : t('resendCode')}
            </Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaViewPlaceholder>
  );
}
