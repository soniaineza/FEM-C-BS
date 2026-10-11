import { useState, useEffect, useMemo } from 'react';
import { View, Text, Pressable, ActivityIndicator, Modal, ScrollView } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaViewPlaceholder } from '@kimu/shared/components/SafeAreaViewPlaceholder';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Button } from '@kimu/shared/components/Button';
import { ErrorMessage } from '@kimu/shared/components/ErrorMessage';
import { RideMap, RideMapMarker } from '@kimu/shared/components/RideMap';
import { StopList } from '../../components/driver/StopList';
import { SwipeToStart } from '../../components/driver/SwipeToStart';
import { PhonePad, PhoneScope } from '../../components/driver/PhonePad';
import { useDriverRideDetails } from '../../hooks/useDriverRideDetails';
import { useDriverStops } from '../../hooks/useDriverStops';
import { useDriverJourneyRoute } from '../../hooks/useDriverJourneyRoute';
import { useDriverPositionStore } from '../../stores/useDriverPositionStore';
import type { MapCar, TrailSample } from '@kimu/shared/components/map/map-types';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { markDriverArrived, startDriverTrip, completeDriverTrip, chargeDriverRide, confirmDriverCashPayment, cancelDriverRide } from '../../services/driver-service';
import { QrCode } from '../../components/QrCode';
import { formatFare } from '@kimu/shared/types/ride';
import { MapDefaults } from '@kimu/shared/services/location-service';
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

/** Just the figure; the currency sits under it on the meter. */
function fareDigits(amount: number): string {
  return Math.round(amount).toLocaleString('en-US');
}

// The active-trip screen, in the shape of the reference app's trip meter: the
// fare and the run's distance and time across the top, the map filling the
// middle, and one deliberate action along the bottom. One ride per screen
// (rideId param), backed by hooks/useDriverRideDetails' poll loop.
export default function DriverJourneyScreen() {
  const { t } = useTranslation();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { ride } = useDriverRideDetails(rideId ?? null);
  // A shared trip carries more than one rider: show every remaining stop in
  // driving order so the driver is not left juggling separate trip screens.
  const stops = useDriverStops(!!rideId);
  const isSharedTrip = new Set(stops.map((s) => s.rideId)).size > 1;
  // The cancel-reason bottom sheet lives in a transparent Modal (no automatic
  // SafeArea) — pad its bottom by the system inset so the action list stays
  // clear of the gesture bar / 3-button nav.
  const insets = useSafeAreaInsets();

  // Where the driver is (from the location reporter), drawn as their car
  // and animated along its recent fixes.
  const fix = useDriverPositionStore((s) => s.fix);
  const fixTrail = useDriverPositionStore((s) => s.trail);
  const driverCar = useMemo<MapCar[]>(
    () => fix
      ? [{
          id: 'driver',
          latitude: fix.latitude,
          longitude: fix.longitude,
          heading: fix.heading,
          assigned: true,
          // Phone timestamps, on the same clock as the map (no server offset).
          trail: fixTrail.map((f) => [f.recordedAt, f.latitude, f.longitude, f.heading] as TrailSample),
        }]
      : [],
    [fix, fixTrail]
  );
  // On the way to the pickup the map routes from the driver to the rider;
  // after pickup it shows the booked pickup → destination route.
  const routePoints = useDriverJourneyRoute(
    ride?.id ?? null,
    ride?.pickup ?? null,
    ride?.destination ?? null,
    ride?.status === 'driverArriving',
    fix
  );

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | undefined>();
  const [cancelSheetOpen, setCancelSheetOpen] = useState(false);
  const [momoPhone, setMomoPhone] = useState('');
  const [phoneScope, setPhoneScope] = useState<PhoneScope>('local');
  const [charged, setCharged] = useState(false);

  // Minutes since the trip actually started, so the meter counts up the way a
  // taximeter does instead of freezing on the booking's estimate.
  const startedAt = ride?.startedAt ? Date.parse(ride.startedAt) : NaN;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const running = ride?.status === 'inProgress' && Number.isFinite(startedAt);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(timer);
  }, [running]);

  if (!ride) {
    return (
      <SafeAreaViewPlaceholder className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#0E7C4A" />
      </SafeAreaViewPlaceholder>
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

  async function handleStart() {
    setActionError(undefined);
    setActionLoading(true);
    try {
      await startDriverTrip(ride!.id);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t('driverUpdateTripFailed'));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleComplete() {
    setActionError(undefined);
    setActionLoading(true);
    try {
      await completeDriverTrip(ride!.id);
      // The ride is now paymentPending; the screen updates from the poll and
      // shows the "collect the fare" step.
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t('driverCompleteTripFailed'));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCharge() {
    const phone = momoPhone.trim();
    if (!/^\+?\d{9,13}$/.test(phone.replace(/\s/g, ''))) return setActionError(t('driverEnterMomoNumber'));
    setActionError(undefined);
    setActionLoading(true);
    try {
      await chargeDriverRide(ride!.id, phone);
      setCharged(true);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t('driverChargeFailed'));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleConfirmCash() {
    setActionError(undefined);
    setActionLoading(true);
    try {
      await confirmDriverCashPayment(ride!.id);
      router.replace('/(driver)/(tabs)' as any);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t('driverUpdateTripFailed'));
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

  if (ride.status === 'paymentPending' || ride.status === 'completed') {
    const fare = ride.finalFare ?? ride.estimatedFare;
    const paid = ride.status === 'completed';
    return (
      <SafeAreaViewPlaceholder className="flex-1 bg-white">
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <ScrollView contentContainerClassName="flex-grow px-5 pb-8 pt-4" keyboardShouldPersistTaps="handled">
            <View className="items-center">
              <View className="h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(14,124,74,0.12)' }}>
                <Ionicons name={paid ? 'checkmark-circle' : 'cash-outline'} size={34} color="#0E7C4A" />
              </View>
              <Text className="mt-4 text-xl text-ink font-display">{paid ? t('driverPaid') : t('driverTripComplete')}</Text>
              <Text className="mt-1 text-3xl font-bold text-primary">{formatFare(fare)}</Text>
            </View>

            {paid ? (
              <View className="mt-8">
                <Button title={t('driverBackToCockpit')} onPress={() => router.replace('/(driver)/(tabs)' as any)} />
              </View>
            ) : charged ? (
              <View className="mt-6">
                <View className="rounded-2xl border border-primary/30 bg-primary-soft px-4 py-3.5">
                  <Text className="text-center text-[15px] font-semibold text-ink">{t('driverChargeSent')}</Text>
                  <Text className="font-sans mt-1 text-center text-xs text-text-secondary">{t('driverChargeSentHint')}</Text>
                </View>
                {actionError ? <View className="mt-3"><ErrorMessage message={actionError} /></View> : null}
                <View className="mt-5">
                  <Button title={t('driverBackToCockpit')} onPress={() => router.replace('/(driver)/(tabs)' as any)} />
                </View>
              </View>
            ) : (
              <View className="mt-6">
                <Text className="text-[17px] font-semibold text-ink">{t('driverBillNumberTitle')}</Text>
                <Text className="font-sans mb-4 mt-1 text-[13px] text-text-secondary">{t('driverCollectFareHint')}</Text>

                <PhonePad
                  value={momoPhone}
                  onChange={(next) => { setMomoPhone(next); if (actionError) setActionError(undefined); }}
                  scope={phoneScope}
                  onScopeChange={setPhoneScope}
                />

                {actionError ? <View className="mt-1 mb-3"><ErrorMessage message={actionError} /></View> : null}

                <Button title={t('driverRequestPayment')} icon="send" onPress={handleCharge} loading={actionLoading} />

                <View className="my-5 flex-row items-center">
                  <View className="h-px flex-1 bg-border" />
                  <Text className="font-sans mx-3 text-xs text-text-secondary">{t('driverOr')}</Text>
                  <View className="h-px flex-1 bg-border" />
                </View>

                <Button title={t('driverPaidInCash')} variant="outline" onPress={handleConfirmCash} loading={actionLoading} />
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaViewPlaceholder>
    );
  }

  // The passenger cancelled from their side (rideService.js's cancelRide()
  // now notifies the driver too — see the migration report) — this screen
  // must say so plainly rather than showing a blank action area forever.
  if (ride.status === 'cancelled') {
    return (
      <SafeAreaViewPlaceholder className="flex-1 bg-white">
        <View className="flex-1 items-center justify-center px-8">
          <View className="h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(220,38,38,0.1)' }}>
            <Ionicons name="close" size={32} color="#DC2626" />
          </View>
          <Text className="mt-4 text-xl text-ink font-display">{t('driverRideCancelledTitle')}</Text>
          <Text className="font-sans mt-1 text-center text-sm text-text-secondary">
            {ride.cancelledBy === 'passenger' ? t('driverRiderCancelledBody') : t('driverTripCancelledBody')}
          </Text>
          <View className="mt-8 w-full">
            <Button title={t('driverBackToCockpit')} onPress={() => router.replace('/(driver)/(tabs)' as any)} />
          </View>
        </View>
      </SafeAreaViewPlaceholder>
    );
  }

  const awaitingArrival = ride.status === 'driverArriving';
  const awaitingPin = ride.status === 'driverArrived';
  const paired = ride.status === 'pinVerified';
  const inTrip = ride.status === 'inProgress';

  const statusLine = awaitingArrival
    ? t('driverHeadToPickup')
    : awaitingPin
      ? t('driverShowQrSubtitle')
      : paired
        ? t('driverWaitingToStart')
        : t('driverTripStarted');

  const minutes = running
    ? Math.max(0, Math.round((nowMs - startedAt) / 60000))
    : ride.durationMinutes;

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
    <SafeAreaViewPlaceholder className="flex-1 bg-white">
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View className="flex-row items-center px-5 pb-1 pt-2">
          <View
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: inTrip ? '#DC2626' : '#0E7C4A' }}
          />
          <Text className="ml-2.5 flex-1 text-[17px] font-semibold text-ink">{t('driverTripLabel')}</Text>
          {!inTrip ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setCancelSheetOpen(true)}
              className="rounded-full border border-error px-4 py-1.5 active:bg-error/10"
            >
              <Text className="text-[13px] font-semibold text-error">{t('driverCancelTrip')}</Text>
            </Pressable>
          ) : null}
        </View>
        <Text className="font-sans px-5 pb-3 text-[13px] text-text-secondary" numberOfLines={1}>{statusLine}</Text>

        {/* The meter: what the rider owes, and how far and how long the run is. */}
        <View className="flex-row items-end justify-between px-5 pb-4">
          <View className="flex-1 flex-row items-baseline">
            <Text className="text-[42px] font-bold leading-none text-ink" style={{ fontVariant: ['tabular-nums'] }}>
              {fareDigits(ride.finalFare ?? ride.estimatedFare)}
            </Text>
            <Text className="ml-2 text-[15px] font-semibold text-primary">RWF</Text>
          </View>
          <View className="items-end">
            <Text className="text-[15px] font-semibold text-ink" style={{ fontVariant: ['tabular-nums'] }}>
              {ride.distanceKm.toFixed(1)} {t('unitKm')}
            </Text>
            <Text className="mt-1 text-[15px] font-semibold text-ink" style={{ fontVariant: ['tabular-nums'] }}>
              {minutes} {t('minutesShort')}
            </Text>
          </View>
        </View>

        {awaitingPin ? (
          <ScrollView className="flex-1" contentContainerClassName="items-center px-5 pb-6" keyboardShouldPersistTaps="handled">
            <Text className="text-center text-base font-bold text-ink">{t('driverShowQrTitle')}</Text>
            <View
              className="mt-4 items-center rounded-3xl border border-border bg-white p-3"
              style={{ shadowColor: '#111827', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 }}
            >
              {ride.pairCode ? <QrCode value={ride.pairCode} size={210} /> : <ActivityIndicator color="#0E7C4A" />}
            </View>
            {ride.pairCode ? (
              <>
                <Text className="font-sans mt-3 text-center text-xs text-text-secondary">{t('driverPairCodeLabel')}</Text>
                <Text className="text-center text-2xl font-bold tracking-[6px] text-ink">{ride.pairCode}</Text>
              </>
            ) : null}
          </ScrollView>
        ) : (
          <View className="flex-1">
            <RideMap
              center={center}
              markers={markers}
              routePolyline={routePoints}
              cars={driverCar}
              retryLabel={t('tryAgain')}
              loadingLabel={t('mapLoading')}
              errorLabel={t('mapError')}
            />
          </View>
        )}

        <View className="px-5 pb-5 pt-4">
          {isSharedTrip ? (
            <View className="mb-3">
              <StopList
                stops={stops}
                currentRideId={ride.id}
                onSelectRide={(id) => {
                  if (id !== ride.id) router.replace({ pathname: '/(driver)/journey', params: { rideId: id } } as any);
                }}
              />
            </View>
          ) : null}

          <View className="mb-3 flex-row items-center">
            <Ionicons name="person-circle-outline" size={22} color="#6B7280" />
            <Text className="font-sans ml-2 flex-1 text-[14px] text-ink" numberOfLines={1}>
              <Text className="font-semibold">{ride.rider?.name ?? t('driver')}</Text>
              {ride.seats > 1 ? ` · ${t('seatsLabel', { count: ride.seats })}` : ''}
              {'  ·  '}
              {awaitingPin || paired || inTrip ? ride.destination.address : ride.pickup.address}
            </Text>
          </View>

          {actionError ? <View className="mb-3"><ErrorMessage message={actionError} /></View> : null}

          {awaitingArrival ? (
            <Button title={t('driverIveArrived')} onPress={handleArrived} loading={actionLoading} />
          ) : null}

          {paired ? (
            <SwipeToStart
              label={t('driverSlideToStart')}
              hint={t('driverSlideToStartHint')}
              onComplete={handleStart}
              loading={actionLoading}
            />
          ) : null}

          {inTrip ? (
            <Button title={t('driverCompleteTrip')} onPress={handleComplete} loading={actionLoading} />
          ) : null}

          {awaitingPin ? (
            <Pressable accessibilityRole="button" className="items-center py-2" onPress={() => setCancelSheetOpen(true)}>
              <Text className="text-sm font-semibold text-error">{t('driverCancelTrip')}</Text>
            </Pressable>
          ) : null}
        </View>

        <Modal visible={cancelSheetOpen} transparent animationType="slide" onRequestClose={() => setCancelSheetOpen(false)}>
          <View className="flex-1 justify-end bg-black/40">
            <View className="rounded-t-[28px] bg-white p-6" style={{ paddingBottom: 32 + insets.bottom }}>
              <Text className="text-lg font-bold text-ink">{t('driverWhyCancelling')}</Text>
              <View className="mt-4 gap-2">
                {CANCEL_REASONS.map((reason) => (
                  <Pressable key={reason.id} className="rounded-xl border border-border px-4 py-3.5" onPress={() => handleCancel(reason.id)}>
                    <Text className="font-sans text-[14.5px] text-ink">{t(reason.key as any)}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable className="mt-4 items-center" onPress={() => setCancelSheetOpen(false)}>
                <Text className="text-sm font-semibold text-text-secondary">{t('driverNeverMind')}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaViewPlaceholder>
  );
}
