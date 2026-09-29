import { View, Text, Image, Pressable, ScrollView } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../components/SafeAreaViewPlaceholder';
import { LinearGradient } from 'expo-linear-gradient';
import { FemGradients } from '../../constants/theme';
import { router, Redirect } from 'expo-router';

import { Button } from '../../components/Button';
import { BackHeader } from '../../components/BackHeader';
import { useTranslation } from '../../hooks/useTranslation';
import { useAppModeStore } from '../../stores/useAppModeStore';
import { useLocaleStore } from '../../stores/useLocaleStore';
import { useAuthStore } from '../../stores/useAuthStore';

// Direct port of lib/screens/auth/welcome_screen.dart's layout: a top hero
// panel (gradient + two soft "blob" decorations + the car photo in a
// circular frame + the FEM C@BS wordmark) over a bottom content panel
// (tagline, subtitle, CTA, login link). Carried over from Flutter 1:1 since
// dropping it during the migration (an earlier, text-only pass) was flagged
// as a real visual regression.
export default function WelcomeScreen() {
  const { t } = useTranslation();
  const setMode = useAppModeStore((s) => s.setMode);
  const hasChosenLanguage = useLocaleStore((s) => s.hasChosenLanguage);
  const pendingPassenger = useAuthStore((s) => s.pendingPassenger);

  // Language must be chosen before login on first launch.
  if (!hasChosenLanguage) return <Redirect href="/(auth)/language" />;
  if (pendingPassenger) return <Redirect href="/(auth)/verification" />;

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-surface">
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}>
      <View className="px-5 pt-2">
        <BackHeader onBack={() => router.push('/(auth)/language')} />
      </View>
      <View className="px-5 pt-1" style={{ flexGrow: 6, minHeight: 260 }}>
        <View className="flex-1 overflow-hidden rounded-sheet">
          <LinearGradient
            colors={[...FemGradients.hero]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ flex: 1 }}
          >
            <View
              className="absolute rounded-full bg-surface/10"
              style={{ width: 120, height: 120, top: -30, right: -30 }}
            />
            <View
              className="absolute rounded-full bg-surface/[0.08]"
              style={{ width: 140, height: 140, bottom: -40, left: -20 }}
            />

            <View className="absolute left-6 top-7 flex-row items-center">
              <Text className="text-title-1 font-bold text-white" style={{ letterSpacing: -0.5 }}>
                FEM
              </Text>
              <View className="w-1" />
              <Text className="text-title-1 font-bold text-white/85" style={{ letterSpacing: -0.5 }}>
                C@BS
              </Text>
            </View>

            <View className="flex-1 items-center justify-center">
              <View className="h-[150px] w-[150px] overflow-hidden rounded-full">
                <Image
                  source={require('../../assets/car_image.jpg')}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="cover"
                />
              </View>
            </View>
          </LinearGradient>
        </View>
      </View>

      <View className="justify-center px-5" style={{ flexGrow: 5, minHeight: 290 }}>
        <Text className="text-center text-title-1 leading-tight text-fg font-display">{t('tagline')}</Text>
        <Text className="mt-2.5 text-center leading-relaxed text-fg-muted">{t('safeReliableRides')}</Text>

        <View className="mt-7">
          <Button title={t('getStarted')} onPress={() => router.push('/(auth)/signup')} />
        </View>

        <View className="mt-4 flex-row justify-center">
          <Text className="text-fg-muted">{t('existingAccount')}</Text>
          <Pressable onPress={() => router.push('/(auth)/login')}>
            <Text className="font-bold text-primary-text">{t('login')}</Text>
          </Pressable>
        </View>
        <Pressable className="mt-6" onPress={() => setMode('driver')}>
          <Text className="text-center text-subhead text-fg-muted">
            {t('passengerSwitchToDriverHint')} <Text className="font-semibold text-primary-text">{t('switchToDriverApp')}</Text>
          </Text>
        </Pressable>
      </View>
          </ScrollView>
    </SafeAreaViewPlaceholder>
  );
}
