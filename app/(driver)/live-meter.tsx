import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useResponsive } from '../../hooks/useResponsive';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Modal,
  PanResponder,
  Animated,
  Alert,
} from 'react-native';
import { SafeAreaViewPlaceholder } from '../../components/SafeAreaViewPlaceholder';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { ErrorMessage } from '../../components/ErrorMessage';
import { RideMap, RideMapMarker } from '../../components/RideMap';
import { useDriverActiveRide } from '../../hooks/useDriverActiveRide';
import { useDriverRideDetails } from '../../hooks/useDriverRideDetails';
import { useLiveMeter } from '../../hooks/useLiveMeter';
import { useTranslation } from '../../hooks/useTranslation';
import {
  acceptDriverRide,
  markDriverArrived,
  verifyDriverRidePin,
  completeDriverTrip,
  cancelDriverRide,
} from '../../services/driver-service';
import { formatFare } from '../../types/ride';
import { MapDefaults, getRoute } from '../../services/location-service';
import { RoutePoint } from '../../types/ride';
import { ApiError } from '../../services/driver-api-client';

const CANCEL_REASONS: { id: string; key: string }[] = [
  { id: 'Passenger is a no-show', key: 'driverCancelNoShow' },
  { id: 'Wrong pickup location', key: 'driverCancelWrongLocation' },
  { id: 'Vehicle issue', key: 'driverCancelVehicleIssue' },
  { id: 'Other', key: 'driverCancelOther' },
];

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// The driving meter screen — a full-bleed map with a live fare overlay, the
// same instrument as the reference taximeter. Before the trip is under way
// the driver sees the rider's pickup/destination plus a "slide to start"
// control; sliding reports arrival and verifies the rider's PIN (starting the
// trip), after which the meter runs against GPS distance and time.
export default function DriverLiveMeterScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ rideId?: string }>();
  const { spacing, dimensions } = useResponsive();

  const { primaryRide: activeRide } = useDriverActiveRide(!params.rideId);
  const { ride } = useDriverRideDetails(params.rideId ?? null);
  const currentRide = params.rideId ? ride : activeRide;

  const [pin, setPin] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | undefined>();
  const [cancelSheetOpen, setCancelSheetOpen] = useState(false);
  const [completion, setCompletion] = useState<{ fare: number; method: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const meterParams = useMemo(
    () =>
      currentRide
        ? { baseFare: currentRide.vehicle.baseFare ?? 0, farePerKm: currentRide.vehicle.farePerKm ?? 0, rideType: currentRide.rideType }
        : null,
    [currentRide]
  );
  const { metering, startMeter, distanceKm, elapsedSeconds, fare } = useLiveMeter(meterParams);

  // Once the ride is in-progress the meter runs automatically.
  useEffect(() => {
    if (currentRide && (currentRide.status === 'inProgress' || currentRide.status === 'pinVerified') && !metering) {
      startMeter();
    }
  }, [currentRide, metering, startMeter]);

  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  useEffect(() => {
    if (!currentRide) return;
    getRoute({ from: currentRide.pickup, to: currentRide.destination }).then((route) => {
      setRoutePoints(route?.points ?? []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRide?.id]);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 2600);
  }

  async function handleSlideToStart() {
    if (!currentRide || actionLoading) return;
    setActionError(undefined);
    setActionLoading(true);
    try {
      if (currentRide.status === 'driverAssigned') {
        await acceptDriverRide(currentRide.id);
      }
      const { pin: arrivedPin } = await markDriverArrived(currentRide.id);
      await verifyDriverRidePin(currentRide.id, arrivedPin);
      startMeter();
      showToast(t('driverTripStarted'));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t('driverUpdateTripFailed'));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSubmitPin() {
    if (!currentRide || pin.trim().length < 4) return setActionError(t('driverEnterRiderCodeHint'));
    setActionError(undefined);
    setActionLoading(true);
    try {
      await verifyDriverRidePin(currentRide.id, pin.trim());
      setPin('');
      startMeter();
      showToast(t('driverTripStarted'));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t('driverIncorrectCode'));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleComplete() {
    if (!currentRide) return;
    setActionError(undefined);
    setActionLoading(true);
    try {
      const result = await completeDriverTrip(currentRide.id);
      setCompletion({ fare: result.ride.finalFare ?? result.ride.estimatedFare, method: result.payment.method });
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t('driverCompleteTripFailed'));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancel(reason: string) {
    if (!currentRide) return;
    setCancelSheetOpen(false);
    try {
      await cancelDriverRide(currentRide.id, reason);
      router.replace('/(driver)/(tabs)' as any);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : t('driverCancelTripFailed'));
    }
  }

  const markers: RideMapMarker[] =
    currentRide && currentRide.pickup.latitude != null && currentRide.destination.latitude != null
      ? [
          { id: 'pickup', position: { latitude: currentRide.pickup.latitude!, longitude: currentRide.pickup.longitude! }, icon: 'pickup' },
          { id: 'dest', position: { latitude: currentRide.destination.latitude!, longitude: currentRide.destination.longitude! }, icon: 'destination' },
        ]
      : [];

  if (completion) {
    return (
      <SafeAreaViewPlaceholder className="flex-1 bg-dark-bg">
        <View className="flex-1 items-center justify-center px-8">
          <View className="h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(22,163,74,0.16)' }}>
            <Ionicons name="checkmark" size={32} color="#16A34A" />
          </View>
          <Text className="mt-4 text-xl font-bold text-dark-text">{t('driverTripComplete')}</Text>
          <Text className="mt-1 text-3xl font-bold text-primary">{formatFare(completion.fare)}</Text>
          <Text className="mt-1 text-sm text-dark-sub">
            {completion.method === 'cash' ? t('driverCollectCash') : t('driverPaymentSettledAuto')}
          </Text>
          <View className="mt-8 w-full">
            <Button title={t('driverBackToCockpit')} onPress={() => router.replace('/(driver)/(tabs)' as any)} />
          </View>
        </View>
      </SafeAreaViewPlaceholder>
    );
  }

  if (!currentRide) {
    return (
      <SafeAreaViewPlaceholder className="flex-1 bg-dark-bg">
        <View className="flex-1 items-center justify-center px-8">
          <View className="h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(22,163,74,0.12)' }}>
            <Ionicons name="speedometer-outline" size={30} color="#16A34A" />
          </View>
          <Text className="mt-4 text-xl font-bold text-dark-text">{t('driverTripEmptyTitle')}</Text>
          <Text className="mt-1 text-center text-sm text-dark-sub">{t('driverTripEmptyHint')}</Text>
          <View className="mt-8 w-full">
            <Button title={t('driverBackToCockpit')} onPress={() => router.replace('/(driver)/(tabs)' as any)} />
          </View>
        </View>
      </SafeAreaViewPlaceholder>
    );
  }

  const isRunning = currentRide.status === 'inProgress' || currentRide.status === 'pinVerified';
  const needsPin = currentRide.status === 'driverArrived';
  const center = {
    latitude: currentRide.pickup.latitude ?? MapDefaults.latitude,
    longitude: currentRide.pickup.longitude ?? MapDefaults.longitude,
  };

  return (
    <View className="flex-1 bg-dark-bg">
      {/* Full-bleed map behind everything. */}
      <View className="absolute inset-0">
        <RideMap
          center={center}
          markers={markers}
          routePolyline={routePoints}
          retryLabel={t('tryAgain')}
          loadingLabel={t('mapLoading')}
          errorLabel={t('mapError')}
        />
      </View>

      {/* Top bar: back + cancel/hakana over the map. */}
      <View className="absolute inset-x-0 top-0 flex-row items-center justify-between px-4" style={{ paddingTop: insets.top + 8 }}>
        <Pressable
          className="h-10 w-10 items-center justify-center rounded-full bg-black/40"
          onPress={() => router.back()}
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        {isRunning ? (
          <Pressable
            className="h-10 items-center justify-center rounded-full bg-black/40 px-4"
            onPress={() => setCancelSheetOpen(true)}
          >
            <Text className="text-sm font-semibold text-white">{t('driverCancelAction')}</Text>
          </Pressable>
        ) : null}
      </View>

      {/* Bottom control panel. */}
      <View
        className="absolute inset-x-0 bottom-0 rounded-t-[28px] border-t border-dark-border bg-dark-surface"
        style={{ paddingBottom: insets.bottom + spacing.xs, paddingTop: spacing.xs }}
      >
        {isRunning ? (
          <View>
            <View className="items-center">
              <Text className="text-xs font-medium uppercase tracking-wider text-dark-muted">{t('driverMeterFare')}</Text>
              <Text className="mt-1 text-4xl font-bold text-primary">{formatFare(fare)}</Text>
            </View>

            <View className="mt-4 flex-row items-center justify-around rounded-2xl bg-dark-surface-2 py-3.5">
              <MeterStat icon="navigate" value={`${distanceKm.toFixed(1)} km`} label={t('driverMeterDistance')} iconSize={dimensions.iconSmall} bodySize={dimensions.typography?.body || 14} captionSize={dimensions.typography?.bodyLineHeight - 6 || 18} />
              <View className="h-8 w-px bg-dark-border" />
              <MeterStat icon="time-outline" value={formatDuration(elapsedSeconds)} label={t('driverMeterDuration')} iconSize={dimensions.iconSmall} bodySize={dimensions.typography?.body || 14} captionSize={dimensions.typography?.bodyLineHeight - 6 || 18} />
              <View className="h-8 w-px bg-dark-border" />
              <MeterStat icon="pricetag-outline" value={formatFare(fare)} label={t('driverMeterPrice')} iconSize={dimensions.iconSmall} bodySize={dimensions.typography?.body || 14} captionSize={dimensions.typography?.bodyLineHeight - 6 || 18} />
            </View>

            {actionError ? (
              <View className="mt-3">
                <ErrorMessage message={actionError} dark />
              </View>
            ) : null}

            <View className="mt-4 flex-row gap-3">
              <View className="flex-1">
                <Button title={t('driverCompleteTrip')} onPress={handleComplete} loading={actionLoading} />
              </View>
            </View>
          </View>
        ) : needsPin ? (
          <View>
            <Text className="text-sm font-semibold text-dark-text">{t('driverEnterRiderCode')}</Text>
            <Text className="mt-1 text-xs text-dark-sub">{t('driverEnterRiderCodeSubtitle')}</Text>
            <View className="mt-3">
              <Input
                value={pin}
                onChangeText={setPin}
                keyboardType="number-pad"
                maxLength={4}
                placeholder="0000"
                dark
              />
            </View>
            <View className="mt-3">
              <Button title={t('driverStartTrip')} onPress={handleSubmitPin} loading={actionLoading} />
            </View>
            {actionError ? (
              <View className="mt-3">
                <ErrorMessage message={actionError} dark />
              </View>
            ) : null}
          </View>
        ) : (
          <View>
            <View className="flex-row items-center">
              <View className="h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(22,163,74,0.16)' }}>
                <Ionicons name="person" size={20} color="#16A34A" />
              </View>
              <View className="ml-3 flex-1">
                <Text className="text-base font-bold text-dark-text">{currentRide.rider?.name ?? t('driver')}</Text>
                <Text numberOfLines={1} className="text-[13px] text-dark-sub">
                  {currentRide.pickup.address}
                </Text>
              </View>
            </View>

            <View className="mt-3 flex-row items-start">
              <Ionicons name="navigate" size={14} color="#DC2626" style={{ marginTop: 2 }} />
              <Text numberOfLines={1} className="ml-2 flex-1 text-[13px] text-dark-sub">
                {currentRide.destination.address}
              </Text>
            </View>

            {actionError ? (
              <View className="mt-3">
                <ErrorMessage message={actionError} dark />
              </View>
            ) : null}

            <View className="mt-4">
              <SlideToStart
                onTrigger={handleSlideToStart}
                disabled={actionLoading}
                label={actionLoading ? '…' : t('driverSlideToStart')}
                hint={t('driverSlideToStartHint')}
                fontSize={dimensions.typography?.body || 15}
              />
            </View>
          </View>
        )}
      </View>

      {toast ? (
        <View className="absolute inset-x-0 items-center" style={{ top: insets.top + 64 }}>
          <View
            className="max-w-[85%] rounded-full border border-primary px-4 py-2"
            style={{ backgroundColor: 'rgba(11,18,32,0.95)' }}
          >
            <Text className="text-[13px] font-semibold text-primary">{toast}</Text>
          </View>
        </View>
      ) : null}

      <Modal visible={cancelSheetOpen} transparent animationType="slide" onRequestClose={() => setCancelSheetOpen(false)}>
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(4,8,16,0.66)' }}>
          <View className="rounded-t-[28px] bg-dark-surface p-6" style={{ paddingBottom: 32 + insets.bottom }}>
            <Text className="text-lg font-bold text-dark-text">{t('driverWhyCancelling')}</Text>
            <View className="mt-4 gap-2">
              {CANCEL_REASONS.map((reason) => (
                <Pressable
                  key={reason.id}
                  className="rounded-xl border border-dark-border bg-dark-surface-2 px-4 py-3.5"
                  onPress={() => handleCancel(reason.id)}
                >
                  <Text className="text-[14.5px] text-dark-text">{t(reason.key as any)}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable className="mt-4 items-center" onPress={() => setCancelSheetOpen(false)}>
              <Text className="text-sm font-semibold text-dark-muted">{t('driverNeverMind')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function MeterStat({ icon, value, label, iconSize, bodySize, captionSize }: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string; iconSize: number; bodySize: number; captionSize: number }) {
  return (
    <View className="flex-1 items-center">
      <Ionicons name={icon} size={iconSize} color="#16A34A" />
      <Text className="mt-1 font-bold text-dark-text" style={{ fontSize: bodySize }}>{value}</Text>
      <Text className="mt-0.5 text-dark-muted" style={{ fontSize: captionSize }}>{label}</Text>
    </View>
  );
}

// A classic "slide to start" control: a track with a draggable thumb that,
// once dragged past the threshold, fires onTrigger and locks in the started
// state. Driven by RN core PanResponder + an Animated translateX so it works
// on native and web without extra gesture dependencies.
function SlideToStart({
  onTrigger,
  disabled,
  label,
  hint,
  fontSize,
}: {
  onTrigger: () => void;
  disabled?: boolean;
  label: string;
  hint?: string;
  fontSize: number;
}) {
  const offset = useRef(new Animated.Value(0)).current;
  const [trackWidth, setTrackWidth] = useState(0);
  const triggered = useRef(false);

  const threshold = Math.max(0, trackWidth - 64);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dx) > 4 && !disabled && !triggered.current,
      onPanResponderMove: (_evt, gesture) => {
        offset.setValue(Math.max(0, Math.min(threshold, gesture.dx)));
      },
      onPanResponderRelease: (_evt, gesture) => {
        if (gesture.dx >= threshold) {
          triggered.current = true;
          Animated.spring(offset, { toValue: threshold, useNativeDriver: true, tension: 40, friction: 7 }).start();
          onTrigger();
        } else {
          Animated.spring(offset, { toValue: 0, useNativeDriver: true, tension: 60, friction: 8 }).start();
        }
      },
    })
  ).current;

  return (
    <View>
      <View
        className="h-14 w-full justify-center overflow-hidden rounded-full border border-primary"
        style={{ backgroundColor: 'rgba(22,163,74,0.1)' }}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        {...panResponder.panHandlers}
      >
        <Animated.View
          className="absolute left-1 h-12 w-12 items-center justify-center rounded-full bg-primary"
          style={{ transform: [{ translateX: offset }] }}
        >
          <Ionicons name="chevron-forward" size={24} color="#fff" />
        </Animated.View>
        <Text className="w-full text-center font-bold text-primary" style={{ fontSize }}>{label}</Text>
      </View>
      {hint ? <Text className="mt-1.5 text-center text-[11.5px] text-dark-muted">{hint}</Text> : null}
    </View>
  );
}