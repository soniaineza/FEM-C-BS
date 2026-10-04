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
  getStoredCallCenterPhone,
  lastKnownCoordinates,
  rememberCallCenterPhone,
  EMERGENCY_FALLBACK_PHONE,
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
    // The number kept from an earlier session first (works with no signal),
    // then the server's current one.
    let alive = true;
    getStoredCallCenterPhone().then((stored) => {
      if (alive && stored) setCallCenterPhone((current) => current ?? stored);
    });
    getSosConfig()
      .then((cfg) => { if (alive && cfg.callCenterPhone) setCallCenterPhone(cfg.callCenterPhone); })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Always has a number: the server's, the last one it gave us, or the
  // built-in emergency line.
  const dialNumber = callCenterPhone ?? EMERGENCY_FALLBACK_PHONE;

  async function handleSos() {
    // The call comes first and never waits on the network. Recording the
    // alert (with the rider's position) follows in the background.
    callPhoneNumber(dialNumber);
    setSosLoading(true);
    setSosError(undefined);
    try {
      const coordinates = await lastKnownCoordinates();
      const result = await triggerEmergency({ rideId, ...(coordinates ?? {}) });
      setSosResult(result);
      if (result.callCenterPhone) {
        setCallCenterPhone(result.callCenterPhone);
        rememberCallCenterPhone(result.callCenterPhone);
      }
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
          <Pressable
            accessibilityRole="button"
            className="mt-3 flex-row items-center justify-center rounded border border-danger py-2.5"
            onPress={() => callPhoneNumber(dialNumber)}
          >
            <Ionicons name="call" size={15} color={Colors.danger} />
            <Text className="ml-2 text-subhead font-semibold text-danger">{t('emergencyCallCenterTitle')} · {dialNumber}</Text>
          </Pressable>
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
