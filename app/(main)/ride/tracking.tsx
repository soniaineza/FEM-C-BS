import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '../../../components/Button';
import { MapSheet } from '../../../components/map/MapSheet';
import { clockIn } from '../../../components/FareBreakdownView';
import { useTranslation } from '../../../hooks/useTranslation';
import { useRideTracking } from '../../../hooks/useRideTracking';
import { useMapScene } from '../../../hooks/useMapScene';
import { useTripMap } from '../../../hooks/useTripMap';
import { getPaymentForRide, confirmCashPayment, initiatePayment, refreshPaymentStatus } from '../../../services/payment-service';
import { PaymentRecord, isPaymentSettled } from '../../../types/payment';
import { formatFare } from '../../../types/ride';

const PADDING = { top: 90, bottom: 300, left: 50, right: 50 };

export default function TrackingScreen() {
  const { t } = useTranslation();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { ride, driverLocation, serverTimeOffsetMs } = useRideTracking(rideId ?? null);
  const { scene, etaMinutes } = useTripMap(ride, driverLocation, serverTimeOffsetMs, PADDING);
  useMapScene(scene);

  const [payment, setPayment] = useState<PaymentRecord | null>(null);
  const [payLoading, setPayLoading] = useState(false);

  useEffect(() => {
    if (ride && ride.status === 'completed') {
      router.replace({ pathname: '/(main)/ride/completed', params: { rideId: ride.id } });
    }
  }, [ride]);

  useEffect(() => {
    if (!ride || (ride.status !== 'paymentPending' && ride.status !== 'arrived')) return;
    getPaymentForRide(ride.id).then((p) => {
      if (p) setPayment(p);
      else if (ride.status === 'paymentPending') initiatePayment(ride.id).then(setPayment);
    });
  }, [ride?.status, ride?.id]);

  async function handleConfirmCash() {
    if (!ride) return;
    setPayLoading(true);
    try {
      setPayment(await confirmCashPayment(ride.id));
    } finally {
      setPayLoading(false);
    }
  }

  async function handleRefreshStatus() {
    if (!payment) return;
    setPayLoading(true);
    try {
      setPayment(await refreshPaymentStatus(payment.id));
    } finally {
      setPayLoading(false);
    }
  }

  if (!ride) {
    return (
      <MapSheet collapsible={false}>
        <ActivityIndicator className="my-6" color="#16A34A" />
      </MapSheet>
    );
  }

  const awaitingPayment = ride.status === 'arrived' || ride.status === 'paymentPending';

  return (
    <View style={{ flex: 1 }}>
      <MapSheet
        header={
          <View className="mb-3">
            <Text className="text-xl font-bold text-ink">
              {awaitingPayment ? t('preparePayment') : etaMinutes != null ? t('tripEndsAt', { time: clockIn(etaMinutes) }) : t('tripInProgress')}
            </Text>
            <Text className="mt-0.5 text-[13px] text-text-secondary" numberOfLines={1}>
              {awaitingPayment ? formatFare(ride.finalFare ?? ride.estimatedFare) : `${t('onTheWayToDestination')} · ${ride.destination.address}`}
            </Text>
          </View>
        }
        footer={<Button title={t('safety')} variant="outline" icon="shield-checkmark-outline" onPress={() => router.push({ pathname: '/(main)/ride/safety', params: { rideId: ride.id } })} />}
      >
        {ride.driver ? (
          <View className="flex-row items-center rounded-2xl border border-border p-3">
            <View className="flex-1">
              <Text className="text-[15px] font-bold text-ink">{ride.driver.name}</Text>
              <Text className="text-[13px] text-text-secondary">{ride.driver.vehicleColor} {ride.driver.vehicleModel}</Text>
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
                <Text className="mt-2 text-primary">{t('depositReceived')}</Text>
              ) : payment.method === 'cash' ? (
                <View className="mt-3">
                  <Button title={t('confirmCashPayment')} onPress={handleConfirmCash} loading={payLoading} />
                </View>
              ) : (
                <View className="mt-3">
                  <Text className="text-sm text-text-secondary">{t('paymentPendingNotice')}</Text>
                  <View className="mt-3">
                    <Button title={t('checkPaymentStatus')} variant="outline" onPress={handleRefreshStatus} loading={payLoading} />
                  </View>
                </View>
              )
            ) : (
              <ActivityIndicator className="mt-3" color="#16A34A" />
            )}
          </View>
        ) : null}
      </MapSheet>
    </View>
  );
}
