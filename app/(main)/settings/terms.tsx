import { View, Text, ScrollView } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';

import { BackHeader } from '../../../components/BackHeader';
import { useTranslation } from '../../../hooks/useTranslation';

const SECTIONS = [1, 2, 3, 4, 5, 6, 7] as const;

export default function TermsScreen() {
  const { t } = useTranslation();
  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-white">
      <ScrollView contentContainerClassName="px-6 pt-2 pb-10">
        <BackHeader />
        <Text className="mt-2 text-xl font-bold text-ink">{t('termsOfServiceTitle')}</Text>
        {SECTIONS.map((n) => (
          <View key={n} className="mt-5">
            <Text className="text-base font-semibold text-ink">{t(`termsSection${n}Title` as any)}</Text>
            <Text className="mt-1 text-sm text-text-secondary">{t(`termsSection${n}Body` as any)}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaViewPlaceholder>
  );
}
