import { View, Text, SafeAreaView } from 'react-native';
import { router } from 'expo-router';

import { Button } from '../../components/Button';
import { useTranslation } from '../../hooks/useTranslation';

export default function WelcomeScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-3xl font-bold text-primary">FEM C@BS</Text>
        <Text className="mt-2 text-center text-text-secondary">{t('safeReliableRides')}</Text>
      </View>
      <View className="gap-3 px-6 pb-8">
        <Button title={t('getStarted')} onPress={() => router.push('/(auth)/signup')} />
        <Button title={t('login')} variant="outline" onPress={() => router.push('/(auth)/login')} />
      </View>
    </SafeAreaView>
  );
}
