import { View } from 'react-native';

import { Card } from '../../components/Card';
import { Screen, ScreenHeader, Text } from '../../components/ui';
import { useTranslation } from '../../hooks/useTranslation';
import { formatFare } from '../../types/ride';
import { TARIFF } from '../../utils/tariff';

// Tariff information screen — the FEM rate card (utils/tariff.ts), the same
// numbers riders are quoted and the live meter charges.
export default function DriverTariffScreen() {
  const { t } = useTranslation();
  const rows: [string, string][] = [
    [t('tariffBaseLabel', { km: TARIFF.baseIncludedKm }), formatFare(TARIFF.baseFare)],
    [t('tariffStandardLabel', { from: TARIFF.baseIncludedKm, to: TARIFF.longTripFromKm }), t('tariffPerKmValue', { amount: formatFare(TARIFF.perKm) })],
    [t('tariffLongLabel', { from: TARIFF.longTripFromKm }), t('tariffPerKmValue', { amount: formatFare(TARIFF.perKmLongTrip) })],
    [
      t('tariffWaitingLabel'),
      t('tariffWaitingValue', { free: TARIFF.freeWaitingMinutes, charge: formatFare(TARIFF.waitingChargePerBlock), block: TARIFF.waitingBlockMinutes }),
    ],
  ];

  return (
    <Screen header={<ScreenHeader back title={t('driverTariffTitle')} />}>
      <Card padded={false} className="mt-2 px-4">
        {rows.map(([label, value], i) => (
          <View key={label} className={`flex-row items-center justify-between py-3.5 ${i > 0 ? 'border-t border-divider' : ''}`}>
            <Text variant="subhead" tone="muted" style={{ flex: 1, marginRight: 12 }}>{label}</Text>
            <Text variant="callout" weight="semibold" style={{ flex: 1, textAlign: 'right' }}>{value}</Text>
          </View>
        ))}
      </Card>
      <Text variant="footnote" tone="muted" align="center" style={{ marginTop: 12 }}>{t('tariffOneRateNote')}</Text>
      <Text variant="footnote" tone="subtle" align="center" style={{ marginTop: 4 }}>{t('driverTariffNote')}</Text>
    </Screen>
  );
}
