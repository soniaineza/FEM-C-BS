import { Pressable, View, Text } from 'react-native';
import { memo } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { Place } from '../types/place';

// Pickup/destination row: filled green dot for pickup, filled red pin for
// destination, label text, chevron. `bordered` wraps the row in its own
// card (used standalone); when false (default) it's meant to sit inside a
// shared outer card with a divider between rows, matching the reference
// design's single seamless location card.
export const LocationField = memo(function LocationField({
  value,
  onPress,
  isPickup = false,
  placeholder,
  bordered = false,
}: {
  value?: Place | null;
  onPress?: () => void;
  isPickup?: boolean;
  placeholder: string;
  bordered?: boolean;
}) {
  const hasValue = Boolean(value);

  return (
    <Pressable
      className={`flex-row items-center px-3 py-3.5 sm:px-4 sm:py-4 ${bordered ? 'rounded-xl border border-border bg-white' : ''}`}
      onPress={onPress}
    >
      <Ionicons name={isPickup ? 'ellipse' : 'location'} size={isPickup ? 16 : 20} color={isPickup ? '#FFFFFF' : '#DC2626'} />
      <Text
        numberOfLines={1}
        className={`ml-3 flex-1 text-[15px] ${hasValue ? 'font-semibold text-white' : 'font-medium text-white/70'}`}
      >
        {hasValue ? value!.address : placeholder}
      </Text>
      {onPress ? <Ionicons name="chevron-forward" size={20} color="#6B7280" /> : null}
    </Pressable>
  );
});

LocationField.displayName = 'LocationField';
