import { Pressable, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Place } from '../types/place';

// Direct port of lib/widgets/location_field.dart: a tappable pickup/
// destination row — filled dot for pickup, outlined ring for destination,
// label + value (or placeholder), chevron.
export function LocationField({
  label,
  value,
  onPress,
  isPickup = false,
  placeholder,
}: {
  label: string;
  value?: Place | null;
  onPress?: () => void;
  isPickup?: boolean;
  placeholder: string;
}) {
  const hasValue = Boolean(value);
  const dotColor = isPickup ? '#16A34A' : '#111111';

  return (
    <Pressable
      className="flex-row items-center rounded-xl border border-border bg-white px-3.5 py-3.5"
      onPress={onPress}
    >
      <Ionicons name={isPickup ? 'ellipse' : 'ellipse-outline'} size={18} color={dotColor} />
      <View className="ml-3 flex-1">
        <Text className="text-xs font-medium text-text-secondary">{label}</Text>
        <Text
          numberOfLines={1}
          className={`mt-0.5 text-[15px] ${hasValue ? 'font-semibold text-ink' : 'font-normal text-text-secondary'}`}
        >
          {hasValue ? value!.address : placeholder}
        </Text>
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={22} color="#6B7280" /> : null}
    </Pressable>
  );
}
