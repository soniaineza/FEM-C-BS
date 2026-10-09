import { View, Text, ScrollView } from 'react-native';
import { ScreenShell } from '@kimu/shared/components/ScreenShell';

import { useTranslation } from '@kimu/shared/hooks/useTranslation';

const SECTIONS = [1, 2, 3, 4, 5, 6, 7] as const;

export default function TermsScreen() {
  const { t } = useTranslation();
  return (
    <ScreenShell title={t('termsOfServiceTitle')} back background="bg-white" backLabel={t('back')}>
      <ScrollView contentContainerClassName="px-6 pt-2 pb-10">
        {SECTIONS.map((n) => (
          <View key={n} className="mt-5">
            <Text className="text-base font-semibold text-ink">{t(`termsSection${n}Title` as any)}</Text>
            <Text className="font-sans mt-1 text-sm text-text-secondary">{t(`termsSection${n}Body` as any)}</Text>
          </View>
        ))}
      </ScrollView>
    </ScreenShell>
  );
}
