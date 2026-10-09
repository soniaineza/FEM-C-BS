import { useEffect, useState } from 'react';
import { View, Text, Pressable, Platform, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { getProviders, googleStartUrl, AuthProviders } from '../../services/auth-service';

// On web, dismisses the popup once Google redirects back (no-op on native).
WebBrowser.maybeCompleteAuthSession();

// The passwordless options under the e-mail/password form: "Continue with
// WhatsApp" (always — a code goes to the phone) and "Continue with Google"
// (only when the server has Google credentials, so the button is never dead).
export function SocialAuthButtons() {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getProviders()
      .then((p) => alive && setProviders(p))
      // If the server can't be reached, fall back to the passwordless options.
      .catch(() => alive && setProviders({ password: true, google: { enabled: false }, phone: { enabled: true, channel: 'whatsapp' }, email: { enabled: true } }));
    return () => {
      alive = false;
    };
  }, []);

  if (!providers) return null;
  const showGoogle = providers.google.enabled;
  if (!providers.phone.enabled && !providers.email.enabled && !showGoogle) return null;

  async function startGoogle() {
    if (googleBusy) return;
    setGoogleBusy(true);
    try {
      if (Platform.OS === 'web') {
        // Full-page redirect; the server returns to <origin>/google?code=…,
        // which the app/(auth)/google.tsx screen exchanges for a session.
        const origin = typeof window !== 'undefined' ? window.location.origin : undefined;
        window.location.href = googleStartUrl('web', origin);
        return;
      }
      // The system browser (Custom Tab / ASWebAuthenticationSession) opens
      // Google; the server redirects back to femcabs://google?code=…, which
      // expo-router routes to the google screen. We only need to present it.
      await WebBrowser.openAuthSessionAsync(googleStartUrl('native'), Linking.createURL('google'));
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <View className="mt-4">
      <View className="flex-row items-center">
        <View className="h-px flex-1 bg-border" />
        <Text className="mx-3 text-xs font-medium text-text-secondary">{t('orContinueWith')}</Text>
        <View className="h-px flex-1 bg-border" />
      </View>

      <View className="mt-3 gap-2.5">
        {providers.phone.enabled ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/(auth)/phone-login')}
            className="h-button w-full flex-row items-center justify-center rounded border border-border bg-white active:opacity-80"
          >
            <Ionicons name="logo-whatsapp" size={21} color="#25D366" />
            <Text className="ml-2.5 text-base font-semibold text-ink">{t('continueWithWhatsApp')}</Text>
          </Pressable>
        ) : null}

        {providers.email.enabled ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/(auth)/phone-login?method=email')}
            className="h-button w-full flex-row items-center justify-center rounded border border-border bg-white active:opacity-80"
          >
            <Ionicons name="mail" size={20} color="#0E7C4A" />
            <Text className="ml-2.5 text-base font-semibold text-ink">{t('continueWithEmail')}</Text>
          </Pressable>
        ) : null}

        {showGoogle ? (
          <Pressable
            accessibilityRole="button"
            disabled={googleBusy}
            onPress={startGoogle}
            className="h-button w-full flex-row items-center justify-center rounded border border-border bg-white active:opacity-80"
            style={googleBusy ? { opacity: 0.6 } : undefined}
          >
            {googleBusy ? (
              <ActivityIndicator color="#0E7C4A" />
            ) : (
              <>
                <GoogleGlyph />
                <Text className="ml-2.5 text-base font-semibold text-ink">{t('continueWithGoogle')}</Text>
              </>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// The four-colour "G" as inline SVG-free primitives would be fiddly; a single
// mark keeps it crisp and avoids bundling an image for a rarely shown button.
function GoogleGlyph() {
  return (
    <View className="h-5 w-5 items-center justify-center rounded-full bg-white">
      <Text className="font-sans" style={{ fontSize: 18, fontWeight: '700', color: '#4285F4', lineHeight: 20 }}>G</Text>
    </View>
  );
}
