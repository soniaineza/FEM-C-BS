import { Image, View } from 'react-native';

import { Colors, Fonts } from '../../constants/theme';
import { Text } from './Text';

export function initialsFor(name?: string | null): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '?';
  return trimmed
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** Circular photo or initials avatar on a brand tint. */
export function Avatar({ name, uri, size = 48, ring }: { name?: string | null; uri?: string | null; size?: number; ring?: boolean }) {
  const ringStyle = ring ? { borderWidth: 3, borderColor: Colors.surface } : null;
  if (uri) {
    return <Image source={{ uri }} accessibilityIgnoresInvertColors style={[{ width: size, height: size, borderRadius: size / 2 }, ringStyle]} />;
  }
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: size / 2, backgroundColor: Colors['primary-tint'], alignItems: 'center', justifyContent: 'center' },
        ringStyle,
      ]}
    >
      <Text style={{ fontFamily: Fonts.semibold, fontSize: size * 0.36, lineHeight: size * 0.44, color: Colors['primary-text'] }}>
        {initialsFor(name)}
      </Text>
    </View>
  );
}
