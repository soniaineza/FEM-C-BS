import { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, Modal, ScrollView } from 'react-native';
import { Pressable } from '../../components/ui/Pressable';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { SafeAreaViewPlaceholder } from '../../components/SafeAreaViewPlaceholder';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Input } from '../../components/Input';
import { SlideToConfirm } from '../../components/ui/SlideToConfirm';
import { Badge } from '../../components/ui';
import { ErrorMessage } from '../../components/ErrorMessage';
import { BackHeader } from '../../components/BackHeader';
import { RideMap, RideMapMarker } from '../../components/RideMap';
import { useResponsive } from '../../hooks/useResponsive';
import { useDriverRideDetails } from '../../hooks/useDriverRideDetails';
import { useDriverActiveRide } from '../../hooks/useDriverActiveRide';
import { useDriverLocationStore } from '../../stores/useDriverLocationStore';
import { useLiveMeter } from '../../hooks/useLiveMeter';
import { useTranslation } from '../../hooks/useTranslation';
import { markDriverArrived, verifyDriverRidePin, completeDriverTrip, confirmDriverCashPayment, cancelDriverRide } from '../../services/driver-service';
import { formatFare, RoutePoint } from '../../types/ride';
import { MapDefaults, getRoute } from '../../services/location-service';
import { ApiError } from '../../services/driver-api-client';
import { Colors } from '../../constants/theme';

// Reason sent to the backend stays a stable English id (stored verbatim as
// rides.cancellation_reason — an internal/audit string, not shown to the
// rider translated); only the on-screen label is localized.
const CANCEL_REASONS: { id: string; key: string }[] = [
  { id: 'Passenger is a no-show', key: 'driverCancelNoShow' },
  { id: 'Wrong pickup location', key: 'driverCancelWrongLocation' },
  { id: 'Vehicle issue', key: 'driverCancelVehicleIssue' },
  { id: 'Other', key: 'driverCancelOther' },
];

// The active-trip screen — mirrors the reference driver app's JourneySheet:
// rider card, "enter the rider's code" pad at arrival, a running trip meter,
// and complete/cancel actions. One ride per screen (rideId param), backed by
// hooks/useDriverRideDetails' poll loop.
export default function DriverJourneyScreen() {
  const { t } = useTranslation();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { ride } = useDriverRideDetails(rideId ?? null);
  const { contentStyle, mapHeight } = useResponsive();
  // The cancel-reason bottom sheet lives in a transparent Modal (no automatic
  // SafeArea) — pad its bottom by the system inset so the action list stays
  // clear of the gesture bar / 3-button nav.
  const insets = useSafeAreaInsets();


  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  // Polyline from pickup → destination so the driver sees the whole planned
  // path, not just two pins. Fetched once per ride (route is static).
  useEffect(() => {
    if (!ride) return;
    getRoute({ from: ride.pickup, to: ride.destination }).then((route) => {
      setRoutePoints(route?.points ?? []);
    }).catch(() => setRoutePoints([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride?.id]);

  // The driver's own position (published by the layout's location reporting), so the map shows
  // where the driver is as well as where the passenger is, and the road between them.
  const fix = useDriverLocationStore((s) => s.fix);
  const [approachPoints, setApproachPoints] = useState<RoutePoint[]>([]);
  const approaching = ride?.status === 'driverArriving' || ride?.status === 'driverArrived';
  // Re-route only after the driver has moved a few hundred metres (3 decimals ≈ 110 m).
  const fixKey = fix ? `${fix.latitude.toFixed(3)},${fix.longitude.toFixed(3)}` : '';
  useEffect(() => {
    if (!ride || !approaching || !fix) {
      setApproachPoints([]);
      return;
    }
    let cancelled = false;
    getRoute({
      from: { address: '', latitude: fix.latitude, longitude: fix.longitude },
      to: ride.pickup,
    })
      .then((route) => { if (!cancelled) setApproachPoints(route?.points ?? []); })
      .catch(() => { if (!cancelled) setApproachPoints([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride?.id, approaching, fixKey]);

  // Other passengers in the same car (shared rides) and requests still waiting for an answer.
  const { rides: myRides } = useDriverActiveRide(true);
  const companions = myRides.filter((r) => r.id !== rideId && r.status !== 'driverAssigned');
  const waitingOffers = myRides.filter((r) => r.status === 'driverAssigned' && r.id !== rideId);

  const meter = useLiveMeter(ride ? { rideType: ride.rideType } : null);
  const rideInTrip = !!ride && (ride.status === 'pinVerified' || ride.status === 'inProgress');
  useEffect(() => {
    if (rideInTrip && !meter.metering) meter.startMeter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideInTrip, meter.metering]);

  const [pin, setPin] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | undefined>();
  const [cancelSheetOpen, setCancelSheetOpen] = useState(false);
  const [completion, setCompletion] = useState<{ fare: number; method: string } | null>(null);

  if (!ride) {
    return (
      <SafeAreaViewPlaceholder className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator color={Colors.primary} />
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

  if (completion || ride.status === 'paymentPending') {
    const fare = completion?.fare ?? ride.finalFare ?? ride.estimatedFare;
    const method = completion?.method ?? ride.paymentMethod.id;
    return (
      <SafeAreaViewPlaceholder className="flex-1 bg-surface">
        <View className="flex-1 items-center justify-center px-8">
          <View className="h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: Colors['primary-tint'] }}>
            <Ionicons name="checkmark" size={32} color={Colors.primary} />
          </View>
          <Text className="mt-4 text-title-2 text-fg font-display">{t('driverTripComplete')}</Text>
          <Text className="mt-1 text-large-title font-bold text-primary-text">{formatFare(fare)}</Text>
          <Text className="mt-1 text-subhead text-fg-muted">
            {method === 'cash' ? t('driverCollectCash') : t('driverPaymentPending')}
          </Text>
          {method === 'cash' ? (
            <View className="mt-6 w-full">
              <Button title={t('confirmCashPayment')} onPress={handleConfirmCash} loading={actionLoading} />
            </View>
          ) : null}
          {actionError ? <View className="mt-3"><ErrorMessage message={actionError} /></View> : null}
          <View className="mt-8 w-full">
            <Button title={t('driverBackToCockpit')} onPress={() => router.replace('/(driver)/(tabs)' as any)} />
          </View>
        </View>
      </SafeAreaViewPlaceholder>
    );
  }

  // The passenger cancelled from their side (rideService.js's cancelRide()
  // now notifies the driver too — see the migration report) — this screen
  // must say so plainly rather than showing a blank action area forever.
  if (ride.status === 'cancelled') {
    return (
      <SafeAreaViewPlaceholder className="flex-1 bg-surface">
        <View className="flex-1 items-center justify-center px-8">
          <View className="h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: Colors['danger-soft'] }}>
            <Ionicons name="close" size={32} color={Colors.danger} />
          </View>
          <Text className="mt-4 text-title-2 text-fg font-display">{t('driverRideCancelledTitle')}</Text>
          <Text className="mt-1 text-center text-subhead text-fg-muted">
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
  const inTrip = ride.status === 'pinVerified' || ride.status === 'inProgress';

  // Pre-pickup, prefer the rider's live-reported position over the static
  // pickup pin they requested from — they may have walked since then (see
  // hooks/usePassengerLocationReporting.ts).
  const riderLive = awaitingArrival && ride.rider?.latitude != null && ride.rider?.longitude != null
    ? { latitude: ride.rider.latitude, longitude: ride.rider.longitude }
    : null;
  const pickupPos = { latitude: ride.pickup.latitude!, longitude: ride.pickup.longitude! };
  const center = riderLive ?? (fix && approaching ? { latitude: fix.latitude, longitude: fix.longitude } : pickupPos);
  const markers: RideMapMarker[] = [
    { id: 'pickup', position: pickupPos, icon: 'pickup' },
    { id: 'dest', position: { latitude: ride.destination.latitude!, longitude: ride.destination.longitude! }, icon: 'destination' },
    ...(riderLive ? [{ id: 'rider', position: riderLive, icon: 'me' as const }] : []),
    ...(fix ? [{ id: 'driver', position: { latitude: fix.latitude, longitude: fix.longitude }, icon: 'driver' as const }] : []),
  ];
  // Heading to the passenger: draw the road from the driver to the pickup. Once the passenger is
  // on board, draw the planned trip to the destination.
  const mapRoute = approaching && approachPoints.length > 1 ? approachPoints : routePoints;

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-surface">
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      {/* Map takes ~28% of the screen (clamped 200–320pt) instead of a
          fixed 224px, so short phones keep room for the actions and tablets
          don't get a postage stamp. */}
      <View style={{ height: mapHeight }} className="w-full">
        <RideMap
          center={center}
          markers={markers}
          routePolyline={mapRoute}
          retryLabel={t('tryAgain')}
          loadingLabel={t('mapLoading')}
          errorLabel={t('mapError')}
        />
      </View>

      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" contentContainerClassName="pb-8">
      <View style={contentStyle} className="px-5 pt-2">
        <BackHeader onBack={() => router.replace('/(driver)/(tabs)' as any)} />

        <Card padded={false} className="mt-3 flex-row items-center justify-between p-4">
          <View className="flex-1 pr-2">
            <View className="flex-row items-center gap-2">
              <Text className="shrink text-body font-bold text-fg" numberOfLines={1}>{ride.rider?.name ?? t('driver')}</Text>
              {ride.rideType === 'shared' ? <Badge tone="success" label={t('driverSharedRide')} /> : null}
            </View>
            <Text className="mt-0.5 text-footnote text-fg-muted" numberOfLines={2}>
              {awaitingPin || inTrip ? ride.destination.address : ride.pickup.address}
            </Text>
          </View>
        </Card>

        {waitingOffers.length > 0 ? (
          <Pressable className="mt-3 rounded-2xl px-4 py-3" style={{ backgroundColor: Colors['primary-tint'] }} onPress={() => router.replace('/(driver)/(tabs)' as any)}>
            <Text className="text-subhead font-semibold text-primary-text">{`${t('driverNewRideRequest')} · ${waitingOffers.length}`}</Text>
          </Pressable>
        ) : null}

        {companions.length > 0 ? (
          <View className="mt-3">
            <Text className="text-caption text-fg-muted">{t('driverPassengersOnTrip')}</Text>
            {companions.map((c) => (
              <Pressable
                key={c.id}
                className="mt-2 flex-row items-center justify-between rounded-2xl border border-border px-4 py-3"
                onPress={() => router.replace({ pathname: '/(driver)/journey', params: { rideId: c.id } } as any)}
              >
                <Text className="flex-1 text-subhead text-fg" numberOfLines={1}>{`${c.rider?.name ?? t('driverPassengerPickup')} → ${c.destination.address}`}</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors['fg-muted']} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {awaitingArrival ? (
          <View className="mt-5">
            <Text className="text-subhead text-fg-muted">{t('driverHeadToPickup')}</Text>
            <View className="mt-3">
              <Button title={t('driverIveArrived')} onPress={handleArrived} loading={actionLoading} />
            </View>
          </View>
        ) : null}

        {awaitingPin ? (
          <View className="mt-5">
            <Text className="text-subhead font-semibold text-fg">{t('driverEnterRiderCode')}</Text>
            <Text className="mt-1 text-caption text-fg-muted">{t('driverEnterRiderCodeSubtitle')}</Text>
            <View className="mt-3">
              <Input value={pin} onChangeText={setPin} keyboardType="number-pad" maxLength={4} placeholder="0000" />
            </View>
            <View className="mt-3">
              <Button title={t('driverStartTrip')} onPress={handleSubmitPin} loading={actionLoading} />
            </View>
            <View className="mt-2">
              <Button title={t('driverPairTripAction')} variant="outline" icon="qr-code-outline" onPress={() => router.push('/(driver)/pair-trip' as any)} />
            </View>
          </View>
        ) : null}

        {inTrip ? (
          <View className="mt-5">
            <Card tone="tint" padded={false} className="p-4">
              <Text className="text-caption text-fg-muted">{t('driverEstimatedFare')}</Text>
              <Text className="mt-1 text-title-1 font-bold text-fg" numberOfLines={1} adjustsFontSizeToFit>
                {formatFare(ride.estimatedFare)}
              </Text>
            </Card>
            <Card padded={false} className="mt-3 flex-row p-4">
              <MeterStat label={t('driverMeterDistance')} value={`${meter.distanceKm.toFixed(2)} km`} />
              <MeterStat label={t('driverMeterDuration')} value={formatClock(meter.elapsedSeconds)} />
              <MeterStat label={t('waitingFare')} value={formatClock(meter.waitingSeconds)} />
              <MeterStat label={t('driverMeterFare')} value={formatFare(Math.max(ride.estimatedFare, Math.round(meter.fare)))} />
            </Card>
            <View className="mt-3 gap-2">
              <Text className="mb-1 text-subhead font-semibold text-fg">{t('driverConfirmDropoffTitle')}</Text>
              <SlideToConfirm
                label={t('driverSlideConfirmDropoff')}
                confirmedLabel={t('driverDropoffConfirmed')}
                onConfirm={handleComplete}
                disabled={actionLoading}
              />
              <Button title={t('driverEbillingTitle')} variant="outline" icon="keypad-outline" onPress={() => router.push('/(driver)/ebill-dialpad' as any)} />
            </View>
          </View>
        ) : null}

        {actionError ? <View className="mt-3"><ErrorMessage message={actionError} /></View> : null}

        {!inTrip ? (
          <Pressable className="mt-4 items-center py-2" onPress={() => setCancelSheetOpen(true)}>
            <Text className="text-subhead font-semibold text-danger">{t('driverCancelTrip')}</Text>
          </Pressable>
        ) : null}
      </View>
      </ScrollView>

      <Modal visible={cancelSheetOpen} transparent animationType="slide" onRequestClose={() => setCancelSheetOpen(false)}>
        <View className="flex-1 justify-end bg-black/50">
          <View className="rounded-t-sheet bg-surface p-6" style={{ paddingBottom: 32 + insets.bottom }}>
            <Text className="text-title-3 font-bold text-fg">{t('driverWhyCancelling')}</Text>
            <View className="mt-4 gap-2">
              {CANCEL_REASONS.map((reason) => (
                <Pressable
                  key={reason.id}
                  className="rounded-2xl border border-border bg-surface px-4 py-3.5"
                  style={({ pressed }) => ({ backgroundColor: pressed ? Colors['surface-muted'] : Colors.surface })}
                  onPress={() => handleCancel(reason.id)}
                >
                  <Text className="text-subhead text-fg">{t(reason.key as any)}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable className="mt-4 items-center" onPress={() => setCancelSheetOpen(false)}>
              <Text className="text-subhead font-semibold text-fg-muted">{t('driverNeverMind')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      </KeyboardAvoidingView>
    </SafeAreaViewPlaceholder>
  );
}


function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function MeterStat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 items-center">
      <Text className="text-caption text-fg-muted" numberOfLines={1}>{label}</Text>
      <Text className="mt-0.5 text-callout font-bold text-fg" numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}
