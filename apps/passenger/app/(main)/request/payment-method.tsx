import { View, Text, Pressable } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { SafeAreaViewPlaceholder } from '@kimu/shared/components/SafeAreaViewPlaceholder';
import { router } from 'expo-router';

import { Button } from '@kimu/shared/components/Button';
import { Input } from '@kimu/shared/components/Input';
import { BackHeader } from '@kimu/shared/components/BackHeader';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { useRideWizardStore } from '../../../stores/useRideWizardStore';
import { getBookablePaymentMethods } from '../../../services/ride-service';
import { PaymentMethod } from '@kimu/shared/types/payment';
import { useAuthStore } from '../../../stores/useAuthStore';

export default function PaymentMethodScreen() {
  const { t } = useTranslation();
  const paymentMethod = useRideWizardStore((s) => s.paymentMethod);
  const setPaymentMethod = useRideWizardStore((s) => s.setPaymentMethod);
  const paymentPhone = useRideWizardStore((s) => s.paymentPhone);
  const setPaymentPhone = useRideWizardStore((s) => s.setPaymentPhone);
  const accountPhone = useAuthStore((s) => s.currentUser?.phone ?? '');

  // Only methods the backend can actually charge (no 'card' placeholder).
  const methods = getBookablePaymentMethods();

  function choose(method: PaymentMethod) {
    setPaymentMethod(method);
    // Start from the account number so the rider never has to retype it.
    if (method.type === 'mobileMoney' && !paymentPhone) setPaymentPhone(accountPhone);
  }

  function proceed() {
    if (paymentMethod) router.push('/(main)/request/confirm-ride');
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-white">
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerClassName="flex-grow px-6 pt-2">
        <BackHeader />
        <Text className="mt-1 text-xl text-ink font-display">{t('paymentMethod')}</Text>

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
            <Text className="mt-1.5 text-xs text-text-secondary">{t('paymentPhoneHint')}</Text>
          </View>
        ) : null}

        <View className="mt-auto pb-8 pt-6">
          <Button title={t('continueLabel')} onPress={proceed} disabled={!paymentMethod} />
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaViewPlaceholder>
  );
}
