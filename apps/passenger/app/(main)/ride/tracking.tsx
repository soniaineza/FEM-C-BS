import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '@kimu/shared/components/Button';
import { LiveMap } from '@kimu/shared/components/map/LiveMap';
import { MapSheet } from '../../../components/map/MapSheet';
import { clockIn } from '../../../components/FareBreakdownView';
import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import { useRideTracking } from '../../../hooks/useRideTracking';
import { useTripMap } from '../../../hooks/useTripMap';
import { getPaymentForRide, initiatePayment, refreshPaymentStatus, retryPayment } from '../../../services/payment-service';
import { PaymentRecord, isPaymentSettled, isPaymentUnpaidFinal } from '@kimu/shared/types/payment';
import { formatFare } from '@kimu/shared/types/ride';

const PADDING = { top: 90, bottom: 300, left: 50, right: 50 };

export default function TrackingScreen() {
  const { t } = useTranslation();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { ride, driverLocation, serverTimeOffsetMs } = useRideTracking(rideId ?? null);
  const { scene, etaMinutes } = useTripMap(ride, driverLocation, serverTimeOffsetMs, PADDING);
  // The map is rendered inside this screen (not the shared canvas behind the
  // navigator) so the rider can actually pan and zoom it to see where the
  // driver is; the camera follows the car again shortly after they let go.

  const [payment, setPayment] = useState<PaymentRecord | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  useEffect(() => {
    if (ride && ride.status === 'completed') {
      router.replace({ pathname: '/(main)/ride/completed', params: { rideId: ride.id } });
    }
  }, [ride]);

  useEffect(() => {
    if (!ride || (ride.status !== 'paymentPending' && ride.status !== 'arrived')) return;
    // The driver collects the fare — they send the mobile-money prompt to the
    // rider's number or confirm cash — so the rider just watches the payment
    // appear and settle, never creating it here.
    getPaymentForRide(ride.id).then((p) => { if (p) setPayment(p); }).catch(() => {});
  }, [ride?.status, ride?.id]);

  // While a mobile-money request is waiting on the rider's phone, follow it
  // so an approval, a decline or an expiry shows up without a manual check.
  // Poll while the fare is being collected and not yet settled: this picks up
  // the payment the moment the driver sends the prompt, then its settlement.
  const awaitingUnsettled = !!ride && (ride.status === 'paymentPending' || ride.status === 'arrived') && !(payment && isPaymentSettled(payment.status));
  useEffect(() => {
    if (!awaitingUnsettled || !ride) return;
    const timer = setInterval(() => {
      getPaymentForRide(ride.id).then((p) => { if (p) setPayment(p); }).catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [awaitingUnsettled, ride?.id]);

  async function handleRetry() {
    if (!ride) return;
    setPayLoading(true);
    try {
      setPayment(await retryPayment(ride.id));
      setPaymentError(null);
    } catch {
      setPaymentError(t('requestFailed'));
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
    return (
      <MapSheet collapsible={false}>
        <ActivityIndicator className="my-6" color="#0E7C4A" />
      </MapSheet>
    );
  }

  const awaitingPayment = ride.status === 'arrived' || ride.status === 'paymentPending';

  return (
    <View style={{ flex: 1 }}>
      <View style={StyleSheet.absoluteFill}>
        {scene && scene.camera ? (
          <LiveMap scene={{ ...scene, camera: scene.camera, interactive: true }} loadingLabel={t('mapLoading')} errorLabel={t('mapError')} retryLabel={t('tryAgain')} />
        ) : null}
      </View>
      <MapSheet
        header={
          <View className="mb-3">
            <Text className="text-xl font-bold text-ink">
              {awaitingPayment ? t('preparePayment') : etaMinutes != null ? t('tripEndsAt', { time: clockIn(etaMinutes) }) : t('tripInProgress')}
            </Text>
            <Text className="font-sans mt-0.5 text-[13px] text-text-secondary" numberOfLines={1}>
              {awaitingPayment ? formatFare(ride.finalFare ?? ride.estimatedFare) : `${t('onTheWayToDestination')} · ${ride.destination.address}`}
            </Text>
          </View>
        }
        footer={<Button title={t('safety')} variant="outline" icon="shield-checkmark-outline" onPress={() => router.push({ pathname: '/(main)/ride/safety', params: { rideId: ride.id } })} />}
      >
        {!driverLocation && !awaitingPayment ? <Text className="font-sans mb-3 text-sm text-error">{t('driverLocationUnavailable')}</Text> : null}
        {ride.driver ? (
          <View className="flex-row items-center rounded-2xl border border-border p-3">
            <View className="flex-1">
              <Text className="text-[15px] font-bold text-ink">{ride.driver.name}</Text>
              <Text className="font-sans text-[13px] text-text-secondary">{ride.driver.vehicleColor} {ride.driver.vehicleModel}</Text>
            </View>
            <View className="rounded-lg border-2 border-ink px-2 py-0.5">
              <Text className="text-xs font-bold tracking-wider text-ink">{ride.driver.licensePlate}</Text>
            </View>
          </View>
        ) : null}

        {awaitingPayment ? (
          <View className="mt-3 rounded-2xl border border-border p-4">
            <Text className="text-base font-semibold text-ink">{t('preparePayment')}</Text>
            {payment ? (
              isPaymentSettled(payment.status) ? (
                <Text className="font-sans mt-2 text-primary">{t('depositReceived')}</Text>
              ) : payment.method === 'cash' ? (
                <View className="mt-3">
                  <Text className="font-sans text-sm text-text-secondary">{t(ride.cashDisputedAt ? 'cashUnderReview' : 'cashAwaitingDriver')}</Text>
                  {ride.cashDisputedAt ? (
                    <View className="mt-3">
                      <Button title={t('backHome')} onPress={() => router.replace('/(main)/(tabs)')} />
                    </View>
                  ) : null}
                </View>
              ) : (
                <View className="mt-3">
                  <Text className={isPaymentUnpaidFinal(payment.status) ? 'text-sm text-error' : 'text-sm text-text-secondary'}>
                    {t(payment.status === 'expired' ? 'paymentExpired' : isPaymentUnpaidFinal(payment.status) ? 'paymentNotCompleted' : 'paymentPendingNotice')}
                  </Text>
                  {isPaymentUnpaidFinal(payment.status) ? (
                    <>
                      <View className="mt-3"><Button title={t('tryPaymentAgain')} onPress={handleRetry} loading={payLoading} /></View>
                      <View className="mt-3"><Button title={t('payCashInstead')} variant="outline" onPress={handleCashFallback} loading={payLoading} /></View>
                    </>
                  ) : (
                    <View className="mt-3">
                      <Button title={t('checkPaymentStatus')} variant="outline" onPress={handleRefreshStatus} loading={payLoading} />
                    </View>
                  )}
                </View>
              )
            ) : (
              <View className="mt-3 flex-row items-center">
                <ActivityIndicator color="#0E7C4A" />
                <Text className="font-sans ml-3 flex-1 text-sm text-text-secondary">{t('waitingForDriverPayment')}</Text>
              </View>
            )}
            {paymentError ? <Text className="font-sans mt-2 text-error">{paymentError}</Text> : null}
          </View>
        ) : null}
      </MapSheet>
    </View>
  );
}
