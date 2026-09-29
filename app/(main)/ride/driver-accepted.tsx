import { useEffect } from 'react';
import { View, Text, Pressable, Linking, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { MapSheet } from '../../../components/map/MapSheet';
import { useTranslation } from '../../../hooks/useTranslation';
import { useRideTracking } from '../../../hooks/useRideTracking';
import { usePassengerLocationReporting } from '../../../hooks/usePassengerLocationReporting';
import { useMapScene } from '../../../hooks/useMapScene';
import { useTripMap } from '../../../hooks/useTripMap';
import { cancelRide } from '../../../services/ride-service';
import { Colors, Elevation } from '../../../constants/theme';

const PADDING = { top: 90, bottom: 380, left: 50, right: 50 };

export default function DriverAcceptedScreen() {
  const { t } = useTranslation();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { ride, driverLocation, serverTimeOffsetMs } = useRideTracking(rideId ?? null);
  usePassengerLocationReporting(!!ride);
  const { scene, etaMinutes } = useTripMap(ride, driverLocation, serverTimeOffsetMs, PADDING);
  useMapScene(scene);

  useEffect(() => {
    if (ride && (ride.status === 'pinVerified' || ride.status === 'inProgress' || ride.status === 'arrived' || ride.status === 'paymentPending')) {
      router.replace({ pathname: '/(main)/ride/tracking', params: { rideId: ride.id } });
    }
    if (ride && ride.status === 'cancelled') {
      router.replace('/(main)/(tabs)');
    }
  }, [ride]);

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

  return (
    <View style={{ flex: 1 }}>
      {/* Back returns home without cancelling: the driver is already on
          their way, and the ride stays resumable from Activity > Active. */}
      <SafeAreaView edges={['top']} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('back')}
          onPress={() => router.replace('/(main)/(tabs)')}
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
              <Button title={t('cancelRide')} variant="text" onPress={async () => { await cancelRide(ride.id); router.replace('/(main)/(tabs)'); }} />
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

        <View className="mt-3 flex-row gap-3">
          <Pressable
            accessibilityRole="button"
            className="flex-1 flex-row items-center justify-center rounded-xl bg-surface-muted py-3"
            onPress={() => Linking.openURL(`tel:${driver.phone}`)}
          >
            <Ionicons name="call" size={18} color={Colors.fg} />
            <Text className="ml-2 font-semibold text-fg">{t('call')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            className="flex-1 flex-row items-center justify-center rounded-xl bg-surface-muted py-3"
            onPress={() => Linking.openURL(`sms:${driver.phone}`)}
          >
            <Ionicons name="chatbubble" size={18} color={Colors.fg} />
            <Text className="ml-2 font-semibold text-fg">{t('message')}</Text>
          </Pressable>
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
