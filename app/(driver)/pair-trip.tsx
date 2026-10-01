import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';

import { Card } from '../../components/Card';
import { Avatar, Screen, ScreenHeader, Text } from '../../components/ui';
import { Colors } from '../../constants/theme';
import { useTranslation } from '../../hooks/useTranslation';
import { useDriverAuthStore } from '../../stores/useDriverAuthStore';
import { getTerminalId } from '../../utils/driver-device';

// QR pairing: shows a pairing code whose payload rolls over every ~20s (a
// counter keeps each code single-use) for the rider to scan. There is no
// backend pairing endpoint yet, so the code carries the driver's identity.
const REFRESH_MS = 20000;

export default function DriverPairTripScreen() {
  const { t } = useTranslation();
  const currentDriver = useDriverAuthStore((s) => s.currentDriver);
  const [terminalId, setTerminalId] = useState('...');
  const [counter, setCounter] = useState(0);

  useEffect(() => {
    getTerminalId().then(setTerminalId).catch(() => {});
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setCounter((c) => c + 1), REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  const payload = useMemo(
    () => `femcabs://pair?d=${encodeURIComponent(currentDriver?.phone ?? '')}&t=${encodeURIComponent(terminalId)}&c=${counter}`,
    [currentDriver?.phone, terminalId, counter]
  );

  return (
    <Screen header={<ScreenHeader back title={t('driverPairTripAction')} />}>
      <View className="mt-2 items-center">
        <Card className="items-center p-6">
          <View className="rounded-2xl bg-white p-3">
            <QRCode value={payload} size={208} color={Colors.fg} backgroundColor="#FFFFFF" />
          </View>
          <Text variant="headline" style={{ marginTop: 16 }}>{t('driverQrPairing')}</Text>
          <Text variant="footnote" tone="muted" align="center" style={{ marginTop: 6 }}>{t('driverQrSubtitle')}</Text>
        </Card>

        {currentDriver?.fullName ? (
          <Card className="mt-4 w-full flex-row items-center">
            <Avatar name={currentDriver.fullName} size={40} />
            <View className="ml-3 flex-1">
              <Text variant="callout" weight="semibold" numberOfLines={1}>{currentDriver.fullName}</Text>
              <Text variant="footnote" tone="primary">{currentDriver.vehiclePlate || '—'}</Text>
            </View>
          </Card>
        ) : null}

        <View className="mt-5 flex-row items-center">
          <Ionicons name="sync-outline" size={14} color={Colors['fg-subtle']} />
          <Text variant="caption" tone="subtle" style={{ marginLeft: 6 }}>{t('driverQrRefreshing')}</Text>
        </View>
        <Text variant="caption" tone="subtle" align="center" style={{ marginTop: 8 }}>{t('driverQrHint')}</Text>
      </View>
    </Screen>
  );
}
