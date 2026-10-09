import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useTranslation } from '@kimu/shared/hooks/useTranslation';

export type PhoneScope = 'local' | 'international';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

function mask(value: string): string {
  if (value.length <= 3) return '•'.repeat(value.length);
  return '•'.repeat(value.length - 3) + value.slice(-3);
}

/**
 * The passenger's number, entered on a keypad the size of a driver's thumb
 * rather than the system keyboard: the reference app does this because a
 * driver types it one-handed with the engine running, often in the dark.
 */
export function PhonePad({
  value,
  onChange,
  scope,
  onScopeChange,
}: {
  value: string;
  onChange: (next: string) => void;
  scope: PhoneScope;
  onScopeChange: (next: PhoneScope) => void;
}) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(true);
  const isLocal = scope === 'local';

  function press(digit: string) {
    // Rwandan numbers are 10 digits locally, 12 with the country code; a few
    // extra are allowed for odd international numbers but not unbounded.
    if (value.length >= 15) return;
    onChange(value + digit);
  }

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isLocal ? t('driverLocalNumber') : t('driverInternationalNumber')}
        onPress={() => onScopeChange(isLocal ? 'international' : 'local')}
        className="flex-row items-center rounded-2xl border border-border bg-white px-4 py-3.5 active:bg-gray-light"
      >
        <Ionicons name="phone-portrait-outline" size={22} color="#0E7C4A" />
        <View className="ml-3 flex-1">
          <Text className="text-[15px] font-semibold text-ink">
            {isLocal ? t('driverLocalNumber') : t('driverInternationalNumber')}
          </Text>
          <Text className="font-sans mt-0.5 text-[12px] text-text-secondary">
            {isLocal ? t('driverLocalNumberHint') : t('driverInternationalNumberHint')}
          </Text>
        </View>
        <Ionicons name="swap-horizontal" size={20} color="#6B7280" />
      </Pressable>

      <View className="mt-3 flex-row items-center">
        <View className="flex-1 flex-row items-center rounded-2xl border border-border bg-gray-light px-4 py-3">
          <Text
            className={`flex-1 text-[22px] font-semibold ${value ? 'text-ink' : 'text-text-secondary'}`}
            style={{ fontVariant: ['tabular-nums'] }}
            numberOfLines={1}
          >
            {value ? (revealed ? value : mask(value)) : t('driverNumberPlaceholder')}
          </Text>
          {value ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('clear')}
                onPress={() => onChange('')}
                hitSlop={8}
                className="ml-2"
              >
                <Ionicons name="close-circle" size={22} color="#9CA3AF" />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={revealed ? t('hide') : t('show')}
                onPress={() => setRevealed((r) => !r)}
                hitSlop={8}
                className="ml-2.5"
              >
                <Ionicons name={revealed ? 'eye-outline' : 'eye-off-outline'} size={22} color="#6B7280" />
              </Pressable>
            </>
          ) : null}
        </View>

        {/* How many digits are in so far — the reference keeps this in view
            because a mistyped length is the usual reason a charge fails. */}
        <View className="ml-3 h-12 w-12 items-center justify-center rounded-full border border-border bg-white">
          <Text className="text-[15px] font-bold text-ink" style={{ fontVariant: ['tabular-nums'] }}>
            {value.length}
          </Text>
        </View>
      </View>

      <View className="mt-4 flex-row flex-wrap justify-between">
        {KEYS.map((digit) => (
          <PadKey key={digit} label={digit} onPress={() => press(digit)} />
        ))}
        <View className="mb-3 h-[62px] w-[31%]" />
        <PadKey label="0" onPress={() => press('0')} />
        <PadKey
          label="⌫"
          accessibilityLabel={t('back')}
          onPress={() => onChange(value.slice(0, -1))}
          onLongPress={() => onChange('')}
        />
      </View>
    </View>
  );
}

function PadKey({
  label,
  onPress,
  onLongPress,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      onLongPress={onLongPress}
      className="mb-3 h-[62px] w-[31%] items-center justify-center rounded-2xl border border-border bg-white active:bg-primary-soft"
    >
      <Text className="text-[24px] font-semibold text-ink">{label}</Text>
    </Pressable>
  );
}
