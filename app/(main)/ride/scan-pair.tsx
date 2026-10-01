import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { Button } from '../../../components/Button';
import { Banner, EmptyState, LoadingState, Screen, ScreenHeader, Text } from '../../../components/ui';
import { useTranslation } from '../../../hooks/useTranslation';
import { pairRide } from '../../../services/ride-service';
import { goBack } from '../../../utils/navigation';

/** Reads the driver app's pairing code: femcabs://pair?d=<phone>&t=<terminal>&c=<counter>. */
function parsePairingCode(data: string): { terminalId: string; driverPhone: string } | null {
  const match = /^femcabs:\/\/pair\?(.*)$/.exec(data.trim());
  if (!match) return null;
  const params = new URLSearchParams(match[1]);
  const terminalId = params.get('t') ?? '';
  if (!terminalId) return null;
  return { terminalId, driverPhone: params.get('d') ?? '' };
}

// Rider side of QR pairing: scan the code on the driver's phone (driver app >
// trip > "Pair with trip") to link this ride to that driver's device.
export default function ScanPairScreen() {
  const { t } = useTranslation();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<'scanning' | 'pairing' | 'paired'>('scanning');
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  async function handleScan(data: string) {
    if (busy.current || state !== 'scanning' || !rideId) return;
    const code = parsePairingCode(data);
    if (!code) {
      setError(t('scanPairInvalid'));
      return;
    }
    busy.current = true;
    setError(null);
    setState('pairing');
    try {
      await pairRide(rideId, code.terminalId, code.driverPhone);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setState('paired');
    } catch {
      setError(t('scanPairFailed'));
      setState('scanning');
    } finally {
      busy.current = false;
    }
  }

  return (
    <Screen
      background="surface"
      scroll={false}
      header={<ScreenHeader back title={t('scanDriverCode')} />}
      footer={state === 'paired' ? <Button title={t('continueLabel')} onPress={() => goBack()} /> : undefined}
    >
      {!permission ? (
        <LoadingState />
      ) : !permission.granted ? (
        <EmptyState
          icon="camera-outline"
          title={t('scanDriverCode')}
          message={t('cameraPermissionBody')}
          actionLabel={t('allowCamera')}
          onAction={() => requestPermission()}
        />
      ) : state === 'paired' ? (
        <EmptyState icon="checkmark-circle-outline" tone="primary" title={t('scanPairSuccess')} />
      ) : (
        <View style={{ flex: 1 }}>
          <Text variant="subhead" tone="muted" style={{ marginBottom: 12 }}>{t('scanPairHint')}</Text>
          <View style={styles.camera}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => handleScan(data)}
            />
            {state === 'pairing' ? (
              <View style={[StyleSheet.absoluteFill, styles.veil]}>
                <LoadingState />
              </View>
            ) : null}
          </View>
          {error ? <View style={{ marginTop: 12 }}><Banner tone="danger" message={error} /></View> : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  camera: { flex: 1, maxHeight: 420, borderRadius: 24, overflow: 'hidden', backgroundColor: '#000' },
  veil: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.7)' },
});
