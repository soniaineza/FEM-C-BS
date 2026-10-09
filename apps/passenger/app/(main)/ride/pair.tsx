import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaViewPlaceholder } from '@kimu/shared/components/SafeAreaViewPlaceholder';
import { ScreenShell } from '@kimu/shared/components/ScreenShell';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { Button } from '@kimu/shared/components/Button';
import { Input } from '@kimu/shared/components/Input';
import { ErrorMessage } from '@kimu/shared/components/ErrorMessage';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { pairRide } from '../../../services/ride-service';
import { ApiError } from '../../../services/api-client';

/**
 * Pair Ride: the rider points their camera at the QR the driver is showing.
 * Scanning pairs the car and moves the ride to pinVerified; the driver then
 * taps Start. If the camera can't be used, the rider can type the code
 * printed under the QR instead.
 */
export default function PairRideScreen() {
  const { t } = useTranslation();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [permission, requestPermission] = useCameraPermissions();

  const [manualOpen, setManualOpen] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const busy = useRef(false);

  // Ask for the camera as soon as the screen opens.
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permission?.granted]);

  async function submit(value: string) {
    const clean = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length !== 8) return setError(t('pairCodeInvalid'));
    if (busy.current) return;
    busy.current = true;
    setError(undefined);
    setLoading(true);
    try {
      await pairRide(clean);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('pairFailed'));
      busy.current = false;
    } finally {
      setLoading(false);
    }
  }

  function goToTrip() {
    router.replace({ pathname: '/(main)/ride/tracking', params: { rideId: rideId ?? '' } });
  }

  if (done) {
    return (
      <SafeAreaViewPlaceholder className="flex-1 items-center justify-center bg-white px-8">
        <View className="h-24 w-24 items-center justify-center rounded-full bg-primary/10">
          <Ionicons name="checkmark-circle" size={64} color="#0E7C4A" />
        </View>
        <Text className="mt-5 text-center text-2xl text-ink font-display">{t('pairSuccessTitle')}</Text>
        <Text className="font-sans mt-2 text-center leading-relaxed text-text-secondary">{t('pairSuccessBody')}</Text>
        <View className="mt-8 w-full max-w-[360px]">
          <Button title={t('pairContinue')} icon="arrow-forward" iconPosition="right" onPress={goToTrip} />
        </View>
      </SafeAreaViewPlaceholder>
    );
  }

  return (
    <ScreenShell title={t('pairRideTitle')} back background="bg-white" backLabel={t('back')}>
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40 }}
      >
        <View className="w-full max-w-[440px] self-center items-center">
          <Text className="font-sans mt-2 text-center leading-relaxed text-text-secondary">{t('pairRideScanHint')}</Text>

          {/* The camera viewfinder, framed. Scanning a QR pairs instantly. */}
          <View className="mt-6 h-72 w-72 overflow-hidden rounded-[32px] border-2 border-primary bg-black">
            {permission?.granted ? (
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={({ data }) => submit(String(data))}
              />
            ) : (
              <View className="flex-1 items-center justify-center px-6">
                <Ionicons name="camera-outline" size={44} color="#9CA3AF" />
                <Text className="font-sans mt-3 text-center text-sm text-white">{t('pairCameraPermission')}</Text>
                <Pressable className="mt-4 rounded-full bg-primary px-5 py-2.5" onPress={requestPermission}>
                  <Text className="font-semibold text-white">{t('pairAllowCamera')}</Text>
                </Pressable>
              </View>
            )}
          </View>

          {error ? (
            <View className="mt-4 w-full">
              <ErrorMessage message={error} />
            </View>
          ) : null}

          {/* Secondary: type the code printed under the driver's QR. */}
          {manualOpen ? (
            <View className="mt-5 w-full">
              <Text className="text-center text-sm font-semibold text-text-secondary">{t('pairOrEnterCode')}</Text>
              <View className="mt-3">
                <Input
                  placeholder={t('pairCodePlaceholder')}
                  accessibilityLabel={t('pairCodePlaceholder')}
                  value={code}
                  onChangeText={(v) => {
                    setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8));
                    if (error) setError(undefined);
                  }}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="go"
                  maxLength={8}
                  onSubmitEditing={() => submit(code)}
                  prefixIcon="keypad-outline"
                  autoFocus
                />
              </View>
              <View className="mt-4">
                <Button title={t('pairRideConfirm')} onPress={() => submit(code)} loading={loading} disabled={code.length !== 8} />
              </View>
            </View>
          ) : (
            <Pressable className="mt-5" onPress={() => setManualOpen(true)} hitSlop={8}>
              <Text className="text-sm font-semibold text-primary">{t('pairCantScan')}</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAwareScrollView>
    </ScreenShell>
  );
}
