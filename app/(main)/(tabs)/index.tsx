import { View, Text, SafeAreaView } from 'react-native';

import { useTranslation } from '../../../hooks/useTranslation';
import { useAuthStore } from '../../../stores/useAuthStore';

// Placeholder — the real home screen (map, pickup search, nearby drivers)
// lands in Phase 2.
export default function HomeScreen() {
  const { t } = useTranslation();
  const currentUser = useAuthStore((s) => s.currentUser);

  return (
    <SafeAreaView className="flex-1 bg-bg-light">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-2xl font-bold text-primary">{t('home')}</Text>
        <Text className="mt-2 text-text-secondary">
          {currentUser ? `${t('welcomeBack')}, ${currentUser.fullName}` : ''}
        </Text>
      </View>
    </SafeAreaView>
  );
}
