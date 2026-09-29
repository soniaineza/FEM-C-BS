import { View, Text, Image, Pressable } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../components/SafeAreaViewPlaceholder';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

import { Button } from '../../components/Button';
import { useAppModeStore } from '../../stores/useAppModeStore';
import { useTranslation } from '../../hooks/useTranslation';

// Driver-side welcome screen — same hero-panel layout as the passenger
// welcome screen ((auth)/index.tsx) for visual consistency, fully
// translated (en/fr/rw) via the same locales/*.json dictionary the
// passenger app uses.
export default function DriverWelcomeScreen() {
  const { t } = useTranslation();
  const setMode = useAppModeStore((s) => s.setMode);

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-white">
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
                DRIVE
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
        <Text className="text-center text-2xl leading-tight text-ink font-display">{t('driverTagline')}</Text>
        <Text className="mt-2.5 text-center leading-relaxed text-text-secondary">{t('driverTaglineSub')}</Text>

        <View className="mt-7">
          <Button title={t('getStarted')} onPress={() => router.push('/(driver-auth)/register')} />
        </View>

        <View className="mt-4 flex-row justify-center">
          <Text className="text-text-secondary">{t('driverExistingAccount')} </Text>
          <Pressable onPress={() => router.push('/(driver-auth)/login')}>
            <Text className="font-bold text-primary">{t('login')}</Text>
          </Pressable>
        </View>

        <Pressable className="mt-6" onPress={() => setMode('passenger')}>
          <Text className="text-center text-sm text-text-secondary">
            {t('driverSwitchToRiderHint')} <Text className="font-semibold text-primary">{t('switchToRiderApp')}</Text>
          </Text>
        </Pressable>
      </View>
    </SafeAreaViewPlaceholder>
  );
}
