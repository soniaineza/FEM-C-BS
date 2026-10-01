import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { Banner, LoadingState, Screen, ScreenHeader, Text } from '../../components/ui';
import { Colors } from '../../constants/theme';
import { useTranslation } from '../../hooks/useTranslation';
import { getRegisteredCard, saveRegisteredCard, RegisteredCard } from '../../utils/driver-device';

// Card registration: collects card details and stores them (masked) on this
// device. No payment processor is wired up yet, so the note explains that
// online card payments will follow.
const formatNumber = (raw: string) => raw.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
const formatExpiry = (raw: string) => {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
};

export default function DriverRegisterCardScreen() {
  const { t } = useTranslation();
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [name, setName] = useState('');
  const [saved, setSaved] = useState<RegisteredCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getRegisteredCard().then(setSaved).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function save() {
    const clean = number.replace(/\s/g, '');
    if (clean.length < 16) return setError(t('driverCardNumberError'));
    if (expiry.length < 5) return setError(t('driverCardExpiryError'));
    if (name.trim().length < 3) return setError(t('driverCardNameError'));
    setError(undefined);
    setSaving(true);
    try {
      await saveRegisteredCard({ last4: clean.slice(-4), name: name.trim(), expiry });
      setSaved(await getRegisteredCard());
      setNumber('');
      setExpiry('');
      setName('');
    } catch {
      setError(t('requestFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen background="surface" header={<ScreenHeader back title={t('driverRegisterCardTitle')} />}>
      {loading ? (
        <LoadingState />
      ) : (
        <>
          {saved ? (
            <Card tone="tint" className="mt-2">
              <View className="flex-row items-center">
                <Ionicons name="card" size={20} color={Colors['primary-text']} />
                <Text variant="callout" style={{ marginLeft: 10, flex: 1 }}>•••• •••• •••• {saved.last4}</Text>
              </View>
              <Text variant="subhead" tone="muted" style={{ marginTop: 6 }}>{saved.name} · {saved.expiry}</Text>
              <Text variant="footnote" weight="semibold" tone="primary" style={{ marginTop: 6 }}>{t('driverCardSaved')}</Text>
            </Card>
          ) : null}

          <View className="mt-5 gap-4">
            <Input label={t('driverCardNumber')} value={number} onChangeText={(v) => setNumber(formatNumber(v))} keyboardType="number-pad" placeholder="0000 0000 0000 0000" prefixIcon="card-outline" />
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Input label={t('driverCardExpiry')} value={expiry} onChangeText={(v) => setExpiry(formatExpiry(v))} keyboardType="number-pad" placeholder="MM/YY" />
              </View>
              <View className="flex-1">
                <Input label={t('driverCardFullName')} value={name} onChangeText={setName} placeholder="A. Name" />
              </View>
            </View>
            {error ? <Banner tone="danger" message={error} /> : null}
            <Button title={t('driverConfirm')} onPress={save} loading={saving} />
          </View>

          <View className="mt-6">
            <Banner tone="info" message={t('driverCardNote')} />
          </View>
        </>
      )}
    </Screen>
  );
}
