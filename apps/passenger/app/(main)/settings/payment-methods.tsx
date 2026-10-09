import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ScreenShell } from '@kimu/shared/components/ScreenShell';

import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { getBookablePaymentMethods } from '../../../services/ride-service';
import { getWallet } from '../../../services/wallet-service';
import { usePaymentPrefStore } from '../../../stores/usePaymentPrefStore';

type IconName = keyof typeof Ionicons.glyphMap;
const ICON: Record<string, IconName> = {
  cash: 'cash-outline',
  mtn_momo: 'phone-portrait-outline',
  airtel_money: 'phone-portrait-outline',
  wallet: 'wallet-outline',
};

// The Payments screen from the reference, in Kimu style: actions to add a
// wallet or a card on top, then every bookable method with a star that marks
// it the default for new bookings.
export default function PaymentMethodsScreen() {
  const { t } = useTranslation();
  const methods = getBookablePaymentMethods();
  const defaultId = usePaymentPrefStore((s) => s.defaultId);
  const setDefault = usePaymentPrefStore((s) => s.setDefault);
  const hydrate = usePaymentPrefStore((s) => s.hydrate);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    hydrate();
    getWallet().then((w) => setBalance(w.balance)).catch(() => setBalance(null));
  }, [hydrate]);

  return (
    <ScreenShell title={t('drawerPayments')} back background="bg-white" backLabel={t('back')}>
      <View className="px-5 pt-1">
      </View>
      <ScrollView contentContainerClassName="px-6 pb-28 pt-2" showsVerticalScrollIndicator={false}>

        {/* Add actions */}
        <View className="mt-4 gap-3">
          <ActionRow icon="wallet-outline" label={t('addWalletAccount')} onPress={() => router.push('/(main)/wallet/top-up')} />
          <ActionRow icon="card-outline" label={t('addCard')} badge={t('comingSoon')} disabled />
        </View>

        <Text className="mt-6 text-[13px] font-semibold uppercase tracking-wide text-text-secondary">{t('payWith')}</Text>
        <View className="mt-2 gap-3">
          {methods.map((m) => {
            const isDefault = m.id === defaultId;
            const detail = m.id === 'wallet' && balance != null ? t('balanceAmount', { amount: Math.round(balance).toLocaleString() }) : undefined;
            return (
              <Pressable
                key={m.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: isDefault }}
                onPress={() => setDefault(m.id)}
                className="flex-row items-center rounded-2xl border bg-white p-4"
                style={{ borderColor: isDefault ? '#0E7C4A' : '#E5E7EB', borderWidth: isDefault ? 1.5 : 1 }}
              >
                <View className="h-11 w-11 items-center justify-center rounded-full bg-primary/10">
                  <Ionicons name={ICON[m.id] ?? 'card-outline'} size={21} color="#0E7C4A" />
                </View>
                <View className="ml-3 flex-1">
                  <Text className="text-[15px] font-bold text-ink">{m.name}</Text>
                  {detail ? <Text className="font-sans mt-0.5 text-xs text-text-secondary">{detail}</Text> : null}
                </View>
                <Ionicons name={isDefault ? 'star' : 'star-outline'} size={24} color={isDefault ? '#0E7C4A' : '#C7CDD4'} />
              </Pressable>
            );
          })}
        </View>

        <Text className="font-sans mt-6 text-xs leading-5 text-text-secondary">{t('paymentMethodsNote')}</Text>
        <Text className="font-sans mt-2 text-xs leading-5 text-text-secondary">{t('paymentSecurityNotice')}</Text>
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 flex-row items-center justify-center bg-ink px-6 py-3.5">
        <Ionicons name="star" size={15} color="#fff" />
        <Text className="ml-2 text-center text-[13px] font-medium text-white">{t('defaultOnBookingNote')}</Text>
      </View>
    </ScreenShell>
  );
}

function ActionRow({ icon, label, onPress, badge, disabled }: { icon: IconName; label: string; onPress?: () => void; badge?: string; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={disabled ? undefined : onPress}
      className="flex-row items-center rounded-2xl border border-border bg-white p-4"
      style={disabled ? { opacity: 0.6 } : undefined}
    >
      <View className="h-11 w-11 items-center justify-center rounded-full bg-gray-light">
        <Ionicons name={icon} size={21} color="#6B7280" />
      </View>
      <Text className="ml-3 flex-1 text-[15px] font-semibold text-ink">{label}</Text>
      {badge ? (
        <View className="rounded-full bg-accent-soft px-2.5 py-1">
          <Text className="text-[11px] font-semibold text-accent-dark">{badge}</Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={18} color="#C7CDD4" />
      )}
    </Pressable>
  );
}
