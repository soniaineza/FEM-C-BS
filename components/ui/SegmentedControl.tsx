import { Pressable, View } from 'react-native';

import { Colors, Elevation } from '../../constants/theme';
import { Text } from './Text';

/** iOS-style segmented control; equal-width segments that fit any locale. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: Colors['surface-muted'], borderRadius: 14, padding: 4 }}>
      {options.map((o) => {
        const selected = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.id)}
            style={[
              { flex: 1, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingHorizontal: 6 },
              selected ? [{ backgroundColor: Colors.surface }, Elevation[1]] : null,
            ]}
          >
            <Text variant="subhead" weight={selected ? 'semibold' : 'medium'} tone={selected ? 'default' : 'muted'} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
