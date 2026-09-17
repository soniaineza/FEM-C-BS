import { View, Text, SafeAreaView, Pressable } from 'react-native';
import { router } from 'expo-router';

import { RideMap } from '../../../components/RideMap';
import { useTranslation } from '../../../hooks/useTranslation';
import { useAuthStore } from '../../../stores/useAuthStore';
import { useRideWizardStore } from '../../../stores/useRideWizardStore';
import { MapDefaults } from '../../../services/location-service';

export default function HomeScreen() {
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.currentUser);
  const resetWizard = useRideWizardStore((s) => s.reset);

  function startRide() {
    resetWizard();
    router.push('/(main)/request/pickup');
  }

  return (
    <SafeAreaView className="flex-1 bg-bg-light">
      <View className="h-1/2 w-full">
        <RideMap center={MapDefaults} zoom={MapDefaults.zoom} />
      </View>
      <View className="flex-1 px-6 pt-6">
        <Text className="text-lg text-text-secondary">
          {currentUser ? currentUser.fullName : ''}
        </Text>
        <Text className="mt-1 text-2xl font-bold text-ink">{t('whereGoing')}</Text>

        <Pressable
          className="mt-6 h-button w-full items-center justify-center rounded bg-primary"
          onPress={startRide}
        >
          <Text className="text-base font-semibold text-white">{t('bookRide')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
