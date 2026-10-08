import { View, Text, Pressable } from 'react-native';
import { SafeAreaViewPlaceholder } from '@kimu/shared/components/SafeAreaViewPlaceholder';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { router, Redirect, useIsFocused } from 'expo-router';

import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { useLocaleStore } from '@kimu/shared/stores/useLocaleStore';
import { useAuthStore } from '../../stores/useAuthStore';

// Rider welcome screen: one full-height green panel with the wordmark at the
// top and the tagline plus the three entry actions (get started, log in,
// sign up) grouped in the vertical centre. No photo and no bottom panel.
export default function WelcomeScreen() {
  const { t } = useTranslation();
  const isFocused = useIsFocused();
  const hasChosenLanguage = useLocaleStore((s) => s.hasChosenLanguage);
  const pendingPassenger = useAuthStore((s) => s.pendingPassenger);

  // The language chooser is the first screen a new user sees.
  if (!hasChosenLanguage) return <Redirect href="/(auth)/language" />;
  if (pendingPassenger) return <Redirect href="/(auth)/verification" />;

  return (
    <LinearGradient colors={['#0E7C4A', '#084A2D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
      {isFocused ? <StatusBar style="light" /> : null}
      <View className="absolute rounded-full bg-white/10" style={{ width: 220, height: 220, top: -70, right: -70 }} />
      <View className="absolute rounded-full bg-white/[0.06]" style={{ width: 280, height: 280, bottom: -110, left: -90 }} />

      <SafeAreaViewPlaceholder className="flex-1">
        <View className="px-6 pt-5">
          <Text className="text-2xl font-bold text-white" style={{ letterSpacing: -0.5 }}>
            Kimu <Text className="text-white/80">Transport</Text>
          </Text>
          <View className="mt-2 h-[3px] w-9 rounded-full bg-accent" />
        </View>

        <View className="flex-1 justify-center px-6">
          <View className="w-full max-w-[440px] self-center">
            <Text className="text-center text-[32px] leading-tight text-white font-display">{t('tagline')}</Text>
            <Text className="mt-3 text-center text-base leading-relaxed text-white/80">{t('safeReliableRides')}</Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('getStarted')}
              className="mt-9 h-button w-full items-center justify-center rounded bg-white"
              onPress={() => router.push('/(auth)/signup')}
            >
              <Text className="text-base font-semibold text-primary">{t('getStarted')}</Text>
            </Pressable>

            <View className="mt-3 flex-row gap-3">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('login')}
                className="h-button flex-1 items-center justify-center rounded border border-white/60"
                onPress={() => router.push('/(auth)/login')}
              >
                <Text className="text-base font-semibold text-white">{t('login')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('signUp')}
                className="h-button flex-1 items-center justify-center rounded border border-white/60"
                onPress={() => router.push('/(auth)/signup')}
              >
                <Text className="text-base font-semibold text-white">{t('signUp')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </SafeAreaViewPlaceholder>
    </LinearGradient>
  );
}
