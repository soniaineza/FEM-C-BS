import { View, Text, FlatList } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';

import { BackHeader } from '../../../components/BackHeader';
import { useTranslation } from '../../../hooks/useTranslation';
import { getAvailablePaymentMethods } from '../../../services/ride-service';

export default function PaymentMethodsScreen() {
  const { t } = useTranslation();
  const methods = getAvailablePaymentMethods();

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-white">
      <View className="flex-1 px-6 pt-2">
        <BackHeader />
        <Text className="mt-2 text-xl font-bold text-ink">{t('paymentMethods')}</Text>

        <FlatList
          className="mt-4"
          data={methods}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => (
            <View className="border-b border-border py-4">
              <Text className="text-base text-ink">{item.name}</Text>
            </View>
          )}
        />

        <Text className="mt-4 text-xs text-text-secondary">{t('paymentMethodsNote')}</Text>
        <Text className="mt-2 text-xs text-text-secondary">{t('paymentSecurityNotice')}</Text>
      </View>
    </SafeAreaViewPlaceholder>
  );
}
