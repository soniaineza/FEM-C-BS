import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaViewPlaceholder } from '@kimu/shared/components/SafeAreaViewPlaceholder';

import { Button } from '@kimu/shared/components/Button';
import { Input } from '@kimu/shared/components/Input';
import { ErrorMessage } from '@kimu/shared/components/ErrorMessage';
import { BackHeader } from '@kimu/shared/components/BackHeader';
import { KimuOtpField } from '../../components/KimuOtpField';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { validators } from '@kimu/shared/utils/validators';
import { useAuthStore } from '../../stores/useAuthStore';
import { ApiError } from '../../services/api-client';
import { whatsappStart, whatsappVerify, emailStart, emailVerify, addPhone } from '../../services/auth-service';

const OTP_LENGTH = 6;

export default function PhoneLoginScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ mode?: string; method?: string }>();
  const mode = params.mode === 'add' ? 'add' : 'login';
  const method = params.method === 'email' ? 'email' : 'whatsapp';
  const isEmail = method === 'email' && mode !== 'add';

  const applyAuthResult = useAuthStore((s) => s.applyAuthResult);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);

  const [step, setStep] = useState<'enter' | 'code'>('enter');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const verifyingRef = useRef(false);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = setTimeout(() => setResendSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendSeconds]);

  async function sendCode() {
    const value = identifier.trim();
    const invalid = isEmail ? validators.email(value, t('emailInvalid')) : validators.phone(value, t('invalidPhoneHint'));
    if (invalid) return setError(invalid);
    setError(undefined);
    setLoading(true);
    try {
      const res = mode === 'add' ? await addPhone(value) : isEmail ? await emailStart(value) : await whatsappStart(value);
      
      if (res && res.otpSent === false) {
        setError(res.message || t('otpDeliveryFailed'));
        return;
      }
      setStep('code');
      setResendSeconds(30);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('signInFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(value: string) {
    if (verifyingRef.current) return;
    if (value.length !== OTP_LENGTH) return;
    verifyingRef.current = true;
    setError(undefined);
    setLoading(true);
    try {
      if (mode === 'add') {
        await verifyOtp(value); 
      } else if (isEmail) {
        const { passenger } = await emailVerify(identifier.trim(), value);
        applyAuthResult(passenger);
      } else {
        const { passenger } = await whatsappVerify(identifier.trim(), value);
        applyAuthResult(passenger);
      }
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

  const iconName: keyof typeof Ionicons.glyphMap = isEmail ? 'mail' : 'logo-whatsapp';
  const iconColor = isEmail ? '#0E7C4A' : '#25D366';
  const iconBg = isEmail ? 'rgba(14,124,74,0.12)' : 'rgba(37,211,102,0.12)';
  const title = mode === 'add' ? t('addYourPhone') : isEmail ? t('logInWithEmail') : t('logInWithWhatsApp');

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-white">
      <View className="px-5 pt-1">
        <BackHeader onBack={() => (step === 'code' ? setStep('enter') : router.back())} />
      </View>
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40 }}
      >
        <View className="w-full max-w-[440px] self-center">
          <View className="items-center">
            <View className="h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: iconBg }}>
              <Ionicons name={iconName} size={34} color={iconColor} />
            </View>
          </View>

          {step === 'enter' ? (
            <>
              <Text className="mt-5 text-center text-2xl text-ink font-display">{title}</Text>
              <Text className="font-sans mt-2 text-center leading-relaxed text-text-secondary">
                {isEmail ? t('emailLoginHint') : t('whatsAppLoginHint')}
              </Text>
              <View className="mt-7">
                <Input
                  placeholder={isEmail ? t('email') : t('phoneNumber')}
                  accessibilityLabel={isEmail ? t('email') : t('phoneNumber')}
                  value={identifier}
                  onChangeText={(v) => {
                    setIdentifier(v);
                    if (error) setError(undefined);
                  }}
                  keyboardType={isEmail ? 'email-address' : 'phone-pad'}
                  autoCapitalize="none"
                  autoComplete={isEmail ? 'email' : 'tel'}
                  returnKeyType="go"
                  onSubmitEditing={sendCode}
                  prefixIcon={isEmail ? 'mail-outline' : 'call-outline'}
                  autoFocus
                />
                {error ? (
                  <View className="mt-3">
                    <ErrorMessage message={error} />
                  </View>
                ) : null}
                <View className="mt-6">
                  <Button title={t('sendCode')} icon="arrow-forward" iconPosition="right" onPress={sendCode} loading={loading} />
                </View>
              </View>
            </>
          ) : (
            <>
              <Text className="mt-5 text-center text-2xl text-ink font-display">{t('enterCode')}</Text>
              <Text className="font-sans mt-2 text-center leading-relaxed text-text-secondary">
                {t('codeSentToTarget', { target: identifier.trim() })}
              </Text>
              <View className="mt-7">
                <KimuOtpField value={code} onChange={onChangeCode} error={Boolean(error)} disabled={loading} />
              </View>
              {error ? (
                <View className="mt-4">
                  <ErrorMessage message={error} />
                </View>
              ) : null}
              <View className="mt-6">
                <Button title={t('verify')} onPress={() => handleVerify(code)} loading={loading} />
              </View>
              <Pressable className="mt-5 items-center" onPress={sendCode} disabled={resendSeconds > 0} hitSlop={8}>
                <Text className={resendSeconds > 0 ? 'text-text-secondary' : 'font-semibold text-primary'}>
                  {resendSeconds > 0 ? t('resendCodeIn', { seconds: resendSeconds }) : t('resendCode')}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaViewPlaceholder>
  );
}
