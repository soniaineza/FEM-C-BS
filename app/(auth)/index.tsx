import { View, Text, Image, SafeAreaView, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

import { Button } from '../../components/Button';
import { useTranslation } from '../../hooks/useTranslation';
import { useAppModeStore } from '../../stores/useAppModeStore';

// Direct port of lib/screens/auth/welcome_screen.dart's layout: a top hero
// panel (gradient + two soft "blob" decorations + the car photo in a
// circular frame + the FEM C@BS wordmark) over a bottom content panel
// (tagline, subtitle, CTA, login link). Carried over from Flutter 1:1 since
// dropping it during the migration (an earlier, text-only pass) was flagged
// as a real visual regression.
export default function WelcomeScreen() {
  const { t } = useTranslation();
  const setMode = useAppModeStore((s) => s.setMode);

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-6 pt-3" style={{ flex: 6 }}>
        <View className="flex-1 overflow-hidden rounded-[28px]">
          <LinearGradient
            colors={['#16A34A', '#0F7A38']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ flex: 1 }}
          >
            <View
              className="absolute rounded-full bg-white/10"
              style={{ width: 120, height: 120, top: -30, right: -30 }}
            />
            <View
              className="absolute rounded-full bg-white/[0.08]"
              style={{ width: 140, height: 140, bottom: -40, left: -20 }}
            />

            <View className="absolute left-6 top-7 flex-row items-center">
              <Text className="text-2xl font-bold text-white" style={{ letterSpacing: -0.5 }}>
                FEM
              </Text>
              <View className="w-1" />
              <Text className="text-2xl font-bold text-white/85" style={{ letterSpacing: -0.5 }}>
                C@BS
              </Text>
            </View>

            <View className="flex-1 items-center justify-center">
              <View className="h-[150px] w-[150px] overflow-hidden rounded-full">
                <Image
                  source={require('../../assets/car_image.png')}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="cover"
                />
              </View>
            </View>
          </LinearGradient>
        </View>
      </View>

      <View className="justify-center px-6" style={{ flex: 5 }}>
        <Text className="text-center text-2xl font-bold leading-tight text-ink">{t('tagline')}</Text>
        <Text className="mt-2.5 text-center leading-relaxed text-text-secondary">{t('safeReliableRides')}</Text>

        <View className="mt-7">
          <Button title={t('getStarted')} onPress={() => router.push('/(auth)/signup')} />
        </View>

        <View className="mt-4 flex-row justify-center">
          <Text className="text-text-secondary">{t('existingAccount')}</Text>
          <Pressable onPress={() => router.push('/(auth)/login')}>
            <Text className="font-bold text-primary">{t('login')}</Text>
          </Pressable>
        </View>          <Pressable className="mt-6" onPress={() => setMode('driver')}>
            <Text className="text-center text-sm text-text-secondary">
              {t('passengerSwitchToDriverHint')} <Text className="font-semibold text-primary">{t('switchToDriverApp')}</Text>
            </Text>
          </Pressable>
      </View>
    </SafeAreaView>
  );
}
