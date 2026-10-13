import { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import type { TranslationKey } from '@kimu/shared/locales';
import { KimuColors } from '@kimu/shared/constants/theme';
import { useAuthStore } from '../../stores/useAuthStore';
import { exchangeGoogleCode } from '../../services/auth-service';

const errorMessageKey: Record<string, TranslationKey> = {
  cancelled: 'googleCancelled',
  email_unverified: 'googleEmailUnverified',
  linked_elsewhere: 'googleLinkedElsewhere',
  unavailable: 'googleUnavailable',
  failed: 'googleFailed',
};

export default function GoogleReturnScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ code?: string; error?: string }>();
  const applyAuthResult = useAuthStore((s) => s.applyAuthResult);
  const setPending = useAuthStore((s) => s.setPending);
  const [message, setMessage] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    const code = typeof params.code === 'string' ? params.code : undefined;
    const error = typeof params.error === 'string' ? params.error : undefined;
    if (!code && !error) return; // deep link not delivered yet
    handled.current = true;

    if (error || !code) {
      setMessage(t(errorMessageKey[error ?? 'failed'] ?? 'googleFailed'));
      const timer = setTimeout(() => router.replace('/(auth)'), 2200);
      return () => clearTimeout(timer);
    }

    (async () => {
      try {
        const { passenger, needsPhone } = await exchangeGoogleCode(code);
        if (needsPhone) {
          setPending(passenger);
          router.replace('/(auth)/phone-login?mode=add');
        } else {
          applyAuthResult(passenger);
          // Stack.Protected swaps to (main) / profile-setup automatically.
        }
      } catch {
        setMessage(t('googleFailed'));
        setTimeout(() => router.replace('/(auth)'), 2200);
      }
    })();
  }, [params.code, params.error, applyAuthResult, setPending, t]);

  return (
    <View className="flex-1 items-center justify-center bg-white px-8">
      {message ? (
        <Text className="font-sans text-center text-base text-text-secondary">{message}</Text>
      ) : (
        <>
          <ActivityIndicator color={KimuColors.primary} size="large" />
          <Text className="font-sans mt-4 text-center text-base text-text-secondary">{t('signingYouIn')}</Text>
        </>
      )}
    </View>
  );
}
