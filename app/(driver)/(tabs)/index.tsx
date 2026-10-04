import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { Button } from '../../../components/Button';
import { useDriverAuthStore } from '../../../stores/useDriverAuthStore';
import { useDriverActiveRide } from '../../../hooks/useDriverActiveRide';
import { useTranslation } from '../../../hooks/useTranslation';
import { setDriverStatus, acceptDriverRide, declineDriverRide } from '../../../services/driver-service';
import { getDriverEarningsSummary } from '../../../services/driver-profile-service';
import { driverCanGoActive, DriverEarningsSummary } from '../../../types/driver';
import { formatFare } from '../../../types/ride';
import { ApiError } from '../../../services/driver-api-client';

const OFFER_COUNTDOWN_SECONDS = 20;

function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

function greetingKey(): 'driverGoodMorning' | 'driverGoodAfternoon' | 'driverGoodEvening' {
  const hour = new Date().getHours();
  if (hour < 12) return 'driverGoodMorning';
  if (hour < 18) return 'driverGoodAfternoon';
  return 'driverGoodEvening';
}

// Driver Home — matches the reference driver-home screenshot: green banner
// (brand mark + profile badge), a greeting card with online status pill, a
// three-stat row (active rides / rating / today's earnings), and a
// full-width "Go Online" / "Go Offline" action. The offer overlay and
// trip-in-progress banner replace the screenshot's "Private Ride / Share
// Ride" shortcut cards, which don't apply to a driver's own home screen
// (those exist verbatim on the passenger side already) — see the migration
// report for that call.
export default function DriverHomeScreen() {
  const isFocused = useIsFocused();
  const { t } = useTranslation();
  // Bottom sheets render inside a transparent full-screen Modal, which gets
  // no SafeArea automatically — the OfferOverlay pads its own bottom edge by
  // the device's system inset so Accept/Decline never sit behind the gesture
  // bar or 3-button nav.
  const insets = useSafeAreaInsets();
  const currentDriver = useDriverAuthStore((s) => s.currentDriver);
  const refreshDriver = useDriverAuthStore((s) => s.refresh);

  const [togglingOnline, setTogglingOnline] = useState(false);
  const [toggleError, setToggleError] = useState<string | undefined>();
  const isOnline = currentDriver?.status === 'active' || currentDriver?.status === 'busy';

  const { rides, primaryRide } = useDriverActiveRide(!!currentDriver);

  const [summary, setSummary] = useState<DriverEarningsSummary | null>(null);
  useFocusEffect(
    useCallback(() => {
      refreshDriver().catch(() => {});
      getDriverEarningsSummary().then(setSummary).catch(() => {});
    }, [refreshDriver])
  );

  // Online, but the server has stopped receiving this phone's position: the
  // driver is not offered rides until it resumes, so say so.
  const gpsStale = isOnline && !!currentDriver?.location && !currentDriver.location.fresh;
  useEffect(() => {
    if (!isOnline || !isFocused) return;
    const timer = setInterval(() => { refreshDriver().catch(() => {}); }, 15000);
    return () => clearInterval(timer);
  }, [isOnline, isFocused, refreshDriver]);

  const offeredRide = primaryRide && primaryRide.status === 'driverAssigned' ? primaryRide : null;
  const tripInProgress = primaryRide && primaryRide.status !== 'driverAssigned' ? primaryRide : null;
  const activeRideCount = rides.filter((r) => r.status !== 'driverAssigned').length;

  async function handleToggleOnline() {
    if (!currentDriver) return;
    const next = !isOnline;
    if (next && !driverCanGoActive(currentDriver)) {
      setToggleError(t('driverAwaitingVerification'));
      return;
    }
    setToggleError(undefined);
    setTogglingOnline(true);
    try {
      await setDriverStatus(next ? 'active' : 'offline');
      await refreshDriver();
    } catch (err) {
      setToggleError(err instanceof ApiError ? err.message : t('driverStatusUpdateFailed'));
    } finally {
      setTogglingOnline(false);
    }
  }

  async function handleAccept() {
    if (!offeredRide) return;
    try {
      await acceptDriverRide(offeredRide.id);
      router.push({ pathname: '/(driver)/journey', params: { rideId: offeredRide.id } } as any);
    } catch {
      // Surfaced inline by OfferOverlay's own retry affordance below.
    }
  }

  async function handleDecline() {
    if (!offeredRide) return;
    declineDriverRide(offeredRide.id).catch(() => {});
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-primary" edges={['top', 'left', 'right']}>
      {/* See the passenger home: white icons only while this header shows. */}
      {isFocused ? <StatusBar style="light" /> : null}
      <View className="bg-primary px-5 pb-8 pt-3">
        <View className="flex-row items-center">
          <View className="h-11 w-11 items-center justify-center rounded-xl bg-white">
            <Text className="text-2xl font-bold text-primary">K</Text>
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-xl font-bold text-white">Kimu Transport</Text>
            <Text className="text-xs font-medium tracking-wide text-white/85">{t('driverRoleLabel')}</Text>
          </View>
          <Pressable
            className="h-11 w-11 items-center justify-center rounded-full bg-white/20"
            onPress={() => router.push('/(driver)/(tabs)/more' as any)}
          >
            <Ionicons name="person-outline" color="#fff" size={22} />
          </Pressable>
        </View>
      </View>

      <ScrollView className="-mt-5 flex-1 rounded-t-[28px] bg-bg-light" contentContainerClassName="px-5 pb-6 pt-5">
        <View
          className="flex-row items-center rounded-2xl border border-border bg-white p-4"
          style={{ shadowColor: '#111827', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 }}
        >
          <View className="h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(14,124,74,0.12)' }}>
            <Text className="text-lg font-bold text-primary">{initialsFor(currentDriver?.fullName ?? '')}</Text>
          </View>
          <View className="ml-3.5 flex-1">
            <Text className="text-[13px] text-text-secondary">{t(greetingKey())},</Text>
            <Text className="text-lg font-bold text-ink">{currentDriver?.fullName?.split(' ')[0] || t('driverRoleLabel')}</Text>
          </View>
          <View className={`flex-row items-center rounded-full px-3 py-1.5 ${gpsStale ? 'bg-warning/10' : isOnline ? 'bg-primary/10' : 'bg-gray-light'}`}>
            <View className="h-2 w-2 rounded-full" style={{ backgroundColor: gpsStale ? '#D97706' : isOnline ? '#0E7C4A' : '#9CA3AF' }} />
            <Text className={`ml-1.5 text-xs font-semibold ${gpsStale ? 'text-warning' : isOnline ? 'text-primary' : 'text-text-secondary'}`}>
              {gpsStale ? t('driverGpsStale') : isOnline ? t('driverOnline') : t('driverOffline')}
            </Text>
          </View>
        </View>

        <View
          className="mt-3.5 flex-row items-center justify-around rounded-2xl border border-border bg-white py-4"
          style={{ shadowColor: '#111827', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1 }}
        >
          <StatColumn icon="car-outline" value={String(activeRideCount)} label={t('driverActiveRides')} />
          <View className="h-10 w-px bg-border" />
          <StatColumn icon="star" value={currentDriver?.rating != null ? currentDriver.rating.toFixed(1) : '5.0'} label={t('driverRatingLabel')} iconColor="#F97316" />
          <View className="h-10 w-px bg-border" />
          <StatColumn icon="wallet-outline" value={summary ? formatFare(summary.balance?.driverShareRate ? summary.today.amount : summary.today.fares) : '—'} label={t(summary && !summary.balance?.driverShareRate ? 'driverFaresToday' : 'driverTodaysEarnings')} />
        </View>

        {!currentDriver?.verified ? (
          <View className="mt-3.5 flex-row items-center rounded-2xl border border-warning bg-white p-4">
            <Ionicons name="alert-circle-outline" size={20} color="#D97706" />
            <Text className="ml-2.5 flex-1 text-[13px] text-ink">{t('driverVerificationPendingBody')}</Text>
          </View>
        ) : null}

        <View className="mt-3.5">
          {togglingOnline ? (
            <View className="h-button w-full items-center justify-center rounded bg-primary/80">
              <ActivityIndicator color="#fff" />
            </View>
          ) : (
            <Button
              title={isOnline ? t('driverGoOffline') : t('driverGoOnline')}
              icon={isOnline ? 'power' : 'location'}
              onPress={handleToggleOnline}
              variant={isOnline ? 'outline' : 'primary'}
            />
          )}
          {toggleError ? <Text className="mt-2 text-xs text-error">{toggleError}</Text> : null}
        </View>

        {tripInProgress ? (
          <Pressable
            className="mt-3.5 flex-row items-center rounded-2xl border border-primary bg-white p-4"
            onPress={() => router.push({ pathname: '/(driver)/journey', params: { rideId: tripInProgress.id } } as any)}
          >
            <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(14,124,74,0.12)' }}>
              <Ionicons name="navigate" size={20} color="#0E7C4A" />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-[15px] font-bold text-ink">{t('driverTripInProgress')}</Text>
              <Text numberOfLines={1} className="text-[13px] text-text-secondary">{tripInProgress.destination.address}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </Pressable>
        ) : null}

        <View className="mt-3.5 gap-3">
          <Pressable className="flex-row items-center justify-between rounded-2xl border border-border bg-white p-4" onPress={() => router.push('/(driver)/wallet/payouts' as any)}>
            <View className="flex-row items-center">
              <Ionicons name="cash-outline" size={20} color="#0E7C4A" />
              <Text className="ml-3 text-[14.5px] font-semibold text-ink">{t('driverPayouts')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B7280" />
          </Pressable>
        </View>
      </ScrollView>

      <OfferOverlay
        rideId={offeredRide?.id ?? null}
        pickupAddress={offeredRide?.pickup.address}
        destinationAddress={offeredRide?.destination.address}
        fare={offeredRide ? formatFare(offeredRide.estimatedFare) : ''}
        distanceKm={offeredRide?.distanceKm}
        bottomInset={insets.bottom}
        onAccept={handleAccept}
        onDecline={handleDecline}
      />
    </SafeAreaViewPlaceholder>
  );
}

function StatColumn({
  icon,
  value,
  label,
  iconColor = '#0E7C4A',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  iconColor?: string;
}) {
  return (
    <View className="items-center px-2">
      <Ionicons name={icon} size={20} color={iconColor} />
      <Text className="mt-1.5 text-base font-bold text-ink">{value}</Text>
      <Text className="mt-0.5 text-[11px] text-text-secondary">{label}</Text>
    </View>
  );
}

// The reference driver app's OfferOverlay: a full-screen prompt with a countdown badge and
// Accept/Decline — auto-declines when the countdown reaches zero, matching
// its OfferCountdownBadge behavior (client-side only; the backend has no
// server-side offer-expiry timer of its own, see rideDriverOps.js's
// declineRide()).
function OfferOverlay({
  rideId,
  pickupAddress,
  destinationAddress,
  fare,
  distanceKm,
  bottomInset,
  onAccept,
  onDecline,
}: {
  rideId: string | null;
  pickupAddress?: string;
  destinationAddress?: string;
  fare: string;
  distanceKm?: number;
  bottomInset: number;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t } = useTranslation();
  const [seconds, setSeconds] = useState(OFFER_COUNTDOWN_SECONDS);
  const declinedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!rideId) {
      setSeconds(OFFER_COUNTDOWN_SECONDS);
      return;
    }
    setSeconds(OFFER_COUNTDOWN_SECONDS);
    const interval = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(interval);
          if (declinedRef.current !== rideId) {
            declinedRef.current = rideId;
            onDecline();
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rideId]);

  return (
    <Modal visible={!!rideId} transparent animationType="slide">
      <View className="flex-1 justify-end bg-black/40">
        <View
          className="rounded-t-[28px] bg-white p-6"
          style={{
            paddingBottom: 24 + bottomInset,
            shadowColor: '#111827',
            shadowOpacity: 0.2,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: -6 },
            elevation: 8,
          }}
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-bold text-ink">{t('driverNewRideRequest')}</Text>
            <View className="rounded-full bg-accent-soft px-3 py-1">
              <Text className="font-bold text-accent-dark">{seconds}s</Text>
            </View>
          </View>

          <View className="mt-4 gap-3">
            <View className="flex-row items-start">
              <Ionicons name="ellipse" size={12} color="#0E7C4A" style={{ marginTop: 4 }} />
              <Text className="ml-2.5 flex-1 text-[14.5px] text-ink">{pickupAddress}</Text>
            </View>
            <View className="flex-row items-start">
              <Ionicons name="location" size={14} color="#F97316" style={{ marginTop: 2 }} />
              <Text className="ml-2 flex-1 text-[14.5px] text-ink">{destinationAddress}</Text>
            </View>
          </View>

          <View className="mt-4 flex-row items-center justify-between rounded-xl bg-gray-light px-4 py-3">
            <Text className="text-sm text-text-secondary">{distanceKm ? `${distanceKm.toFixed(1)} km` : ''}</Text>
            <Text className="text-lg font-bold text-primary">{fare}</Text>
          </View>

          <View className="mt-5 flex-row gap-3">
            <View className="flex-1">
              <Button title={t('driverDecline')} variant="outline" destructive onPress={onDecline} />
            </View>
            <View className="flex-1">
              <Button title={t('driverAccept')} onPress={onAccept} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
