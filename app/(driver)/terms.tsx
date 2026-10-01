import { View } from 'react-native';

import { Screen, ScreenHeader, Text } from '../../components/ui';
import { useTranslation } from '../../hooks/useTranslation';

const SECTIONS = [1, 2, 3, 4, 5, 6, 7] as const;

export default function DriverTermsScreen() {
  const { t } = useTranslation();
  return (
    <Screen background="surface" header={<ScreenHeader back title={t('driverTermsTitle')} />}>
      <Text variant="title-3" style={{ marginTop: 4 }}>{t('termsOfServiceTitle')}</Text>
      {SECTIONS.map((n) => (
        <View key={n} className="mt-5">
          <Text variant="headline">{t(`termsSection${n}Title` as any)}</Text>
          <Text variant="subhead" tone="muted" style={{ marginTop: 4 }}>{t(`termsSection${n}Body` as any)}</Text>
        </View>
      ))}
    </Screen>
  );
}
