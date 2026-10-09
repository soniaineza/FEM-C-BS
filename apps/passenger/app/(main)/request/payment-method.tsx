import { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { ScreenShell } from '@kimu/shared/components/ScreenShell';
import { router } from 'expo-router';

import { Button } from '@kimu/shared/components/Button';
import { Input } from '@kimu/shared/components/Input';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { useRideWizardStore } from '../../../stores/useRideWizardStore';
import { getBookablePaymentMethods } from '../../../services/ride-service';
import { PaymentMethod } from '@kimu/shared/types/payment';
import { useAuthStore } from '../../../stores/useAuthStore';
import { usePaymentPrefStore } from '../../../stores/usePaymentPrefStore';

export default function PaymentMethodScreen() {
  const { t } = useTranslation();
  const paymentMethod = useRideWizardStore((s) => s.paymentMethod);
  const setPaymentMethod = useRideWizardStore((s) => s.setPaymentMethod);
  const paymentPhone = useRideWizardStore((s) => s.paymentPhone);
  const setPaymentPhone = useRideWizardStore((s) => s.setPaymentPhone);
  const accountPhone = useAuthStore((s) => s.currentUser?.phone ?? '');
  const defaultId = usePaymentPrefStore((s) => s.defaultId);
  const hydratePref = usePaymentPrefStore((s) => s.hydrate);
  const prefHydrated = usePaymentPrefStore((s) => s.isHydrated);

  // Only methods the backend can actually charge (no 'card' placeholder).
  const methods = getBookablePaymentMethods();

  useEffect(() => {
    hydratePref();
  }, [hydratePref]);

  // The method starred on the Payments screen is pre-selected on a new
  // booking, so the rider only taps here when paying a different way.
  useEffect(() => {
    // Wait for the saved default to load, or the starting value would be
    // locked in before the rider's own choice is even read.
    if (!prefHydrated || paymentMethod) return;
    const preferred = methods.find((m) => m.id === defaultId);
    if (!preferred) return;
    setPaymentMethod(preferred);
    if (preferred.type === 'mobileMoney' && !paymentPhone) setPaymentPhone(accountPhone);
    // Methods are a constant list, so only the saved default drives this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultId, prefHydrated, paymentMethod]);

  function choose(method: PaymentMethod) {
    setPaymentMethod(method);
    // Start from the account number so the rider never has to retype it.
    if (method.type === 'mobileMoney' && !paymentPhone) setPaymentPhone(accountPhone);
  }

  function proceed() {
    if (paymentMethod) router.push('/(main)/request/confirm-ride');
  }

  return (
    <ScreenShell title={t('paymentMethod')} back background="bg-white" backLabel={t('back')}>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerClassName="flex-grow px-6 pt-2">

        <View className="mt-4">
          {methods.map((item) => {
            const selected = paymentMethod?.id === item.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                aria-checked={selected}
                className={`mb-3 rounded border p-4 ${selected ? 'border-primary bg-primary/5' : 'border-border'}`}
                onPress={() => choose(item)}
              >
                <Text className="text-base font-medium text-ink">{item.name}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Prefilled with the account phone; the rider may pay from another number. */}
        {paymentMethod?.type === 'mobileMoney' ? (
          <View className="mt-1">
            <Input
              label={t('paymentPhoneLabel')}
              value={paymentPhone}
              onChangeText={setPaymentPhone}
              keyboardType="phone-pad"
              placeholder="07XXXXXXXX"
              prefixIcon="call-outline"
            />
            <Text className="font-sans mt-1.5 text-xs text-text-secondary">{t('paymentPhoneHint')}</Text>
          </View>
        ) : null}

        <View className="mt-auto pb-8 pt-6">
          <Button title={t('continueLabel')} onPress={proceed} disabled={!paymentMethod} />
        </View>
      </KeyboardAwareScrollView>
    </ScreenShell>
  );
}
