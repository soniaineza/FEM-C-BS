import { useCallback, useEffect, useState } from 'react';
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
import { RideMap, RideMapMarker } from '../../../components/RideMap';
import { useDriverLocationStore } from '../../../stores/useDriverLocationStore';
import { getCurrentPlace, MapDefaults } from '../../../services/location-service';

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
  const { contentStyle, isSmallPhone, mapHeight } = useResponsive();
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

  const { rides } = useDriverActiveRide(!!currentDriver);

  // Where the driver is: the live fix while online (published by the location
  // reporter), otherwise a one-off position so the map still opens on them.
  const liveFix = useDriverLocationStore((s) => s.fix);
  const [staticFix, setStaticFix] = useState<{ latitude: number; longitude: number } | null>(null);
  const [recenterToken, setRecenterToken] = useState(0);
  useEffect(() => {
    if (liveFix) return;
    let alive = true;
    getCurrentPlace()
      .then((p) => alive && p.latitude != null && p.longitude != null && setStaticFix({ latitude: p.latitude, longitude: p.longitude }))
      .catch(() => {}); // no permission / no GPS: the map opens on the city centre
    return () => {
      alive = false;
    };
  }, [liveFix]);
  const here = liveFix ?? staticFix;

  const [summary, setSummary] = useState<DriverEarningsSummary | null>(null);
  useFocusEffect(
    useCallback(() => {
      refreshDriver().catch(() => {});
      getDriverEarningsSummary().then(setSummary).catch(() => {});
    }, [refreshDriver])
  );

  // Requests stay on screen until the driver answers them. A shared-ride driver can have a trip
  // under way and more riders waiting, so offers and the current trip are tracked separately.
  const offers = rides.filter((r) => r.status === 'driverAssigned');
  const offeredRide = offers[0] ?? null;
  const tripInProgress = rides.find((r) => r.status !== 'driverAssigned') ?? null;
  const activeRideCount = rides.filter((r) => r.status !== 'driverAssigned').length;

  // The driver's car, plus the pickup and drop-off of the current request or trip.
  const primaryRide = tripInProgress ?? offeredRide;
  const mapMarkers: RideMapMarker[] = [];
  if (here) mapMarkers.push({ id: 'me', position: here, icon: 'driver' });
  if (primaryRide?.pickup.latitude != null && primaryRide.pickup.longitude != null) {
    mapMarkers.push({ id: 'pickup', position: { latitude: primaryRide.pickup.latitude, longitude: primaryRide.pickup.longitude }, icon: 'pickup' });
  }
  if (primaryRide?.destination.latitude != null && primaryRide.destination.longitude != null) {
    mapMarkers.push({ id: 'destination', position: { latitude: primaryRide.destination.latitude, longitude: primaryRide.destination.longitude }, icon: 'destination' });
  }

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
      setToggleError(err instanceof Error ? err.message : t('driverStatusUpdateFailed'));
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
            <RNText className="text-title-1 font-bold text-primary-text">K</RNText>
          </View>
          <View className="ml-3 flex-1">
            <RNText className="text-title-2 font-bold text-white">Kimu Transport</RNText>
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
          <StatColumn icon="star" value={currentDriver?.rating != null ? currentDriver.rating.toFixed(1) : '—'} label={t('driverRatingLabel')} iconColor={Colors.star} small={isSmallPhone} />
          <View className="w-px bg-divider" />
          <StatColumn icon="wallet-outline" value={summary ? formatFare(summary.today.amount) : '—'} label={t('driverTodaysEarnings')} small={isSmallPhone} />
        </Card>

        <View className="mt-3 overflow-hidden rounded-card" style={{ height: mapHeight }}>
          <RideMap
            center={here ?? MapDefaults}
            zoom={15}
            recenterToken={recenterToken}
            markers={mapMarkers}
            retryLabel={t('tryAgain')}
            loadingLabel={t('mapLoading')}
            errorLabel={t('mapError')}
          />
          {here ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('useCurrentLocation')}
              onPress={() => setRecenterToken((n) => n + 1)}
              className="absolute bottom-3 left-3 h-11 w-11 items-center justify-center rounded-full bg-surface"
              style={Elevation[2]}
            >
              <Ionicons name="locate" size={20} color={Colors['primary-text']} />
            </Pressable>
          ) : null}
        </View>

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

      {/* Only while Home is on screen: during a trip the journey screen shows a banner instead, so
          a stream of shared requests never blocks the trip controls. */}
      <OfferOverlay
        rideId={isFocused ? offeredRide?.id ?? null : null}
        pickupAddress={offeredRide?.pickup.address}
        destinationAddress={offeredRide?.destination.address}
        fare={offeredRide ? formatFare(offeredRide.estimatedFare) : ''}
        distanceKm={offeredRide?.distanceKm}
        shared={offeredRide?.rideType === 'shared'}
        riderName={offeredRide?.rider?.name}
        createdAt={offeredRide?.createdAt}
        othersWaiting={Math.max(0, offers.length - 1)}
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

// The reference driver app's OfferOverlay: a bottom sheet with Accept/Decline. A request is
// never withdrawn by the app: it stays up for as long as the driver is online, until they accept
// or decline it (a running "waiting" clock shows how long it has been open).
function OfferOverlay({
  rideId,
  pickupAddress,
  destinationAddress,
  fare,
  distanceKm,
  shared,
  riderName,
  createdAt,
  othersWaiting,
  bottomInset,
  onAccept,
  onDecline,
}: {
  rideId: string | null;
  pickupAddress?: string;
  destinationAddress?: string;
  fare: string;
  distanceKm?: number;
  shared?: boolean;
  riderName?: string;
  createdAt?: string;
  othersWaiting: number;
  bottomInset: number;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t } = useTranslation();
  const [waited, setWaited] = useState(0);

  useEffect(() => {
    if (!rideId) {
      setWaited(0);
      return;
    }
    const since = createdAt ? Date.parse(createdAt) : Date.now();
    const tick = () => setWaited(Math.max(0, Math.floor((Date.now() - (Number.isFinite(since) ? since : Date.now())) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [rideId, createdAt]);

  const waitedLabel = `${Math.floor(waited / 60)}:${String(waited % 60).padStart(2, '0')}`;

  return (
    <Modal visible={!!rideId} transparent animationType="slide">
      <View className="flex-1 justify-end" style={{ backgroundColor: Colors.overlay }}>
        <View className="rounded-t-sheet bg-surface px-5 pt-3" style={{ ...Elevation[4], paddingBottom: 20 + bottomInset }}>
          <View className="mb-4 h-[5px] w-10 self-center rounded-full bg-border-strong" />
          <View className="flex-row items-center justify-between">
            <Text variant="title-2">{t('driverNewRideRequest')}</Text>
            <Badge tone={shared ? 'success' : 'neutral'} label={shared ? t('driverSharedRide') : t('driverPrivateRide')} />
          </View>
          <View className="mt-1 flex-row items-center justify-between">
            <Text variant="footnote" tone="muted" numberOfLines={1} style={{ flex: 1 }}>{riderName ?? ''}</Text>
            <Text variant="footnote" tone="muted">{t('driverRequestWaiting', { time: waitedLabel })}</Text>
          </View>

          <View className="mt-4 flex-row items-end justify-between">
            <Text variant="large-title">{fare}</Text>
            {distanceKm ? <Text variant="callout" tone="muted" style={{ marginBottom: 4 }}>{`${distanceKm.toFixed(1)} km`}</Text> : null}
          </View>

          <View className="mt-4 rounded-2xl bg-surface-muted p-4">
            <RouteTimeline pickup={pickupAddress ?? ''} destination={destinationAddress ?? ''} />
          </View>

          {shared ? <Text variant="footnote" tone="muted" style={{ marginTop: 10 }}>{t('driverSharedRideHint')}</Text> : null}
          {othersWaiting > 0 ? (
            <Text variant="footnote" tone="primary" style={{ marginTop: 6 }}>{t('driverMoreRequests', { count: othersWaiting })}</Text>
          ) : null}

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
