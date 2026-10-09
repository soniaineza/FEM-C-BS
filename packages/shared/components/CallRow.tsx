import { memo } from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

/**
 * Dials a number through the OS dialer. `tel:` never needs the CALL_PHONE
 * permission — the person confirms the call themselves, which is what you
 * want behind an SOS button.
 */
export function dialNumber(phone: string): void {
  if (!phone) return;
  Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`).catch(() => {});
}

/** One tappable "call this person or service" row. */
export const CallRow = memo(function CallRow({
  label,
  phone,
  accessibilityLabel,
  urgent = false,
}: {
  label: string;
  phone: string;
  accessibilityLabel?: string;
  /** Red treatment for emergency services; green for a personal contact. */
  urgent?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${label} ${phone}`}
      onPress={() => dialNumber(phone)}
      className={`mt-2.5 min-h-[56px] flex-row items-center rounded-2xl border px-4 py-3 ${
        urgent ? 'border-error bg-error/5 active:bg-error/10' : 'border-primary/40 bg-primary-soft active:bg-primary/10'
      }`}
    >
      <View
        className={`h-10 w-10 items-center justify-center rounded-full ${urgent ? 'bg-error/10' : 'bg-white'}`}
      >
        <Ionicons name="call" size={20} color={urgent ? '#DC2626' : '#0E7C4A'} />
      </View>
      <View className="ml-3 flex-1">
        <Text className={`text-[15px] font-semibold ${urgent ? 'text-error' : 'text-ink'}`} numberOfLines={1}>
          {label}
        </Text>
        {/* A short code is its own name, so don't print "112" twice. */}
        {label.trim() !== phone.trim() ? (
          <Text className="font-sans mt-0.5 text-[13px] text-text-secondary" numberOfLines={1}>
            {phone}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color="#6B7280" />
    </Pressable>
  );
});

CallRow.displayName = 'CallRow';
