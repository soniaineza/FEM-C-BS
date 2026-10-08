import { View, Text, ScrollView } from 'react-native';
import { SafeAreaViewPlaceholder } from '@kimu/shared/components/SafeAreaViewPlaceholder';
import { BackHeader } from '@kimu/shared/components/BackHeader';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';

const SECTIONS = [1, 2, 3, 4, 5, 6, 7] as const;

export default function DriverTermsScreen() {
  const { t } = useTranslation();
  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-dark-bg">
      <ScrollView contentContainerClassName="px-6 pt-2 pb-10">
        <BackHeader title={t('driverTermsTitle')} />
        <Text className="mt-2 text-xl font-bold text-dark-text">{t('termsOfServiceTitle')}</Text>
        {SECTIONS.map((n) => (
          <View key={n} className="mt-5">
            <Text className="text-base font-semibold text-dark-text">{t(`termsSection${n}Title` as any)}</Text>
            <Text className="mt-1 text-sm text-dark-sub">{t(`termsSection${n}Body` as any)}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaViewPlaceholder>
  );
}