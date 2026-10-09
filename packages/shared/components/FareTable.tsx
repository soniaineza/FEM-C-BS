import { View, Text } from 'react-native';

import { useTranslation } from '../hooks/useTranslation';
import { Vehicle } from '../types/vehicle';

/** 1800 -> "1,800 RWF". */
function money(amount: number): string {
  return `${Math.round(amount).toLocaleString('en-US')} RWF`;
}

/** Drops a trailing ".0" so 1 km reads "1 km", not "1.0 km". */
function km(value: number): string {
  return String(Math.round(value * 10) / 10);
}

function Row({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <View className="border-b border-border px-4 py-3.5">
      <Text className="font-sans text-[12.5px] text-text-secondary">{label}</Text>
      <View className="mt-1 flex-row items-baseline">
        <Text className="text-[19px] font-bold text-ink" style={{ fontVariant: ['tabular-nums'] }}>
          {value}
        </Text>
        {suffix ? <Text className="ml-2 text-[13px] font-medium text-accent">{suffix}</Text> : null}
      </View>
    </View>
  );
}

/**
 * Kimu's published fare table for one vehicle class, rendered exactly as it is
 * charged: the base covers the first `includedKm`, the normal rate applies up
 * to `longDistanceKm`, and the long-distance rate beyond it.
 *
 * The waiting rows are the published policy. Nothing in the app measures
 * waiting time, so no waiting money is added to any fare.
 */
export function FareTable({ vehicle, title }: { vehicle: Vehicle; title?: string }) {
  const { t } = useTranslation();
  const included = vehicle.includedKm ?? 0;
  const longFrom = vehicle.longDistanceKm ?? null;

  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-white">
      <View className="border-b border-border bg-gray-light px-4 py-3">
        <Text className="text-[14px] font-bold text-ink">{title ?? t('fareTableTitle')}</Text>
      </View>

      <Row
        label={t('baseFare')}
        value={money(vehicle.baseFare)}
        suffix={included > 0 ? t('fareUpToKm', { km: km(included) }) : undefined}
      />

      <Row
        label={longFrom != null ? t('fareKmRange', { from: km(included), to: km(longFrom) }) : t('distance')}
        value={money(vehicle.farePerKm)}
        suffix={t('farePerKilometer')}
      />

      {longFrom != null && vehicle.farePerKmLong != null ? (
        <Row
          label={t('fareAfterKm', { km: km(longFrom) })}
          value={money(vehicle.farePerKmLong)}
          suffix={t('farePerKilometer')}
        />
      ) : null}

      {vehicle.waitingFee != null && vehicle.waitingFeeMinutes != null ? (
        <Row
          label={t('fareWaitingCharge')}
          value={money(vehicle.waitingFee)}
          suffix={t('fareForEveryMinutes', { minutes: vehicle.waitingFeeMinutes })}
        />
      ) : null}

      {vehicle.freeWaitingMinutes != null ? (
        <Row
          label={t('fareFreeWaitingMinutes')}
          value={String(vehicle.freeWaitingMinutes)}
          suffix={t('fareMinutesUnit')}
        />
      ) : null}

      <View className="bg-accent-soft px-4 py-3">
        <Text className="font-sans text-center text-[12px] leading-5 text-accent-dark">{t('fareExtrasNote')}</Text>
      </View>
    </View>
  );
}
