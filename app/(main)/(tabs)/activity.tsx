import { View, Text, SafeAreaView } from 'react-native';

import { useTranslation } from '../../../hooks/useTranslation';

// Placeholder — ride history list lands in Phase 4.
export default function ActivityScreen() {
  const { t } = useTranslation();
  return (
    <SafeAreaView className="flex-1 bg-bg-light">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-2xl font-bold text-ink">{t('activity')}</Text>
      </View>
    </SafeAreaView>
  );
}
