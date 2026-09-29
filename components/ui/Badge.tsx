import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { toneColors, Tone } from './List';
import { Text } from './Text';

type BadgeTone = Tone | 'success';

/** Compact status pill (ride status, document state, "New"). */
export function Badge({
  label,
  tone = 'neutral',
  icon,
  dot,
}: {
  label: string;
  tone?: BadgeTone;
  icon?: keyof typeof Ionicons.glyphMap;
  dot?: boolean;
}) {
  const c = toneColors[tone === 'success' ? 'primary' : tone];
  const fg = tone === 'neutral' ? toneColors.neutral.fg : c.fg;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor: c.bg,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        gap: 5,
      }}
    >
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: fg }} /> : null}
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <Text variant="caption" weight="semibold" style={{ color: fg }}>
        {label}
      </Text>
    </View>
  );
}
