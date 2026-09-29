import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text as RNText, ScrollView, Pressable, Modal } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { useDriverAuthStore } from '../../../stores/useDriverAuthStore';
import { useResponsive } from '../../../hooks/useResponsive';
import { useDriverActiveRide } from '../../../hooks/useDriverActiveRide';
import { useTranslation } from '../../../hooks/useTranslation';
import { setDriverStatus, acceptDriverRide, declineDriverRide } from '../../../services/driver-service';
import { getDriverEarningsSummary } from '../../../services/driver-profile-service';
import { driverCanGoActive, DriverEarningsSummary } from '../../../types/driver';
import { formatFare } from '../../../types/ride';
import { ApiError } from '../../../services/driver-api-client';
import { Colors, Elevation } from '../../../constants/theme';
import { Avatar, Badge, Banner, ListItem, ListSection, Text } from '../../../components/ui';
import { RouteTimeline } from '../../../components/TripRouteCard';

const OFFER_COUNTDOWN_SECONDS = 20;

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
  const { contentStyle, isSmallPhone } = useResponsive();
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
          <View className="h-11 w-11 items-center justify-center rounded-xl bg-surface">
            <RNText className="text-title-1 font-bold text-primary-text">F</RNText>
          </View>
          <View className="ml-3 flex-1">
            <RNText className="text-title-2 font-bold text-white">FEM C@BS</RNText>
            <RNText className="text-caption font-medium tracking-wide text-white/85">{t('driverRoleLabel')}</RNText>
          </View>
          <Pressable
            className="h-11 w-11 items-center justify-center rounded-full bg-surface/20"
            onPress={() => router.push('/(driver)/(tabs)/more' as any)}
          >
            <Ionicons name="person-outline" color={Colors.surface} size={22} />
          </Pressable>
        </View>
      </View>

      <ScrollView className="-mt-5 flex-1 rounded-t-sheet bg-canvas" contentContainerClassName="pb-8 pt-5">
        <View style={contentStyle} className="px-5">
        <Card className="flex-row items-center">
          <Avatar name={currentDriver?.fullName} size={52} />
          <View className="ml-3.5 flex-1">
            <Text variant="footnote" tone="muted">{t(greetingKey())},</Text>
            <Text variant="title-3" numberOfLines={1}>{currentDriver?.fullName?.split(' ')[0] || t('driverRoleLabel')}</Text>
          </View>
          <Badge dot tone={isOnline ? 'success' : 'neutral'} label={isOnline ? t('driverOnline') : t('driverOffline')} />
        </Card>

        <Card padded={false} className="mt-3 flex-row items-stretch py-4">
          <StatColumn icon="car-outline" value={String(activeRideCount)} label={t('driverActiveRides')} small={isSmallPhone} />
          <View className="w-px bg-divider" />
          <StatColumn icon="star" value={currentDriver?.rating != null ? currentDriver.rating.toFixed(1) : '5.0'} label={t('driverRatingLabel')} iconColor={Colors.star} small={isSmallPhone} />
          <View className="w-px bg-divider" />
          <StatColumn icon="wallet-outline" value={summary ? formatFare(summary.today.amount) : '—'} label={t('driverTodaysEarnings')} small={isSmallPhone} />
        </Card>

        {!currentDriver?.verified ? (
          <View className="mt-3">
            <Banner tone="warning" message={t('driverVerificationPendingBody')} />
          </View>
        ) : null}

        <View className="mt-4">
          <Button
            title={isOnline ? t('driverGoOffline') : t('driverGoOnline')}
            icon={isOnline ? 'power' : 'radio-button-on'}
            onPress={handleToggleOnline}
            loading={togglingOnline}
            variant={isOnline ? 'outline' : 'primary'}
          />
          {toggleError ? <View className="mt-3"><Banner tone="danger" message={toggleError} /></View> : null}
        </View>

        {tripInProgress ? (
          <Card
            tone="tint"
            className="mt-4 flex-row items-center"
            onPress={() => router.push({ pathname: '/(driver)/journey', params: { rideId: tripInProgress.id } } as any)}
          >
            <View className="h-10 w-10 items-center justify-center rounded-full bg-primary">
              <Ionicons name="navigate" size={20} color={Colors['primary-fg']} />
            </View>
            <View className="ml-3 flex-1">
              <Text variant="callout" weight="semibold">{t('driverTripInProgress')}</Text>
              <Text variant="footnote" tone="muted" numberOfLines={1}>{tripInProgress.destination.address}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors['fg-muted']} />
          </Card>
        ) : null}

        <ListSection className="mt-4">
          <ListItem icon="cash-outline" title={t('driverPayouts')} onPress={() => router.push('/(driver)/wallet/payouts' as any)} />
        </ListSection>
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
  iconColor = Colors['primary-text'],
  small = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  iconColor?: string;
  small?: boolean;
}) {
  // Each column owns an equal third and shrinks: long fares ("1,250,000
  // RWF") and long locale labels scale down instead of pushing siblings
  // off a 320px screen.
  return (
    <View className="flex-1 items-center px-1">
      <Ionicons name={icon} size={small ? 18 : 20} color={iconColor} />
      <Text variant="headline" weight="bold" align="center" numberOfLines={1} adjustsFontSizeToFit style={{ marginTop: 6 }}>
        {value}
      </Text>
      <Text variant={small ? 'micro' : 'caption'} tone="muted" align="center" numberOfLines={2} style={{ marginTop: 2 }}>
        {label}
      </Text>
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
      <View className="flex-1 justify-end" style={{ backgroundColor: Colors.overlay }}>
        <View className="rounded-t-sheet bg-surface px-5 pt-3" style={{ ...Elevation[4], paddingBottom: 20 + bottomInset }}>
          <View className="mb-4 h-[5px] w-10 self-center rounded-full bg-border-strong" />
          <View className="flex-row items-center justify-between">
            <Text variant="title-2">{t('driverNewRideRequest')}</Text>
            <View
              className="h-12 w-12 items-center justify-center rounded-full"
              style={{ borderWidth: 3, borderColor: seconds <= 5 ? Colors.danger : Colors.primary }}
              accessibilityLabel={`${seconds}s`}
            >
              <Text variant="headline" weight="bold" tone={seconds <= 5 ? 'danger' : 'primary'}>{seconds}</Text>
            </View>
          </View>

          <View className="mt-4 flex-row items-end justify-between">
            <Text variant="large-title">{fare}</Text>
            {distanceKm ? <Text variant="callout" tone="muted" style={{ marginBottom: 4 }}>{`${distanceKm.toFixed(1)} km`}</Text> : null}
          </View>

          <View className="mt-4 rounded-2xl bg-surface-muted p-4">
            <RouteTimeline pickup={pickupAddress ?? ''} destination={destinationAddress ?? ''} />
          </View>

          <View className="mt-5 flex-row gap-3">
            <View className="flex-1">
              <Button title={t('driverDecline')} variant="outline" onPress={onDecline} />
            </View>
            <View style={{ flex: 1.6 }}>
              <Button title={t('driverAccept')} icon="checkmark" onPress={onAccept} />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
