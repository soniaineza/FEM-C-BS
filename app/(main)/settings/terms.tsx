import { View, Text, ScrollView } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';

import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { useTranslation } from '../../../hooks/useTranslation';

const SECTIONS = [1, 2, 3, 4, 5, 6, 7] as const;

export default function TermsScreen() {
  const { t } = useTranslation();
  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-surface">
      <ScrollView contentContainerClassName="px-5 pt-2 pb-10">
        <ScreenHeader back title={t('termsOfServiceTitle')} />
        {SECTIONS.map((n) => (
          <View key={n} className="mt-5">
            <Text className="text-body font-semibold text-fg">{t(`termsSection${n}Title` as any)}</Text>
            <Text className="mt-1 text-subhead text-fg-muted">{t(`termsSection${n}Body` as any)}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaViewPlaceholder>
  );
}
