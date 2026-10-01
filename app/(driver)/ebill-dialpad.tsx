import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Pressable } from '../../components/ui/Pressable';
import { Banner, Screen, ScreenHeader, Text } from '../../components/ui';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Colors } from '../../constants/theme';
import { useTranslation } from '../../hooks/useTranslation';
import { getEbillingPhone, saveEbillingPhone } from '../../utils/driver-device';
import { validators } from '../../utils/validators';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

// E-Bill entry: a dial pad that takes the rider's phone number for electronic
// billing. The number is validated and stored on the device until a payment
// processor / backend endpoint can carry it to the server.
export default function DriverEbillingDialpadScreen() {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [savedNumber, setSavedNumber] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getEbillingPhone().then(setSavedNumber).catch(() => {});
  }, []);

  function pressKey(key: string) {
    setError(undefined);
    if (phone.length >= 13) return;
    setPhone((p) => p + key);
  }

  async function confirm() {
    const err = validators.phone(phone, t('invalidPhoneHint'));
    if (err) return setError(err);
    const normalized = phone.startsWith('0') ? `+250${phone.slice(1)}` : phone;
    setSaving(true);
    try {
      await saveEbillingPhone(normalized);
      setSavedNumber(normalized);
      setPhone('');
    } catch {
      setError(t('requestFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      background="surface"
      scroll={false}
      header={<ScreenHeader back title={t('driverEbillingTitle')} subtitle={t('driverEbillingSubtitle')} />}
      footer={<Button title={t('driverEbillingConfirm')} onPress={confirm} loading={saving} disabled={!phone} />}
    >
      <Card className="mt-2 items-center py-5">
        <Text variant="title-1" style={{ letterSpacing: 3 }}>{phone || '…'}</Text>
        <Text variant="caption" tone="subtle" style={{ marginTop: 6 }}>{t('driverEbillingNumberPlaceholder')}</Text>
      </Card>

      {savedNumber ? (
        <View className="mt-3">
          <Banner tone="success" message={`${savedNumber} — ${t('driverEbillingLinked')}`} />
        </View>
      ) : null}
      {error ? <View className="mt-3"><Banner tone="danger" message={error} /></View> : null}

      <View className="mt-4 gap-3">
        {[0, 1, 2, 3].map((row) => (
          <View key={row} className="flex-row gap-3">
            {KEYS.slice(row * 3, row * 3 + 3).map((key) => (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={key}
                onPress={() => pressKey(key)}
                className="h-14 flex-1 items-center justify-center rounded-2xl bg-surface-muted"
              >
                <Text variant="title-2">{key}</Text>
              </Pressable>
            ))}
          </View>
        ))}
        <View className="flex-row gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear"
            onPress={() => { setPhone(''); setError(undefined); }}
            className="h-14 flex-1 items-center justify-center rounded-2xl bg-surface-muted"
          >
            <Text variant="callout" weight="bold">C</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Backspace"
            onPress={() => { setError(undefined); setPhone((p) => p.slice(0, -1)); }}
            className="h-14 flex-1 items-center justify-center rounded-2xl bg-surface-muted"
          >
            <Ionicons name="backspace-outline" size={22} color={Colors.fg} />
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}
