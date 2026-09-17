import { View, Text, SafeAreaView, ScrollView } from 'react-native';

import { useTranslation } from '../../../hooks/useTranslation';

const SECTIONS = [1, 2, 3, 4, 5, 6, 7] as const;

export default function PrivacyScreen() {
  const { t } = useTranslation();
  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerClassName="px-6 pt-6 pb-10">
        <Text className="text-xl font-bold text-ink">{t('privacyPolicyTitle')}</Text>
        {SECTIONS.map((n) => (
          <View key={n} className="mt-5">
            <Text className="text-base font-semibold text-ink">{t(`privacySection${n}Title` as any)}</Text>
            <Text className="mt-1 text-sm text-text-secondary">{t(`privacySection${n}Body` as any)}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
