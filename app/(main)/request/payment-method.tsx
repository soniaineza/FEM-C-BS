import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { Button } from '../../../components/Button';
import { PaymentMethodRow } from '../../../components/PaymentMethodRow';
import { Banner, Screen, ScreenHeader } from '../../../components/ui';
import { useTranslation } from '../../../hooks/useTranslation';
import { usePaymentMethods } from '../../../hooks/usePaymentMethods';
import { useRideWizardStore } from '../../../stores/useRideWizardStore';
import { getWallet } from '../../../services/wallet-service';
import { formatFare } from '../../../types/ride';

export default function PaymentMethodScreen() {
  const { t } = useTranslation();
  const paymentMethod = useRideWizardStore((s) => s.paymentMethod);
  const setPaymentMethod = useRideWizardStore((s) => s.setPaymentMethod);
  // Only methods the backend can charge now (card appears in demo mode).
  const { methods, demo } = usePaymentMethods();
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  useEffect(() => {
    getWallet()
      .then((w) => setWalletBalance(w.balance))
      .catch(() => setWalletBalance(null));
  }, []);

  return (
    <Screen
      background="surface"
      header={<ScreenHeader back title={t('paymentMethod')} />}
      footer={
        <Button title={t('continueLabel')} onPress={() => paymentMethod && router.push('/(main)/request/confirm-ride')} disabled={!paymentMethod} />
      }
    >
      {demo ? (
        <Banner tone="info" message={t('demoPaymentsNote')} />
      ) : null}
      <View style={{ marginTop: demo ? 16 : 8 }}>
        {methods.map((m) => (
          <PaymentMethodRow
            key={m.id}
            method={m}
            demo={demo && m.id !== 'cash'}
            selected={paymentMethod?.id === m.id}
            onPress={() => setPaymentMethod(m)}
            detail={m.id === 'wallet' && walletBalance != null ? t('walletBalanceShort', { amount: formatFare(walletBalance) }) : undefined}
          />
        ))}
      </View>
    </Screen>
  );
}
