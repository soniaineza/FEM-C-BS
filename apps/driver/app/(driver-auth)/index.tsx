import { View, Text, Pressable } from 'react-native';
import { SafeAreaViewPlaceholder } from '@kimu/shared/components/SafeAreaViewPlaceholder';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { router, Redirect, useIsFocused } from 'expo-router';

import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { useLocaleStore } from '@kimu/shared/stores/useLocaleStore';

// Driver welcome screen: same full-height green layout as the rider welcome
// screen ((auth)/index.tsx), with driver copy and routes.
export default function DriverWelcomeScreen() {
  const { t } = useTranslation();
  const isFocused = useIsFocused();
  const hasChosenLanguage = useLocaleStore((s) => s.hasChosenLanguage);

  // The language chooser is the first screen a new driver sees.
  if (!hasChosenLanguage) return <Redirect href="/(driver-auth)/language" />;

  return (
    <LinearGradient colors={['#0E7C4A', '#084A2D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
      {isFocused ? <StatusBar style="light" /> : null}
      <View className="absolute rounded-full bg-white/10" style={{ width: 220, height: 220, top: -70, right: -70 }} />
      <View className="absolute rounded-full bg-white/[0.06]" style={{ width: 280, height: 280, bottom: -110, left: -90 }} />

      <SafeAreaViewPlaceholder className="flex-1">
        <View className="px-6 pt-5">
          <Text className="text-2xl font-bold text-white" style={{ letterSpacing: -0.5 }}>
            Kimu <Text className="font-sans text-white/80">Drive</Text>
          </Text>
          <View className="mt-2 h-[3px] w-9 rounded-full bg-accent" />
        </View>

        <View className="flex-1 justify-center px-6">
          <View className="w-full max-w-[440px] self-center">
            <Text className="text-center text-[32px] leading-tight text-white font-display">{t('driverTagline')}</Text>
            <Text className="font-sans mt-3 text-center text-base leading-relaxed text-white/80">{t('driverTaglineSub')}</Text>

            <Pressable 
              accessibilityRole="button" 
              accessibilityLabel={t('login')} 
              className="mt-9 h-button w-full items-center justify-center rounded bg-white" 
              onPress={() => router.push('/(driver-auth)/login')} 
            > 
              <Text className="text-base font-semibold text-primary">{t('login')}</Text> 
            </Pressable>
          </View>
        </View>
      </SafeAreaViewPlaceholder>
    </LinearGradient>
  );
}
