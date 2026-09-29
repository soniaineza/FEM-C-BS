import { Pressable } from './Pressable';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '../../constants/theme';
import { Text } from './Text';

/** Selectable pill for filters, topics and quick values (Material filter chip). */
export function Chip({
  label,
  selected = false,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 36,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? Colors.primary : Colors.border,
        backgroundColor: selected ? Colors['primary-soft'] : pressed ? Colors.canvas : Colors.surface,
        gap: 6,
      })}
    >
      {selected ? <Ionicons name="checkmark" size={15} color={Colors['primary-text']} /> : icon ? <Ionicons name={icon} size={15} color={Colors['fg-muted']} /> : null}
      <Text variant="subhead" weight={selected ? 'semibold' : 'medium'} tone={selected ? 'primary' : 'default'}>
        {label}
      </Text>
    </Pressable>
  );
}
