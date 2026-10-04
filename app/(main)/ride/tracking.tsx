import { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, BackHandler } from 'react-native';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';

import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { MapSheet } from '../../../components/map/MapSheet';
import { clockIn } from '../../../components/FareBreakdownView';
import { useTranslation } from '../../../hooks/useTranslation';
import { useRideTracking } from '../../../hooks/useRideTracking';
import { useMapScene } from '../../../hooks/useMapScene';
import { useTripMap } from '../../../hooks/useTripMap';
import { getPaymentForRide, initiatePayment, refreshPaymentStatus } from '../../../services/payment-service';
import { PaymentRecord, isPaymentSettled } from '../../../types/payment';
import { formatFare } from '../../../types/ride';
import { Colors } from '../../../constants/theme';

const PADDING = { top: 90, bottom: 300, left: 50, right: 50 };

export default function TrackingScreen() {
  const { t } = useTranslation();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { ride, driverLocation, serverTimeOffsetMs } = useRideTracking(rideId ?? null);
  const { scene, etaMinutes } = useTripMap(ride, driverLocation, serverTimeOffsetMs, PADDING);
  useMapScene(scene);

  const [payment, setPayment] = useState<PaymentRecord | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // A rider mid-trip cannot go back: Android back and the iOS swipe are
  // blocked while a trip is live. Only "back" is blocked: replaces and resets
  // (trip completed, signed out) always go through, and a ride that has not
  // loaded or has ended is never locked.
  const navigation = useNavigation();
  const locked = ride != null && ride.status !== 'completed' && ride.status !== 'cancelled';
  const lockedRef = useRef(false);
  lockedRef.current = locked;
  useEffect(() => {
    const removeGuard = navigation.addListener('beforeRemove', (e) => {
      const type = e.data.action.type;
      if (lockedRef.current && (type === 'GO_BACK' || type === 'POP' || type === 'POP_TO_TOP')) e.preventDefault();
    });
    // Android hardware back, explicitly (a no-op on web).
    const backSub = BackHandler.addEventListener('hardwareBackPress', () => lockedRef.current);
    return () => {
      removeGuard();
      backSub.remove();
    };
  }, [navigation]);
  // The iOS swipe is off only while locked, so a ride that fails to load can
  // still be swiped away.
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !locked });
  }, [navigation, locked]);

  useEffect(() => {
    if (!ride) return;
    if (ride.status === 'completed') {
      router.replace({ pathname: '/(main)/ride/completed', params: { rideId: ride.id } });
    } else if (ride.status === 'cancelled') {
      // Nothing left to track, and this screen has no back button.
      router.replace('/(main)/(tabs)');
    }
  }, [ride]);

  // Look up any payment already started (e.g. after an app restart); the
  // rider starts a new one explicitly with the pay buttons below.
  useEffect(() => {
    if (!ride || (ride.status !== 'paymentPending' && ride.status !== 'arrived')) return;
    getPaymentForRide(ride.id).then((p) => p && setPayment(p)).catch(() => {});
  }, [ride?.status, ride?.id]);

  async function handlePay() {
    if (!ride) return;
    setPayLoading(true);
    setPaymentError(null);
    try {
      setPayment(await initiatePayment(ride.id));
    } catch {
      setPaymentError(t('paymentPendingNotice'));
    } finally {
      setPayLoading(false);
    }
  }

  async function handleRefreshStatus() {
    if (!payment) return;
    setPayLoading(true);
    try {
      setPayment(await refreshPaymentStatus(payment.id));
      setPaymentError(null);
    } catch {
      setPaymentError(t('paymentPendingNotice'));
    } finally {
      setPayLoading(false);
    }
  }

  async function handleCashFallback() {
    if (!ride) return;
    setPayLoading(true);
    try {
      setPayment(await initiatePayment(ride.id, 'cash'));
      setPaymentError(null);
    } catch {
      setPaymentError(t('cashFallbackUnavailable'));
    } finally {
      setPayLoading(false);
    }
  }

  if (!ride) {
    // Still loading, or the ride could not be loaded: leave a way out.
    return (
      <MapSheet
        collapsible={false}
        footer={<Button title={t('back')} variant="outline" icon="arrow-back" onPress={() => router.replace('/(main)/(tabs)')} />}
      >
        <ActivityIndicator className="my-6" color={Colors.primary} />
      </MapSheet>
    );
  }

  const awaitingPayment = ride.status === 'arrived' || ride.status === 'paymentPending';

  return (
    <View style={{ flex: 1 }}>
      <MapSheet
        header={
          <View className="mb-3">
            <Text className="text-title-2 font-bold text-fg">
              {awaitingPayment ? t('preparePayment') : etaMinutes != null ? t('tripEndsAt', { time: clockIn(etaMinutes) }) : t('tripInProgress')}
            </Text>
            <Text className="mt-0.5 text-footnote text-fg-muted" numberOfLines={1}>
              {awaitingPayment ? formatFare(ride.finalFare ?? ride.estimatedFare) : `${t('onTheWayToDestination')} · ${ride.destination.address}`}
            </Text>
          </View>
        }
        footer={<Button title={t('safety')} variant="outline" icon="shield-checkmark-outline" onPress={() => router.push({ pathname: '/(main)/ride/safety', params: { rideId: ride.id } })} />}
      >
        {!driverLocation && !awaitingPayment ? <Text className="mb-3 text-subhead text-danger">{t('driverLocationUnavailable')}</Text> : null}
        {ride.driver ? (
          <Card padded={false} className="flex-row items-center p-3">
            <View className="flex-1">
              <Text className="text-callout font-bold text-fg">{ride.driver.name}</Text>
              <Text className="text-footnote text-fg-muted">{ride.driver.vehicleColor} {ride.driver.vehicleModel}</Text>
            </View>
            <View className="rounded-lg border-2 border-ink px-2 py-0.5">
              <Text className="text-caption font-bold tracking-wider text-fg">{ride.driver.licensePlate}</Text>
            </View>
          </Card>
        ) : null}

        {awaitingPayment ? (
          <Card className="mt-3">
            <Text className="text-body font-semibold text-fg">{t('preparePayment')}</Text>
            {payment && isPaymentSettled(payment.status) ? (
              <Text className="mt-2 text-primary-text">{t('depositReceived')}</Text>
            ) : payment && payment.method === 'cash' ? (
              <Text className="mt-2 text-subhead text-fg-muted">{t('cashAwaitingDriver')}</Text>
            ) : payment && payment.status !== 'failed' ? (
              <View className="mt-3">
                <Text className="text-subhead text-fg-muted">{t('paymentPendingNotice')}</Text>
                <View className="mt-3">
                  <Button title={t('checkPaymentStatus')} variant="outline" onPress={handleRefreshStatus} loading={payLoading} />
                </View>
              </View>
            ) : (
              <View className="mt-3 gap-2.5">
                {payment?.status === 'failed' ? <Text className="text-subhead text-danger">{t('paymentPendingNotice')}</Text> : null}
                <Button
                  title={t('payAmount', { amount: formatFare(ride.finalFare ?? ride.estimatedFare) })}
                  icon="card-outline"
                  onPress={handlePay}
                  loading={payLoading}
                />
                <Button title={t('payCashInstead')} icon="cash-outline" variant="outline" onPress={handleCashFallback} disabled={payLoading} />
              </View>
            )}
            {paymentError ? <Text className="mt-2 text-danger">{paymentError}</Text> : null}
          </Card>
        ) : null}
      </MapSheet>
    </View>
  );
}
