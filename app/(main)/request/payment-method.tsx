import { View, Text, SafeAreaView, FlatList, Pressable } from 'react-native';
import { router } from 'expo-router';

import { Button } from '../../../components/Button';
import { useTranslation } from '../../../hooks/useTranslation';
import { useRideWizardStore } from '../../../stores/useRideWizardStore';
import { getBookablePaymentMethods } from '../../../services/ride-service';
import { PaymentMethod } from '../../../types/payment';

export default function PaymentMethodScreen() {
  const { t } = useTranslation();
  const paymentMethod = useRideWizardStore((s) => s.paymentMethod);
  const setPaymentMethod = useRideWizardStore((s) => s.setPaymentMethod);

  // Only methods the backend can actually charge (no 'card' placeholder).
  const methods = getBookablePaymentMethods();

  function choose(method: PaymentMethod) {
    setPaymentMethod(method);
  }

  function proceed() {
    if (paymentMethod) router.push('/(main)/request/confirm-ride');
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6 pt-6">
        <Text className="text-xl font-bold text-ink">{t('paymentMethod')}</Text>

        <FlatList
          className="mt-4"
          data={methods}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => {
            const selected = paymentMethod?.id === item.id;
            return (
              <Pressable
                className={`mb-3 rounded border p-4 ${selected ? 'border-primary bg-primary/5' : 'border-border'}`}
                onPress={() => choose(item)}
              >
                <Text className="text-base font-medium text-ink">{item.name}</Text>
              </Pressable>
            );
          }}
        />

        <View className="mt-auto pb-8">
          <Button title={t('continueLabel')} onPress={proceed} disabled={!paymentMethod} />
        </View>
      </View>
    </SafeAreaView>
  );
}
