import { PaymentMethodRow } from '../../../components/PaymentMethodRow';
import { Banner, Screen, ScreenHeader, Text } from '../../../components/ui';
import { useTranslation } from '../../../hooks/useTranslation';
import { usePaymentMethods } from '../../../hooks/usePaymentMethods';

export default function PaymentMethodsScreen() {
  const { t } = useTranslation();
  const { methods, demo } = usePaymentMethods();

  return (
    <Screen background="surface" header={<ScreenHeader back title={t('paymentMethods')} />}>
      {demo ? <Banner tone="info" message={t('demoPaymentsNote')} /> : null}
      <Text variant="footnote" tone="muted" style={{ marginTop: 16, marginBottom: 10 }}>{t('paymentMethodsNote')}</Text>
      {methods.map((m) => (
        <PaymentMethodRow key={m.id} method={m} demo={demo && m.id !== 'cash'} />
      ))}
      <Text variant="caption" tone="subtle" style={{ marginTop: 8 }}>{t('paymentSecurityNotice')}</Text>
    </Screen>
  );
}
