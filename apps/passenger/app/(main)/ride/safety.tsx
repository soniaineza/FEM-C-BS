import { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { ScreenShell } from '@kimu/shared/components/ScreenShell';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '@kimu/shared/components/Button';
import { SosButton } from '@kimu/shared/components/SosButton';
import { CallRow } from '@kimu/shared/components/CallRow';
import { useAuthStore } from '../../../stores/useAuthStore';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import {
  triggerEmergency,
  createTripShare,
  callPhoneNumber,
  getSosConfig,
  EmergencyResult,
} from '../../../services/safety-service';
import { ApiError } from '../../../services/api-client';
import { shareText } from '@kimu/shared/utils/share';

// Safety screen — SOS now routes to the Kimu Transport call center: the tap
// records the emergency server-side (auditable trail + control-room
// notification) and then opens the OS dialer on the call-center number
// served by GET /api/emergency/config. If the request itself fails (offline
// etc.) the call button stays available — the call must never be blocked by
// the network.
export default function SafetyScreen() {
  const { t } = useTranslation();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  // The contact the rider registered on Trusted Contacts doubles as their SOS
  // person: in an emergency it is the number they most want one tap away.
  const currentUser = useAuthStore((s) => s.currentUser);
  const trustedName = currentUser?.emergencyContactName?.trim();
  const trustedPhone = currentUser?.emergencyContactPhone?.trim();

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
    <ScreenShell title={t('safety')} back background="bg-white" backLabel={t('back')}>
      <ScrollView className="flex-1" contentContainerClassName="px-6 pb-10 pt-2">
        <Text className="font-sans mt-2 text-text-secondary">{t('safetyPriority')}</Text>

        <View className="mt-8 rounded border border-error p-4">
          <Text className="text-base font-semibold text-error">{t('emergencyAssistance')}</Text>
          <Text className="font-sans mt-1 text-xs text-text-secondary">{t('emergencySosHint')}</Text>
          <View className="mt-3">
            <SosButton title={t('sos')} onPress={handleSos} loading={sosLoading} />
          </View>
          {sosResult ? (
            <View className="mt-2 flex-row items-center">
              <Ionicons name="call" size={13} color="#0E7C4A" />
              <Text className="font-sans ml-1.5 flex-1 text-xs text-text-secondary">
                {t('sosSent')} {t('sosReferenceLabel', { reference: sosResult.reference })}
              </Text>
            </View>
          ) : null}
          {sosError ? <Text className="font-sans mt-2 text-xs text-error">{sosError}</Text> : null}
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
          <Text className="text-base font-semibold text-ink">{t('trustedContactSos')}</Text>
          <Text className="font-sans mt-1 text-xs text-text-secondary">{t('trustedContactSosHint')}</Text>
          {trustedPhone ? (
            <CallRow label={trustedName || t('drawerTrustedContacts')} phone={trustedPhone} />
          ) : (
            <>
              <Text className="font-sans mt-2 text-xs text-text-secondary">{t('noTrustedContactYet')}</Text>
              <Pressable
                accessibilityRole="button"
                className="mt-3 min-h-[44px] flex-row items-center justify-center rounded border border-primary py-2.5"
                onPress={() => router.push('/(main)/settings/trusted-contacts')}
              >
                <Ionicons name="person-add-outline" size={16} color="#0E7C4A" />
                <Text className="ml-2 text-sm font-semibold text-primary">{t('addTrustedContact')}</Text>
              </Pressable>
            </>
          )}
        </View>

        <View className="mt-4 rounded border border-border p-4">
          <Text className="text-base font-semibold text-ink">{t('shareTrip')}</Text>
          <Text className="font-sans mt-1 text-xs text-text-secondary">{t('shareTripHint')}</Text>
          <View className="mt-3">
            <Button title={t('shareTripLink')} variant="outline" onPress={handleShareTrip} loading={shareLoading} />
          </View>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}
