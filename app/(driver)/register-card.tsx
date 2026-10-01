import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../components/SafeAreaViewPlaceholder';
import { BackHeader } from '../../components/BackHeader';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { Ionicons } from '@expo/vector-icons';

import { useTranslation } from '../../hooks/useTranslation';
import { getRegisteredCard, saveRegisteredCard, RegisteredCard } from '../../utils/driver-device';

// Card registration screen — the reference's "Andikisha ikarita". Collects
// card details and stores them on this device (masked). There is no payment
// processor wired up yet, so the note explains that online card payments will
// follow; the saved card shows up on the dashboard/current-trip flow.
export default function DriverRegisterCardScreen() {
  const { t } = useTranslation();
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [name, setName] = useState('');
  const [saved, setSaved] = useState<RegisteredCard | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  function formatNumber(raw: string): string {
    return raw.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
  }

  function formatExpiry(raw: string): string {
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
  }

  useEffect(() => {
    getRegisteredCard().then(setSaved).catch(() => {});
  }, []);

  async function save() {
    const clean = number.replace(/\s/g, '');
    if (clean.length < 16) return setError(t('driverCardNumberError'));
    if (expiry.length < 5) return setError(t('driverCardExpiryError'));
    if (name.trim().length < 3) return setError(t('driverCardNameError'));
    setError(undefined);
    setSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    await saveRegisteredCard({ last4: clean.slice(-4), name: name.trim(), expiry });
    const fresh = await getRegisteredCard();
    setSaved(fresh);
    setSaving(false);
    setNumber('');
    setExpiry('');
    setName('');
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-dark-bg">
      <ScrollView contentContainerClassName="px-5 pb-10">
        <BackHeader title={t('driverRegisterCardTitle')} />

        {saved ? (
          <View className="mt-2 rounded-2xl border border-primary bg-dark-surface p-4">
            <View className="flex-row items-center">
              <Ionicons name="card" size={20} color="#16A34A" />
              <Text className="ml-2.5 flex-1 text-[14.5px] text-dark-text">
                •••• •••• •••• {saved.last4}
              </Text>
            </View>
            <Text className="mt-2 text-[13px] text-dark-sub">{saved.name} · {saved.expiry}</Text>
            <Text className="mt-2 text-[12px] text-primary">{t('driverCardSaved')}</Text>
          </View>
        ) : null}

        <View className="mt-5 gap-4">
          <Input
            label={t('driverCardNumber')}
            value={number}
            onChangeText={(v) => setNumber(formatNumber(v))}
            keyboardType="number-pad"
            placeholder="0000 0000 0000 0000"
            dark
          />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Input
                label={t('driverCardExpiry')}
                value={expiry}
                onChangeText={(v) => setExpiry(formatExpiry(v))}
                keyboardType="number-pad"
                placeholder="MM/YY"
                dark
              />
            </View>
            <View className="flex-1">
              <Input
                label={t('driverCardFullName')}
                value={name}
                onChangeText={setName}
                placeholder="A. Name"
                dark
              />
            </View>
          </View>

          {error ? <Text className="text-xs text-error">{error}</Text> : null}

          <Button title={t('driverConfirm')} onPress={save} loading={saving} />
        </View>

        <View className="mt-6 flex-row items-start rounded-2xl border border-dark-border bg-dark-surface px-4 py-3.5">
          <Ionicons name="information-circle-outline" size={18} color="#5C6B8E" style={{ marginTop: 1 }} />
          <Text className="ml-2.5 flex-1 text-[12.5px] leading-5 text-dark-sub">{t('driverCardNote')}</Text>
        </View>
      </ScrollView>
    </SafeAreaViewPlaceholder>
  );
}