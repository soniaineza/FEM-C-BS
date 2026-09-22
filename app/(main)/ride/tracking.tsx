import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaViewPlaceholder } from '../../../components/SafeAreaViewPlaceholder';
import { router, useLocalSearchParams } from 'expo-router';

import { Button } from '../../../components/Button';
import { RideMap } from '../../../components/RideMap';
import { FEMMapCard } from '../../../components/FEMMapCard';
import { useTranslation } from '../../../hooks/useTranslation';
import { useRideTracking } from '../../../hooks/useRideTracking';
import { getPaymentForRide, confirmCashPayment, initiatePayment, refreshPaymentStatus } from '../../../services/payment-service';
import { PaymentRecord, isPaymentSettled } from '../../../types/payment';
import { MapDefaults, getRoute } from '../../../services/location-service';
import { RoutePoint } from '../../../types/ride';

export default function TrackingScreen() {
  const { t } = useTranslation();
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const { ride, driverLocation } = useRideTracking(rideId ?? null);

  const [payment, setPayment] = useState<PaymentRecord | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [recenterToken, setRecenterToken] = useState(0);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);

  // Draw the planned itinerary (pickup → destination) so the map shows where
  // the ride is going even before the driver is on-screen.
  useEffect(() => {
    if (!ride) return;
    getRoute({ from: ride.pickup, to: ride.destination }).then((route) => {
      setRoutePoints(route?.points ?? []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride?.id]);

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
      <SafeAreaViewPlaceholder className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color="#16A34A" />
      </SafeAreaViewPlaceholder>
    );
  }

  const center = driverLocation ?? { latitude: ride.destination.latitude ?? MapDefaults.latitude, longitude: ride.destination.longitude ?? MapDefaults.longitude };
  const markers = [
    { id: 'dest', position: { latitude: ride.destination.latitude!, longitude: ride.destination.longitude! }, icon: 'destination' as const },
    { id: 'pickup', position: { latitude: ride.pickup.latitude!, longitude: ride.pickup.longitude! }, icon: 'pickup' as const },
    ...(driverLocation ? [{ id: 'driver', position: { latitude: driverLocation.latitude, longitude: driverLocation.longitude }, icon: 'driver' as const }] : []),
  ];

  const awaitingPayment = ride.status === 'arrived' || ride.status === 'paymentPending';

  return (
    <SafeAreaViewPlaceholder className="flex-1 bg-white">
      <FEMMapCard
        height={200}
        className="mx-4 mt-3"
        onRecenter={() => setRecenterToken((n) => n + 1)}
        recenterLabel={t('recenterMap')}
      >
        <RideMap
          center={center}
          markers={markers}
          routePolyline={routePoints}
          recenterToken={recenterToken}
          retryLabel={t('tryAgain')}
          loadingLabel={t('mapLoading')}
          errorLabel={t('mapError')}
        />
      </FEMMapCard>
      <View className="flex-1 px-6 pt-6">
        <Text className="text-lg font-bold text-ink">{t('tripInProgress')}</Text>
        <Text className="mt-1 text-text-secondary">{ride.destination.address}</Text>

        {awaitingPayment ? (
          <View className="mt-6 rounded border border-border p-4">
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

        <View className="mt-auto pb-8">
          <Button title={t('safety')} variant="outline" onPress={() => router.push({ pathname: '/(main)/ride/safety', params: { rideId: ride.id } })} />
        </View>
      </View>
    </SafeAreaViewPlaceholder>
  );
}
