import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, Modal } from 'react-native';
import { SafeAreaViewPlaceholder } from '@kimu/shared/components/SafeAreaViewPlaceholder';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';

import { Button } from '@kimu/shared/components/Button';
import { DriverTopBar } from '../../../components/driver/DriverTopBar';
import { useDriverAuthStore } from '../../../stores/useDriverAuthStore';
import { useDriverActiveRide } from '../../../hooks/useDriverActiveRide';
import { useOnlineSince } from '../../../hooks/useOnlineSince';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { setDriverStatus, acceptDriverRide, declineDriverRide } from '../../../services/driver-service';
import { getDriverEarningsSummary, getDriverEarningsHistory } from '../../../services/driver-profile-service';
import { driverCanGoActive, DriverEarningsSummary } from '../../../types/driver';
import { formatFare } from '@kimu/shared/types/ride';
import { ApiError } from '../../../services/driver-api-client';

const OFFER_COUNTDOWN_SECONDS = 20;

type IconName = keyof typeof Ionicons.glyphMap;

function initialsFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

// Hermes ships a trimmed Intl, and Kinyarwanda has no date format there, so a
// bad locale falls back rather than throwing on the driver's home screen.
function todayLabel(locale: string): string {
  const now = new Date();
  try {
    return now.toLocaleDateString(locale === 'rw' ? 'en-GB' : locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return now.toDateString();
  }
}

// Driver home, in the shape of the reference driver app: the shift status and
// its toggle on top, the two things a driver actually starts from here, then
// the day's takings along the bottom. Navigation lives in the side drawer.
export default function DriverHomeScreen() {
  const isFocused = useIsFocused();
  const { t, locale } = useTranslation();
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
  const minutesOnline = useOnlineSince(isOnline);

  const { rides, primaryRide } = useDriverActiveRide(!!currentDriver);

  const [summary, setSummary] = useState<DriverEarningsSummary | null>(null);
  const [lastTripAmount, setLastTripAmount] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      refreshDriver().catch(() => {});
      getDriverEarningsSummary().then(setSummary).catch(() => {});
      getDriverEarningsHistory()
        .then((entries) => {
          const latest = entries[0];
          setLastTripAmount(latest ? latest.netAmount : null);
        })
        .catch(() => {});
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
  // The rider pairs by QR at the pickup, so that step is the one the second
  // action opens; before and after it there is nothing to pair with.
  const pairableRide = tripInProgress && tripInProgress.status === 'driverArrived' ? tripInProgress : null;

  // The driver's own share where Kimu takes a commission; otherwise the full
  // fares, which is what they actually hold at the end of the day.
  const keepsShare = Boolean(summary?.balance?.driverShareRate);
  const dayTotal = summary ? (keepsShare ? summary.today.amount : summary.today.fares) : null;

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

  function openTrip(rideId: string) {
    router.push({ pathname: '/(driver)/journey', params: { rideId } } as any);
  }

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-primary" edges={['left', 'right']}>
      {/* See the passenger home: white icons only while this header shows. */}
      {isFocused ? <StatusBar style="light" /> : null}
      <DriverTopBar code={currentDriver?.licenseNumber || currentDriver?.vehiclePlate || null} />

      <ScrollView className="flex-1 bg-white" contentContainerClassName="pb-6">
        <View className="flex-row items-center px-5 pb-5 pt-5">
          <View className="h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(14,124,74,0.12)' }}>
            <Text className="text-lg font-bold text-primary">{initialsFor(currentDriver?.fullName ?? '')}</Text>
          </View>
          <View className="ml-3.5 flex-1">
            <Text className={`text-[22px] font-bold ${isOnline ? 'text-primary' : 'text-text-secondary'}`}>
              {isOnline ? t('driverOnline') : t('driverOffline')}
            </Text>
            <Text className="font-sans mt-0.5 text-[13px] text-text-secondary">
              {gpsStale
                ? t('driverGpsStale')
                : minutesOnline != null
                  ? t('driverMinutesOnline', { minutes: minutesOnline })
                  : currentDriver?.fullName || ''}
            </Text>
          </View>
          <Switch
            accessibilityLabel={isOnline ? t('driverGoOffline') : t('driverGoOnline')}
            value={isOnline}
            disabled={togglingOnline}
            onValueChange={handleToggleOnline}
            trackColor={{ false: '#E5E7EB', true: 'rgba(14,124,74,0.45)' }}
            thumbColor={isOnline ? '#0E7C4A' : '#FFFFFF'}
            ios_backgroundColor="#E5E7EB"
          />
        </View>

        {toggleError ? (
          <Text className="font-sans px-5 pb-3 text-[13px] text-error">{toggleError}</Text>
        ) : null}

        {!currentDriver?.verified ? (
          <View className="mx-5 mb-4 flex-row items-center rounded-2xl border border-warning bg-accent-soft p-4">
            <Ionicons name="alert-circle-outline" size={20} color="#D97706" />
            <Text className="font-sans ml-2.5 flex-1 text-[13px] text-ink">{t('driverVerificationPendingBody')}</Text>
          </View>
        ) : null}

        {/* The reference app's two big actions, held together by one rail so
            they read as a single block rather than two unrelated cards. */}
        <View className="border-y border-border">
          <ActionRow
            icon="car-sport-outline"
            label={t('driverStartATrip')}
            hint={
              tripInProgress
                ? tripInProgress.destination.address
                : isOnline
                  // Online with nothing assigned: waiting, not something to fix.
                  ? t('driverTripEmptyTitle')
                  : t('driverTripEmptyHint')
            }
            enabled={!!tripInProgress || !isOnline}
            onPress={() => (tripInProgress ? openTrip(tripInProgress.id) : handleToggleOnline())}
          />
          <View className="h-px bg-border" />
          <ActionRow
            icon="qr-code-outline"
            label={t('driverPairWithTrip')}
            hint={pairableRide ? t('driverShowQrSubtitle') : t('driverTripEmptyTitle')}
            enabled={!!pairableRide}
            onPress={() => pairableRide && openTrip(pairableRide.id)}
          />
        </View>

        <View className="flex-row items-center justify-between px-5 py-4">
          <Text className="text-[14px] font-medium text-text-secondary">{todayLabel(locale)}</Text>
          <View className="flex-row items-center">
            <Ionicons name="car-outline" size={18} color="#6B7280" />
            <Text className="ml-2 text-[14px] font-semibold text-ink">{currentDriver?.vehiclePlate || '—'}</Text>
          </View>
        </View>

        <View className="mx-5 flex-row rounded-2xl border border-border bg-gray-light py-4">
          <ShiftStat
            value={lastTripAmount != null ? formatFare(lastTripAmount) : '—'}
            label={t('driverLastTrip')}
          />
          <View className="w-px bg-border" />
          <ShiftStat
            value={summary ? String(summary.today.rides) : '—'}
            label={t('driverTripsShort')}
          />
          <View className="w-px bg-border" />
          <ShiftStat
            value={dayTotal != null ? formatFare(dayTotal) : '—'}
            label={t('driverDayTotal')}
          />
        </View>

        {rides.length > 1 ? (
          <Text className="font-sans px-5 pt-4 text-[13px] text-text-secondary">
            {t('driverTripsCount', { count: rides.length })}
          </Text>
        ) : null}
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

function ActionRow({
  icon,
  label,
  hint,
  enabled,
  onPress,
}: {
  icon: IconName;
  label: string;
  hint: string;
  enabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      className={`flex-row items-center px-5 py-6 ${enabled ? 'active:bg-primary-soft' : 'opacity-45'}`}
    >
      <View className="flex-1 pr-4">
        <Text className="text-[22px] font-semibold text-ink">{label}</Text>
        <Text className="font-sans mt-1 text-[13px] text-text-secondary" numberOfLines={1}>{hint}</Text>
      </View>
      <View className="h-14 w-14 items-center justify-center rounded-full border border-primary/40">
        <Ionicons name={icon} size={26} color="#0E7C4A" />
      </View>
    </Pressable>
  );
}

function ShiftStat({ value, label }: { value: string; label: string }) {
  return (
    <View className="flex-1 items-center px-1">
      <Text className="text-[17px] font-bold text-primary" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text className="font-sans mt-1 text-center text-[11px] text-text-secondary" numberOfLines={1}>{label}</Text>
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
              <Text className="font-sans ml-2.5 flex-1 text-[14.5px] text-ink">{pickupAddress}</Text>
            </View>
            <View className="flex-row items-start">
              <Ionicons name="location" size={14} color="#F97316" style={{ marginTop: 2 }} />
              <Text className="font-sans ml-2 flex-1 text-[14.5px] text-ink">{destinationAddress}</Text>
            </View>
          </View>

          <View className="mt-4 flex-row items-center justify-between rounded-xl bg-gray-light px-4 py-3">
            <Text className="font-sans text-sm text-text-secondary">{distanceKm ? `${distanceKm.toFixed(1)} km` : ''}</Text>
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
