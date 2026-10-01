import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTranslation } from '../hooks/useTranslation';
import type { FareBreakdown } from '../services/ride-service';
import { formatFare } from '../types/ride';
import { Colors } from '../constants/theme';

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
  ];
  // Waiting is only charged beyond the free window; the booking fee no longer exists.
  if (breakdown.timeFare > 0) rows.push([t('waitingFare'), breakdown.timeFare]);
  if (breakdown.bookingFee > 0) rows.push([t('bookingFee'), breakdown.bookingFee]);
  return (
    <View className="rounded-2xl bg-surface-muted p-4">
      <Text className="mb-2 text-footnote font-semibold uppercase tracking-wide text-fg-muted">{t('fareBreakdown')}</Text>
      {rows.map(([label, amount]) => (
        <View key={label} className="flex-row justify-between py-1">
          <Text className="text-subhead text-fg-muted">{label}</Text>
          <Text className="text-subhead text-fg">{formatFare(amount)}</Text>
        </View>
      ))}
      {breakdown.surgeMultiplier > 1 ? (
        <View className="flex-row items-center py-0.5">
          <Ionicons name="flash" size={13} color={Colors.warning} />
          <Text className="ml-1 text-subhead text-warning">{t('surgeApplied', { multiplier: breakdown.surgeMultiplier.toFixed(1) })}</Text>
        </View>
      ) : null}
      {breakdown.minimumApplied ? (
        <Text className="py-0.5 text-subhead text-fg-muted">{t('minimumFareApplied')} ({formatFare(breakdown.minimumFare)})</Text>
      ) : null}
      {breakdown.sharedDiscountPercent > 0 ? (
        <Text className="py-0.5 text-subhead text-primary-text">{t('sharedDiscount', { percent: breakdown.sharedDiscountPercent })}</Text>
      ) : null}
      <View className="mt-2 flex-row justify-between border-t border-border pt-3">
        <Text className="text-headline font-bold text-fg">{t('totalLabel')}</Text>
        <Text className="text-headline font-bold text-fg">{formatFare(breakdown.total)}</Text>
      </View>
      <Text className="mt-2 text-caption text-fg-subtle">{t('upfrontPriceNote')}</Text>
    </View>
  );
}

/** "14:32" in the device's locale/time zone. */
export function clockIn(minutes: number): string {
  const d = new Date(Date.now() + minutes * 60_000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
