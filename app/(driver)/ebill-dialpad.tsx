import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../components/SafeAreaViewPlaceholder';
import { BackHeader } from '../../components/BackHeader';
import { Ionicons } from '@expo/vector-icons';

import { useTranslation } from '../../hooks/useTranslation';
import { getEbillingPhone, saveEbillingPhone } from '../../utils/driver-device';
import { validators } from '../../utils/validators';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

// E-Bill entry screen — a dial pad (the reference's "Inomero ya telefone kuri
// E-Bill" keypad) that accepts the rider's phone number for electronic
// billing. The number is validated, stored on the device, and "linked" to the
// current trip until a payment processor / backend endpoint exists to carry
// the number to the server.
export default function DriverEbillingDialpadScreen() {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [savedNumber, setSavedNumber] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();

  function pressKey(key: string) {
    setError(undefined);
    if (phone.length >= 13) return;
    setPhone((p) => p + key);
  }

  function backspace() {
    setError(undefined);
    setPhone((p) => p.slice(0, -1));
  }

  async function confirm() {
    const err = validators.phone(phone, t('invalidPhoneHint'));
    if (err) return setError(err);
    const normalized = phone.startsWith('0') ? `+250${phone.slice(1)}` : phone;
    await saveEbillingPhone(normalized);
    setSavedNumber(normalized);
    setPhone('');
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-dark-bg">
      <View className="flex-1 px-5 pb-6">
        <BackHeader title={t('driverEbillingTitle')} />

        <Text className="mt-1 text-[13.5px] leading-5 text-dark-sub">{t('driverEbillingSubtitle')}</Text>

        {/* Number display *) */}
        <View className="mt-4 items-center rounded-2xl border border-dark-border bg-dark-surface px-4 py-5">
          <Text className="text-3xl font-bold tracking-widest text-dark-text">{phone || '…'}</Text>
          <Text className="mt-2 text-[11.5px] text-dark-muted">{t('driverEbillingNumberPlaceholder')}</Text>
        </View>

        {savedNumber ? (
          <View className="mt-3 flex-row items-center rounded-xl border border-primary bg-dark-surface px-3.5 py-2.5">
            <Ionicons name="checkmark-circle" size={18} color="#0E7C4A" />
            <Text className="ml-2 flex-1 text-[12.5px] text-dark-text">
              {savedNumber} — {t('driverEbillingLinked')}
            </Text>
          </View>
        ) : null}

        {error ? (
          <View className="mt-3 flex-row items-center rounded-xl border px-3.5 py-2.5" style={{ borderColor: 'rgba(220,38,38,0.4)', backgroundColor: 'rgba(220,38,38,0.08)' }}>
            <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
            <Text className="ml-2 flex-1 text-[12.5px] text-dark-text">{error}</Text>
          </View>
        ) : null}

        <View className="mt-5 gap-3">
          {[0, 1, 2].map((row) => (
            <View key={row} className="flex-row gap-3">
              {KEYS.slice(row * 3, row * 3 + 3).map((key) => (
                <DialKey key={key} label={key} onPress={() => pressKey(key)} />
              ))}
            </View>
          ))}
          <View className="flex-row gap-3">
            <Pressable className="h-16 flex-1 items-center justify-center rounded-2xl border border-dark-border bg-dark-surface-2" onPress={backspace}>
              <Ionicons name="backspace-outline" size={22} color="#93A3C8" />
            </Pressable>
            <Pressable
              className="h-16 flex-none items-center justify-center rounded-2xl px-10"
              style={{ backgroundColor: '#0E7C4A' }}
              onPress={confirm}
            >
              <Text className="text-lg font-bold text-white">{t('driverEbillingConfirm')}</Text>
            </Pressable>
            <Pressable className="h-16 flex-1 items-center justify-center rounded-2xl border border-dark-border bg-dark-surface-2" onPress={() => { setPhone(''); setError(undefined); }}>
              <Text className="text-sm font-bold text-dark-text">C</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </SafeAreaViewPlaceholder>
  );
}

function DialKey({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable className="h-16 flex-1 items-center justify-center rounded-2xl border border-dark-border bg-dark-surface" onPress={onPress}>
      <Text className="text-xl font-semibold text-dark-text">{label}</Text>
    </Pressable>
  );
}