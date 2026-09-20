import { useState } from 'react';
import { View, Text, SafeAreaView, Pressable, ActivityIndicator, Modal } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { ErrorMessage } from '../../components/ErrorMessage';
import { BackHeader } from '../../components/BackHeader';
import { RideMap, RideMapMarker } from '../../components/RideMap';
import { useDriverRideDetails } from '../../hooks/useDriverRideDetails';
import { useDriverLocationReporting } from '../../hooks/useDriverLocationReporting';
import { useTranslation } from '../../hooks/useTranslation';
import { markDriverArrived, verifyDriverRidePin, completeDriverTrip, cancelDriverRide } from '../../services/driver-service';
import { formatFare } from '../../types/ride';
import { MapDefaults } from '../../services/location-service';
import { ApiError } from '../../services/driver-api-client';

// Reason sent to the backend stays a stable English id (stored verbatim as
// rides.cancellation_reason — an internal/audit string, not shown to the
// rider translated); only the on-screen label is localized.
const CANCEL_REASONS: { id: string; key: string }[] = [
  { id: 'Passenger is a no-show', key: 'driverCancelNoShow' },
  { id: 'Wrong pickup location', key: 'driverCancelWrongLocation' },
  { id: 'Vehicle issue', key: 'driverCancelVehicleIssue' },
  { id: 'Other', key: 'driverCancelOther' },
];

// The active-trip screen — mirrors kimu.ride.driver.app.ui.journey.JourneySheet:
// rider card, "enter the rider's code" pad at arrival, a running trip meter,
// and complete/cancel actions. One ride per screen (rideId param), backed by
// hooks/useDriverRideDetails' poll loop.
export default function DriverJourneyScreen() {
  const { t } = useTranslation();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { ride } = useDriverRideDetails(rideId ?? null);

  useDriverLocationReporting(true);

  const [pin, setPin] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | undefined>();
  const [cancelSheetOpen, setCancelSheetOpen] = useState(false);
  const [completion, setCompletion] = useState<{ fare: number; method: string } | null>(null);

  if (!ride) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#16A34A" />
      </SafeAreaView>
    );
  }

  async function handleArrived() {
    setActionError(undefined);
    setActionLoading(true);
    try {
      await markDriverArrived(ride!.id);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t('driverUpdateTripFailed'));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSubmitPin() {
    if (pin.trim().length < 4) return setActionError(t('driverEnterRiderCodeHint'));
    setActionError(undefined);
    setActionLoading(true);
    try {
      await verifyDriverRidePin(ride!.id, pin.trim());
      setPin('');
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t('driverIncorrectCode'));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleComplete() {
    setActionError(undefined);
    setActionLoading(true);
    try {
      const result = await completeDriverTrip(ride!.id);
      setCompletion({ fare: result.ride.finalFare ?? result.ride.estimatedFare, method: result.payment.method });
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t('driverCompleteTripFailed'));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancel(reason: string) {
    setCancelSheetOpen(false);
    try {
      await cancelDriverRide(ride!.id, reason);
      router.replace('/(driver)/(tabs)' as any);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t('driverCancelTripFailed'));
    }
  }

  if (completion) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 items-center justify-center px-8">
          <View className="h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(22,163,74,0.12)' }}>
            <Ionicons name="checkmark" size={32} color="#16A34A" />
          </View>
          <Text className="mt-4 text-xl font-bold text-ink">{t('driverTripComplete')}</Text>
          <Text className="mt-1 text-3xl font-bold text-primary">{formatFare(completion.fare)}</Text>
          <Text className="mt-1 text-sm text-text-secondary">
            {completion.method === 'cash' ? t('driverCollectCash') : t('driverPaymentSettledAuto')}
          </Text>
          <View className="mt-8 w-full">
            <Button title={t('driverBackToCockpit')} onPress={() => router.replace('/(driver)/(tabs)' as any)} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // The passenger cancelled from their side (rideService.js's cancelRide()
  // now notifies the driver too — see the migration report) — this screen
  // must say so plainly rather than showing a blank action area forever.
  if (ride.status === 'cancelled') {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <View className="flex-1 items-center justify-center px-8">
          <View className="h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(220,38,38,0.1)' }}>
            <Ionicons name="close" size={32} color="#DC2626" />
          </View>
          <Text className="mt-4 text-xl font-bold text-ink">{t('driverRideCancelledTitle')}</Text>
          <Text className="mt-1 text-center text-sm text-text-secondary">
            {ride.cancelledBy === 'passenger' ? t('driverRiderCancelledBody') : t('driverTripCancelledBody')}
          </Text>
          <View className="mt-8 w-full">
            <Button title={t('driverBackToCockpit')} onPress={() => router.replace('/(driver)/(tabs)' as any)} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const awaitingArrival = ride.status === 'driverArriving';
  const awaitingPin = ride.status === 'driverArrived';
  const inTrip = ride.status === 'pinVerified' || ride.status === 'inProgress';

  // Pre-pickup, prefer the rider's live-reported position over the static
  // pickup pin they requested from — they may have walked since then (see
  // hooks/usePassengerLocationReporting.ts).
  const riderLive = awaitingArrival && ride.rider?.latitude != null && ride.rider?.longitude != null
    ? { latitude: ride.rider.latitude, longitude: ride.rider.longitude }
    : null;
  const center = riderLive ?? { latitude: ride.pickup.latitude ?? MapDefaults.latitude, longitude: ride.pickup.longitude ?? MapDefaults.longitude };
  const markers: RideMapMarker[] = [
    { id: 'pickup', position: { latitude: ride.pickup.latitude!, longitude: ride.pickup.longitude! }, icon: 'pickup' },
    { id: 'dest', position: { latitude: ride.destination.latitude!, longitude: ride.destination.longitude! }, icon: 'destination' },
    ...(riderLive ? [{ id: 'rider', position: riderLive, icon: 'me' as const }] : []),
  ];

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="h-56 w-full">
        <RideMap center={center} markers={markers} />
      </View>

      <View className="flex-1 px-6 pt-2">
        <BackHeader onBack={() => router.replace('/(driver)/(tabs)' as any)} />

        <View
          className="mt-3 flex-row items-center justify-between rounded-2xl border border-border bg-white p-4"
          style={{ shadowColor: '#111827', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 }}
        >
          <View className="flex-1">
            <Text className="text-base font-bold text-ink">{ride.rider?.name ?? t('driver')}</Text>
            <Text className="mt-0.5 text-[13px] text-text-secondary" numberOfLines={1}>
              {awaitingPin || inTrip ? ride.destination.address : ride.pickup.address}
            </Text>
          </View>
        </View>

        {awaitingArrival ? (
          <View className="mt-5">
            <Text className="text-sm text-text-secondary">{t('driverHeadToPickup')}</Text>
            <View className="mt-3">
              <Button title={t('driverIveArrived')} onPress={handleArrived} loading={actionLoading} />
            </View>
          </View>
        ) : null}

        {awaitingPin ? (
          <View className="mt-5">
            <Text className="text-sm font-semibold text-ink">{t('driverEnterRiderCode')}</Text>
            <Text className="mt-1 text-xs text-text-secondary">{t('driverEnterRiderCodeSubtitle')}</Text>
            <View className="mt-3">
              <Input value={pin} onChangeText={setPin} keyboardType="number-pad" maxLength={4} placeholder="0000" />
            </View>
            <View className="mt-3">
              <Button title={t('driverStartTrip')} onPress={handleSubmitPin} loading={actionLoading} />
            </View>
          </View>
        ) : null}

        {inTrip ? (
          <View className="mt-5">
            <View className="rounded-2xl bg-gray-light p-4">
              <Text className="text-xs text-text-secondary">{t('driverEstimatedFare')}</Text>
              <Text className="mt-1 text-2xl font-bold text-ink">{formatFare(ride.estimatedFare)}</Text>
            </View>
            <View className="mt-3">
              <Button title={t('driverCompleteTrip')} onPress={handleComplete} loading={actionLoading} />
            </View>
          </View>
        ) : null}

        {actionError ? <View className="mt-3"><ErrorMessage message={actionError} /></View> : null}

        {!inTrip ? (
          <Pressable className="mt-4 items-center" onPress={() => setCancelSheetOpen(true)}>
            <Text className="text-sm font-semibold text-error">{t('driverCancelTrip')}</Text>
          </Pressable>
        ) : null}
      </View>

      <Modal visible={cancelSheetOpen} transparent animationType="slide" onRequestClose={() => setCancelSheetOpen(false)}>
        <View className="flex-1 justify-end bg-black/40">
          <View className="rounded-t-[28px] bg-white p-6 pb-8">
            <Text className="text-lg font-bold text-ink">{t('driverWhyCancelling')}</Text>
            <View className="mt-4 gap-2">
              {CANCEL_REASONS.map((reason) => (
                <Pressable key={reason.id} className="rounded-xl border border-border px-4 py-3.5" onPress={() => handleCancel(reason.id)}>
                  <Text className="text-[14.5px] text-ink">{t(reason.key as any)}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable className="mt-4 items-center" onPress={() => setCancelSheetOpen(false)}>
              <Text className="text-sm font-semibold text-text-secondary">{t('driverNeverMind')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
