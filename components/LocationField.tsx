import { View, Text } from 'react-native';
import { Pressable } from './ui/Pressable';
import { memo } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { Place } from '../types/place';
import { Colors } from '../constants/theme';

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
      className={`min-h-[56px] flex-row items-center px-4 py-3.5 ${bordered ? 'rounded-2xl border border-border bg-surface' : ''}`}
      accessibilityRole="button"
      style={({ pressed }) => ({ backgroundColor: pressed && onPress ? Colors.canvas : undefined })}
      onPress={onPress}
    >
      {isPickup ? (
        <View style={{ width: 20, alignItems: 'center' }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 3, borderColor: Colors.primary, backgroundColor: Colors.surface }} />
        </View>
      ) : (
        <View style={{ width: 20, alignItems: 'center' }}>
          <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: Colors.fg }} />
        </View>
      )}
      <Text
        numberOfLines={1}
        className={`ml-3 flex-1 text-callout ${hasValue ? 'font-medium text-fg' : 'text-fg-subtle'}`}
      >
        {hasValue ? value!.address : placeholder}
      </Text>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={Colors['fg-disabled']} /> : null}
    </Pressable>
  );
});

LocationField.displayName = 'LocationField';
