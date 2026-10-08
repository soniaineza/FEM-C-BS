import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTranslation } from '@kimu/shared/hooks/useTranslation';
import type { FareBreakdown } from '../services/ride-service';
import { formatFare } from '@kimu/shared/types/ride';

/** Itemised upfront fare, as returned by GET /rides/quote. */
export function FareBreakdownView({
  breakdown,
  distanceKm,
  durationMinutes,
}: {
  breakdown: FareBreakdown;
  distanceKm: number;
  durationMinutes: number;
}) {
  const { t } = useTranslation();
  const rows: [string, number][] = [
    [t('baseFare'), breakdown.baseFare],
    [t('distanceFare', { km: distanceKm.toFixed(1) }), breakdown.distanceFare],
    [t('timeFare', { minutes: durationMinutes }), breakdown.timeFare],
    [t('bookingFee'), breakdown.bookingFee],
  ];
  return (
    <View className="rounded-2xl bg-gray-light p-3.5">
      <Text className="mb-2 text-[13px] font-bold text-ink">{t('fareBreakdown')}</Text>
      {rows.map(([label, amount]) => (
        <View key={label} className="flex-row justify-between py-0.5">
          <Text className="text-[13px] text-text-secondary">{label}</Text>
          <Text className="text-[13px] text-ink">{formatFare(amount)}</Text>
        </View>
      ))}
      {breakdown.surgeMultiplier > 1 ? (
        <View className="flex-row items-center py-0.5">
          <Ionicons name="flash" size={13} color="#F97316" />
          <Text className="ml-1 text-[13px] text-warning">{t('surgeApplied', { multiplier: breakdown.surgeMultiplier.toFixed(1) })}</Text>
        </View>
      ) : null}
      {breakdown.minimumApplied ? (
        <Text className="py-0.5 text-[13px] text-text-secondary">{t('minimumFareApplied')} ({formatFare(breakdown.minimumFare)})</Text>
      ) : null}
      {breakdown.sharedDiscountPercent > 0 ? (
        <Text className="py-0.5 text-[13px] text-primary">{t('sharedDiscount', { percent: breakdown.sharedDiscountPercent })}</Text>
      ) : null}
      <View className="mt-1.5 flex-row justify-between border-t border-border pt-2">
        <Text className="text-sm font-bold text-ink">{t('totalLabel')}</Text>
        <Text className="text-sm font-bold text-ink">{formatFare(breakdown.total)}</Text>
      </View>
      <Text className="mt-1.5 text-[11px] leading-4 text-text-secondary">{t('upfrontPriceNote')}</Text>
    </View>
  );
}

/** "14:32" in the device's locale/time zone. */
export function clockIn(minutes: number): string {
  const d = new Date(Date.now() + minutes * 60_000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
