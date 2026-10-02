import { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';

import { Button } from '../../../components/Button';
import { ScreenHeader } from '../../../components/ui/ScreenHeader';
import { useTranslation } from '../../../hooks/useTranslation';
import {
  triggerEmergency,
  createTripShare,
  callPhoneNumber,
  getSosConfig,
  EmergencyResult,
} from '../../../services/safety-service';
import { ApiError } from '../../../services/api-client';
import { shareText } from '../../../utils/share';
import { Colors } from '../../../constants/theme';

// Safety screen — SOS now routes to the Kimu Transport call center: the tap
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
      // The actual call: open the dialer on the Kimu Transport call center.
      callPhoneNumber(result.callCenterPhone ?? callCenterPhone ?? '');
    } catch (err) {
      setSosError(err instanceof ApiError ? err.message : t('sosFailed'));
      // An alert may be queued for retry, but delivery is unconfirmed. Give
      // the rider the direct call path immediately when we have a number.
      if (callCenterPhone) callPhoneNumber(callCenterPhone);
    } finally {
      setSosLoading(false);
    }
  }

  async function handleShareTrip() {
    if (!rideId) return;
    setShareLoading(true);
    try {
      const { url } = await createTripShare(rideId);
      await shareText(t('shareTrip'), t('followTrip', { url }), t('shareLinkCopied'), t('shareLinkCopiedHint'));
    } finally {
      setShareLoading(false);
    }
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-surface">
      <View className="flex-1 px-5 pt-2">
        <ScreenHeader back title={t('safety')} />
        <Text className="mt-2 text-fg-muted">{t('safetyPriority')}</Text>

        <View className="mt-8 rounded border border-danger p-4">
          <Text className="text-body font-semibold text-danger">{t('emergencyAssistance')}</Text>
          <Text className="mt-1 text-caption text-fg-muted">{t('emergencySosHint')}</Text>
          <View className="mt-3">
            <Button title={t('sos')} onPress={handleSos} loading={sosLoading} className="bg-danger" />
          </View>
          {sosResult ? (
            <View className="mt-2 flex-row items-center">
              <Ionicons name="call" size={13} color={Colors.primary} />
              <Text className="ml-1.5 flex-1 text-caption text-fg-muted">
                {t('sosSent')} {t('sosReferenceLabel', { reference: sosResult.reference })}
              </Text>
            </View>
          ) : null}
          {sosError ? <Text className="mt-2 text-caption text-danger">{sosError}</Text> : null}
          {callCenterPhone ? (
            <Pressable
              className="mt-3 flex-row items-center justify-center rounded border border-danger py-2.5"
              onPress={() => callPhoneNumber(callCenterPhone)}
            >
              <Ionicons name="call" size={15} color={Colors.danger} />
              <Text className="ml-2 text-subhead font-semibold text-danger">{t('emergencyCallCenterTitle')}</Text>
            </Pressable>
          ) : null}
        </View>

        <View className="mt-4 rounded border border-border p-4">
          <Text className="text-body font-semibold text-fg">{t('shareTrip')}</Text>
          <Text className="mt-1 text-caption text-fg-muted">{t('shareTripHint')}</Text>
          <View className="mt-3">
            <Button title={t('shareTripLink')} variant="outline" onPress={handleShareTrip} loading={shareLoading} />
          </View>
        </View>
      </View>
    </SafeAreaViewPlaceholder>
  );
}
