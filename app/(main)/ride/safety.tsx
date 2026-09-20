import { useEffect, useState } from 'react';
import { View, Text, SafeAreaView, Share, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';

import { Button } from '../../../components/Button';
import { BackHeader } from '../../../components/BackHeader';
import { useTranslation } from '../../../hooks/useTranslation';
import {
  triggerEmergency,
  createTripShare,
  callPhoneNumber,
  getSosConfig,
  EmergencyResult,
} from '../../../services/safety-service';
import { ApiError } from '../../../services/api-client';

// Safety screen — SOS now routes to the FEM C@BS call center: the tap
// records the emergency server-side (auditable trail + control-room
// notification) and then opens the OS dialer on the call-center number
// served by GET /api/emergency/config. If the request itself fails (offline
// etc.) the call button stays available — the call must never be blocked by
// the network.
export default function SafetyScreen() {
  const { t } = useTranslation();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();

  const [sosLoading, setSosLoading] = useState(false);
  const [sosError, setSosError] = useState<string | undefined>();
  const [sosResult, setSosResult] = useState<EmergencyResult | undefined>();
  const [callCenterPhone, setCallCenterPhone] = useState<string | undefined>();
  const [shareLoading, setShareLoading] = useState(false);

  useEffect(() => {
    // Best-effort; falls back to the number returned by POST /emergency.
    getSosConfig()
      .then((cfg) => setCallCenterPhone(cfg.callCenterPhone))
      .catch(() => {});
  }, []);

  async function handleSos() {
    setSosLoading(true);
    setSosError(undefined);
    try {
      const result = await triggerEmergency({ rideId });
      setSosResult(result);
      if (result.callCenterPhone) setCallCenterPhone(result.callCenterPhone);
      // The actual call: open the dialer on the FEM C@BS call center.
      callPhoneNumber(result.callCenterPhone ?? callCenterPhone ?? '');
    } catch (err) {
      setSosError(err instanceof ApiError ? err.message : t('sosFailed'));
    } finally {
      setSosLoading(false);
    }
  }

  async function handleShareTrip() {
    if (!rideId) return;
    setShareLoading(true);
    try {
      const { url } = await createTripShare(rideId);
      await Share.share({ message: t('followTrip', { url }) });
    } finally {
      setShareLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6 pt-2">
        <BackHeader />
        <Text className="mt-4 text-xl font-bold text-ink">{t('safety')}</Text>
        <Text className="mt-2 text-text-secondary">{t('safetyPriority')}</Text>

        <View className="mt-8 rounded border border-error p-4">
          <Text className="text-base font-semibold text-error">{t('emergencyAssistance')}</Text>
          <Text className="mt-1 text-xs text-text-secondary">{t('emergencySosHint')}</Text>
          <View className="mt-3">
            <Button title={t('sos')} onPress={handleSos} loading={sosLoading} className="bg-error" />
          </View>
          {sosResult ? (
            <View className="mt-2 flex-row items-center">
              <Ionicons name="call" size={13} color="#16A34A" />
              <Text className="ml-1.5 flex-1 text-xs text-text-secondary">
                {t('sosSent')} {t('sosReferenceLabel', { reference: sosResult.reference })}
              </Text>
            </View>
          ) : null}
          {sosError ? <Text className="mt-2 text-xs text-error">{sosError}</Text> : null}
          {callCenterPhone ? (
            <Pressable
              className="mt-3 flex-row items-center justify-center rounded border border-error py-2.5"
              onPress={() => callPhoneNumber(callCenterPhone)}
            >
              <Ionicons name="call" size={15} color="#DC2626" />
              <Text className="ml-2 text-sm font-semibold text-error">{t('emergencyCallCenterTitle')}</Text>
            </Pressable>
          ) : null}
        </View>

        <View className="mt-4 rounded border border-border p-4">
          <Text className="text-base font-semibold text-ink">{t('shareTrip')}</Text>
          <Text className="mt-1 text-xs text-text-secondary">{t('shareTripHint')}</Text>
          <View className="mt-3">
            <Button title={t('shareTripLink')} variant="outline" onPress={handleShareTrip} loading={shareLoading} />
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
