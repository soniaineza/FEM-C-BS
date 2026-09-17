import { useEffect, useState } from 'react';
import { View, Text, SafeAreaView, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '../../../components/Button';
import { RideMap } from '../../../components/RideMap';
import { useTranslation } from '../../../hooks/useTranslation';
import { useRideTracking } from '../../../hooks/useRideTracking';
import { getPaymentForRide, confirmCashPayment, initiatePayment, refreshPaymentStatus } from '../../../services/payment-service';
import { PaymentRecord, isPaymentSettled } from '../../../types/payment';
import { MapDefaults } from '../../../services/location-service';

export default function TrackingScreen() {
  const { t } = useTranslation();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { ride, driverLocation } = useRideTracking(rideId ?? null);

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
      <SafeAreaView className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#16A34A" />
      </SafeAreaView>
    );
  }

  const center = driverLocation ?? { latitude: ride.destination.latitude ?? MapDefaults.latitude, longitude: ride.destination.longitude ?? MapDefaults.longitude };
  const markers = [
    { id: 'dest', position: { latitude: ride.destination.latitude!, longitude: ride.destination.longitude! }, icon: 'destination' as const },
    ...(driverLocation ? [{ id: 'driver', position: { latitude: driverLocation.latitude, longitude: driverLocation.longitude }, icon: 'driver' as const }] : []),
  ];

  const awaitingPayment = ride.status === 'arrived' || ride.status === 'paymentPending';

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="h-64 w-full">
        <RideMap center={center} markers={markers} />
      </View>
      <View className="flex-1 px-6 pt-6">
        <Text className="text-lg font-bold text-ink">{t('tripInProgress')}</Text>
        <Text className="mt-1 text-text-secondary">{ride.destination.address}</Text>

        {awaitingPayment ? (
          <View className="mt-6 rounded border border-border p-4">
            <Text className="text-base font-semibold text-ink">{t('preparePayment')}</Text>
            {payment ? (
              isPaymentSettled(payment.status) ? (
                <Text className="mt-2 text-primary">Payment received.</Text>
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

        <View className="mt-auto pb-8">
          <Button title={t('safety')} variant="outline" onPress={() => router.push({ pathname: '/(main)/ride/safety', params: { rideId: ride.id } })} />
        </View>
      </View>
    </SafeAreaView>
  );
}
