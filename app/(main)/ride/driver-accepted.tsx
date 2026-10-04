import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Linking, ActivityIndicator, BackHandler } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '../../../components/Button';
import { SlideToConfirm } from '../../../components/ui/SlideToConfirm';
import { Card } from '../../../components/Card';
import { MapSheet } from '../../../components/map/MapSheet';
import { MapGestureLayer } from '../../../components/map/MapGestureLayer';
import { goHome } from '../../../utils/navigation';
import { useTranslation } from '../../../hooks/useTranslation';
import { useRideTracking } from '../../../hooks/useRideTracking';
import { usePassengerLocationReporting } from '../../../hooks/usePassengerLocationReporting';
import { useMapScene } from '../../../hooks/useMapScene';
import { useTripMap } from '../../../hooks/useTripMap';
import { cancelRide } from '../../../services/ride-service';
import { Colors, Elevation } from '../../../constants/theme';

const PADDING = { top: 90, bottom: 380, left: 50, right: 50 };

// Rides the rider has already accepted this session. Once the trip itself has
// begun (PIN verified or later) the offer no longer applies, so a restored or
// resumed ride goes straight to the live view.
const acceptedRides = new Set<string>();

export default function DriverAcceptedScreen() {
  const { t } = useTranslation();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { ride, driverLocation, serverTimeOffsetMs } = useRideTracking(rideId ?? null);
  usePassengerLocationReporting(!!ride);
  const { scene, etaMinutes } = useTripMap(ride, driverLocation, serverTimeOffsetMs, PADDING);
  useMapScene(scene);
  const [accepted, setAccepted] = useState(() => !!rideId && acceptedRides.has(rideId));
  const acceptanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setAccepted(acceptedRides.has(rideId ?? ''));
    return () => { if (acceptanceTimer.current) clearTimeout(acceptanceTimer.current); };
  }, [rideId]);

  useEffect(() => {
    if (ride && (ride.status === 'pinVerified' || ride.status === 'inProgress' || ride.status === 'arrived' || ride.status === 'paymentPending')) {
      router.replace({ pathname: '/(main)/ride/tracking', params: { rideId: ride.id } });
    }
    if (ride && ride.status === 'cancelled') {
      goHome();
    }
  }, [ride]);

  // Android back leaves for Home like the arrow does; the ride carries on and
  // is reopened from Home's banner.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        goHome();
        return true;
      });
      return () => sub.remove();
    }, [])
  );

  if (!ride || !ride.driver) {
    return (
      <MapSheet collapsible={false}>
        <View className="flex-row items-center py-4">
          <ActivityIndicator color={Colors.primary} />
          <Text className="ml-3 text-fg-muted">{t('waitingDriver')}</Text>
        </View>
      </MapSheet>
    );
  }

  const driver = ride.driver;
  const arrived = ride.status === 'driverArrived';
  const initials = driver.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const vehicleSummary = [driver.vehicleColor, driver.vehicleModel].filter(Boolean).join(' ');

  const contactActions = (
<View className="mt-3 w-full flex-row gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('call')}
            className="flex-1 flex-row items-center justify-center rounded-xl bg-surface-muted py-3"
            onPress={() => Linking.openURL(`tel:${driver.phone}`)}
          >
            <Ionicons name="call" size={18} color={Colors.fg} />
            <Text className="ml-2 font-semibold text-fg">{t('call')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button" accessibilityLabel={t('message')}
            className="flex-1 flex-row items-center justify-center rounded-xl bg-surface-muted py-3"
            onPress={() => Linking.openURL(`sms:${driver.phone}`)}
          >
            <Ionicons name="chatbubble" size={18} color={Colors.fg} />
            <Text className="ml-2 font-semibold text-fg">{t('message')}</Text>
          </Pressable>
        </View>
  );

  const offerPending = !accepted && (ride.status === 'driverAssigned' || ride.status === 'driverArriving');
  if (offerPending) {
    return (
      <View style={{ flex: 1 }}>
        <MapGestureLayer />
        <MapSheet
          collapsible
          expandLabel={t('driverFoundTitle')}
          collapseLabel={t('showMap')}
          header={
            <View className="mb-3 items-center">
              <Text className="text-title-2 font-bold text-fg">{t('driverFoundTitle')}</Text>
              <Text className="mt-0.5 text-footnote text-fg-muted" numberOfLines={1}>
                {etaMinutes != null ? t('driverArrivingIn', { minutes: etaMinutes }) : t('driverOnWay')}
              </Text>
            </View>
          }
          footer={
            <View className="gap-2">
              <SlideToConfirm
                label={t('slideToAccept')}
                confirmedLabel={t('rideAccepted')}
                onConfirm={() => {
                  acceptedRides.add(ride.id);
                  if (acceptedRides.size > 20) acceptedRides.delete(acceptedRides.values().next().value!);
                  // Let the success state land before the offer gives way to the live view.
                  acceptanceTimer.current = setTimeout(() => setAccepted(true), 650);
                }}
              />
              <Button title={t('safety')} variant="outline" icon="shield-checkmark-outline" onPress={() => router.push({ pathname: '/(main)/ride/safety', params: { rideId: ride.id } })} />
              <Button
                title={t('declineDriver')}
                variant="text"
                onPress={async () => {
                  try { await cancelRide(ride.id); } catch { /* still live: Home shows it in the banner */ } finally { goHome(); }
                }}
              />
            </View>
          }
        >
          <Card className="items-center py-5">
            <View className="h-20 w-20 items-center justify-center rounded-full bg-ink">
              <Text className="text-title-1 font-bold text-white">{initials}</Text>
            </View>
            <Text className="mt-3 text-title-3 font-bold text-fg">{driver.name}</Text>
            <View className="mt-1 flex-row items-center">
              <Ionicons name="star" size={14} color={Colors.fg} />
              <Text className="ml-1 text-subhead text-fg-muted">
                {driver.rating > 0 ? driver.rating.toFixed(1) : t('driverNoRatingYet')}
              </Text>
            </View>
            {vehicleSummary ? <Text className="mt-2 text-callout text-fg">{vehicleSummary}</Text> : null}
            {driver.licensePlate ? (
              <View className="mt-2 rounded-lg border-2 border-ink bg-surface px-3 py-1">
                <Text className="text-footnote font-bold tracking-wider text-fg">{driver.licensePlate}</Text>
              </View>
            ) : null}
            {contactActions}
          </Card>
        </MapSheet>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <MapGestureLayer />
      {/* Back returns home without cancelling: the driver is already on
          their way, and the ride is reopened from Home's banner. */}
      <SafeAreaView edges={['top']} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('back')}
          onPress={goHome}
          className="ml-4 mt-2 h-11 w-11 items-center justify-center rounded-full bg-surface"
          style={Elevation[3]}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.fg} />
        </Pressable>
      </SafeAreaView>
      <MapSheet
        header={
          <View className="mb-3">
            <Text className="text-title-2 font-bold text-fg">
              {arrived ? t('driverHere') : etaMinutes != null ? t('driverArrivingIn', { minutes: etaMinutes }) : t('driverOnWay')}
            </Text>
            <Text className="mt-0.5 text-footnote text-fg-muted" numberOfLines={1}>{ride.pickup.address}</Text>
          </View>
        }
        footer={
          <View className="gap-2">
            <Button title={t('safety')} variant="outline" icon="shield-checkmark-outline" onPress={() => router.push({ pathname: '/(main)/ride/safety', params: { rideId: ride.id } })} />
            {ride.status === 'driverAssigned' ? (
              <Button title={t('cancelRide')} variant="text" onPress={async () => { try { await cancelRide(ride.id); } catch { /* still live: Home shows it in the banner */ } goHome(); }} />
            ) : null}
          </View>
        }
      >
        {!driverLocation ? <Text className="mb-3 text-subhead text-danger">{t('driverLocationUnavailable')}</Text> : null}
        <Card padded={false} className="flex-row items-center p-3.5">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-ink">
            <Text className="text-body font-bold text-white">{initials}</Text>
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-body font-bold text-fg">{driver.name}</Text>
            <View className="mt-0.5 flex-row items-center">
              <Ionicons name="star" size={13} color={Colors.fg} />
              <Text className="ml-1 text-footnote text-fg-muted">
                {driver.rating > 0 ? driver.rating.toFixed(1) : t('driverNoRatingYet')}
                {vehicleSummary ? ` · ${vehicleSummary}` : ''}
              </Text>
            </View>
          </View>
          {driver.licensePlate ? (
            <View className="rounded-lg border-2 border-ink bg-surface px-2.5 py-1">
              <Text className="text-footnote font-bold tracking-wider text-fg">{driver.licensePlate}</Text>
            </View>
          ) : null}
        </Card>

        {contactActions}

        <View className="mt-3">
          <Button
            title={t('scanDriverCode')}
            variant="outline"
            icon="qr-code-outline"
            onPress={() => router.push({ pathname: '/(main)/ride/scan-pair', params: { rideId: ride.id } } as any)}
          />
        </View>

        {ride.pin ? (
          <Card tone="tint" padded={false} className="mt-3 flex-row items-center justify-between px-4 py-3">
            <View className="flex-1 pr-3">
              <Text className="text-footnote font-semibold text-fg">{t('shareYourPin')}</Text>
              <Text className="mt-0.5 text-caption text-fg-muted">{t('pinHint')}</Text>
            </View>
            <Text className="text-title-1 font-bold tracking-[6px] text-fg">{ride.pin}</Text>
          </Card>
        ) : null}
      </MapSheet>
    </View>
  );
}
