import { useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal } from 'react-native';
import { ScreenShell } from '@kimu/shared/components/ScreenShell';
import { CallRow, dialNumber } from '@kimu/shared/components/CallRow';
import { EMERGENCY_NUMBERS } from '@kimu/shared/constants/emergency';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { Button } from '@kimu/shared/components/Button';
import { SosButton } from '@kimu/shared/components/SosButton';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { useDriverAuthStore } from '../../stores/useDriverAuthStore';
import {
  reportDriverEmergency,
  createDriverTripShare,
  reportDriverIncident,
  EmergencyResult,
  IncidentCategory,
} from '../../services/driver-profile-service';
import { useDriverActiveRide } from '../../hooks/useDriverActiveRide';
import { shareText } from '@kimu/shared/utils/share';
import { ApiError } from '../../services/driver-api-client';

// The driver's SOS. Emergency services come first and are plain tel: links, so
// they work with no data and no API — the condition an SOS is most likely to
// be used in. The Kimu alert is recorded on top of that, never instead of it.
export default function DriverSafetyScreen() {
  const { t } = useTranslation();
  const currentDriver = useDriverAuthStore((s) => s.currentDriver);
  // The contact the driver registered on their profile doubles as their SOS
  // person, the same way the rider's trusted contact does.
  const trustedName = currentDriver?.emergencyContactName?.trim();
  const trustedPhone = currentDriver?.emergencyContactPhone?.trim();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [result, setResult] = useState<EmergencyResult | undefined>();
  const [sharing, setSharing] = useState(false);
  const [incidentOpen, setIncidentOpen] = useState(false);
  const [incidentNotice, setIncidentNotice] = useState<string | undefined>();

  // Only a trip in progress can be shared or reported on.
  const { primaryRide } = useDriverActiveRide(!!currentDriver);

  async function handleShareTrip() {
    if (!primaryRide) return;
    setSharing(true);
    try {
      const { url } = await createDriverTripShare(primaryRide.id);
      await shareText(
        t('driverShareTripTitle'),
        t('followTrip', { url }),
        t('shareLinkCopied'),
        t('shareLinkCopiedHint')
      );
    } catch {
      setError(t('requestFailed'));
    } finally {
      setSharing(false);
    }
  }

  async function submitIncident(category: IncidentCategory) {
    setIncidentOpen(false);
    try {
      await reportDriverIncident({ rideId: primaryRide?.id, category });
      setIncidentNotice(t('incidentSent'));
    } catch {
      setIncidentNotice(t('incidentFailed'));
    }
  }

  async function handleSos() {
    setLoading(true);
    setError(undefined);
    try {
      const sos = await reportDriverEmergency({});
      setResult(sos);
      if (sos.callCenterPhone) dialNumber(sos.callCenterPhone);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('sosFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenShell title={t('driverSafety')} back background="bg-white" backLabel={t('back')}>
      <ScrollView className="flex-1" contentContainerClassName="px-6 pb-10 pt-2">
        <Text className="font-sans mt-2 text-text-secondary">{t('safetyPriority')}</Text>

        <View className="mt-6 rounded-2xl border border-error p-4">
          <Text className="text-base font-semibold text-error">{t('emergencyServices')}</Text>
          <Text className="font-sans mt-1 text-xs text-text-secondary">{t('emergencyServicesHint')}</Text>
          {EMERGENCY_NUMBERS.map((number) => (
            <CallRow
              key={number}
              label={number}
              phone={number}
              accessibilityLabel={t('callNumber', { number })}
              urgent
            />
          ))}
        </View>

        <View className="mt-4 rounded-2xl border border-border p-4">
          <Text className="text-base font-semibold text-ink">{t('emergencyAssistance')}</Text>
          <Text className="font-sans mt-1 text-xs text-text-secondary">{t('driverSosHint')}</Text>
          <View className="mt-3">
            <SosButton title={t('sos')} onPress={handleSos} loading={loading} />
          </View>
          {result ? (
            <View className="mt-2 flex-row items-center">
              <Ionicons name="checkmark-circle" size={14} color="#0E7C4A" />
              <Text className="font-sans ml-1.5 flex-1 text-xs text-text-secondary">
                {t('sosSent')} {t('sosReferenceLabel', { reference: result.reference })}
              </Text>
            </View>
          ) : null}
          {error ? <Text className="font-sans mt-2 text-xs text-error">{error}</Text> : null}
          {result?.callCenterPhone ? (
            <CallRow label={t('emergencyCallCenterTitle')} phone={result.callCenterPhone} />
          ) : null}
        </View>

        <View className="mt-4 rounded-2xl border border-border p-4">
          <Text className="text-base font-semibold text-ink">{t('driverShareTripTitle')}</Text>
          <Text className="font-sans mt-1 text-xs text-text-secondary">{t('driverShareTripHint')}</Text>
          <View className="mt-3">
            <Button
              title={t('shareTripLink')}
              variant="outline"
              icon="share-outline"
              onPress={handleShareTrip}
              loading={sharing}
              disabled={!primaryRide}
            />
          </View>
          {!primaryRide ? (
            <Text className="font-sans mt-2 text-xs text-text-secondary">{t('driverNoActiveTrip')}</Text>
          ) : null}
        </View>

        <View className="mt-4 rounded-2xl border border-border p-4">
          <Text className="text-base font-semibold text-ink">{t('driverReportIncident')}</Text>
          <Text className="font-sans mt-1 text-xs text-text-secondary">{t('driverReportIncidentHint')}</Text>
          <View className="mt-3">
            <Button
              title={t('driverReportIncident')}
              variant="outline"
              icon="flag-outline"
              onPress={() => { setIncidentNotice(undefined); setIncidentOpen(true); }}
            />
          </View>
          {incidentNotice ? (
            <Text className="mt-2 text-xs font-medium text-primary">{incidentNotice}</Text>
          ) : null}
        </View>

        <View className="mt-4 rounded-2xl border border-border p-4">
          <Text className="text-base font-semibold text-ink">{t('trustedContactSos')}</Text>
          <Text className="font-sans mt-1 text-xs text-text-secondary">{t('trustedContactSosHint')}</Text>
          {trustedPhone ? (
            <CallRow label={trustedName || t('emergencyContactName')} phone={trustedPhone} />
          ) : (
            <>
              <Text className="font-sans mt-2 text-xs text-text-secondary">{t('noTrustedContactYet')}</Text>
              <Pressable
                accessibilityRole="button"
                className="mt-3 min-h-[44px] flex-row items-center justify-center rounded border border-primary py-2.5"
                onPress={() => router.push('/(driver)/account/edit-profile' as any)}
              >
                <Ionicons name="person-add-outline" size={16} color="#0E7C4A" />
                <Text className="ml-2 text-sm font-semibold text-primary">{t('addTrustedContact')}</Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>

      <Modal visible={incidentOpen} transparent animationType="slide" onRequestClose={() => setIncidentOpen(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="rounded-t-[28px] bg-white p-6 pb-10">
            <Text className="text-lg font-bold text-ink">{t('driverReportIncident')}</Text>
            <View className="mt-4 gap-2">
              {([
                ['unsafe_passenger', 'incidentUnsafePassenger'],
                ['threat', 'incidentThreat'],
                ['damage', 'incidentDamage'],
                ['accident', 'incidentAccident'],
                ['other', 'incidentOther'],
              ] as [IncidentCategory, string][]).map(([key, label]) => (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  className="min-h-[44px] justify-center rounded-xl border border-border px-4 py-3.5 active:bg-gray-light"
                  onPress={() => submitIncident(key)}
                >
                  <Text className="font-sans text-[14.5px] text-ink">{t(label as any)}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable accessibilityRole="button" className="mt-4 items-center py-2" onPress={() => setIncidentOpen(false)}>
              <Text className="text-sm font-semibold text-text-secondary">{t('cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScreenShell>
  );
}
