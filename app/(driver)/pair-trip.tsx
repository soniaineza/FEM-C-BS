import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../components/SafeAreaViewPlaceholder';
import { BackHeader } from '../../components/BackHeader';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';

import { useTranslation } from '../../hooks/useTranslation';
import { useDriverAuthStore } from '../../stores/useDriverAuthStore';
import { getTerminalId } from '../../utils/driver-device';

// QR pairing screen — mirrors the reference "Ihuze n'urugendo" flow. Shows a
// fresh pairing code whose payload regenerates every ~20s (a rolling counter
// keeps the code single-use); the passenger scans it in their app to link the
// trip. No backend endpoint exists for pairing yet, so the code carries the
// driver's identity and rolls over on a timer.
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
    <SafeAreaViewPlaceholder className="flex-1 bg-dark-bg">
      <ScrollView contentContainerClassName="flex-grow px-5 pb-8">
        <BackHeader title={t('driverPairTripAction')} />

        <View className="mt-2 items-center">
          <View className="rounded-3xl border border-dark-border bg-dark-surface p-6" style={{ shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 3 }}>
            <View className="rounded-2xl bg-white p-4">
              <QRCode value={payload} size={208} color="#0B1220" backgroundColor="#FFFFFF" />
            </View>
            <Text className="mt-4 text-base font-bold text-dark-text">{t('driverQrPairing')}</Text>
            <Text className="mt-1.5 text-center text-[12.5px] leading-4 text-dark-sub">{t('driverQrSubtitle')}</Text>
          </View>

          {(currentDriver?.fullName || currentDriver?.vehiclePlate) ? (
            <View className="mt-4 w-full flex-row items-center justify-center rounded-2xl border border-dark-border bg-dark-surface px-4 py-3">
              <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(14,124,74,0.16)' }}>
                <Ionicons name="person" size={16} color="#0E7C4A" />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-[14px] font-bold text-dark-text" numberOfLines={1}>{currentDriver?.fullName}</Text>
                <Text className="text-[12px] font-medium text-primary">{currentDriver?.vehiclePlate || '—'}</Text>
              </View>
            </View>
          ) : null}

          <View className="mt-5 flex-row items-center justify-center">
            <Ionicons name="sync-outline" size={14} color="#5C6B8E" />
            <Text className="ml-1.5 text-[12px] text-dark-muted">{t('driverQrRefreshing')}</Text>
          </View>
          <Text className="mt-3 text-center text-[12.5px] leading-4 text-dark-muted">{t('driverQrHint')}</Text>
        </View>
      </ScrollView>
    </SafeAreaViewPlaceholder>
  );
}