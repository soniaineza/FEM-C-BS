import { View, Text, Image } from 'react-native';
import { memo } from 'react';

// The KIMU Transport & Multiservices emblem (round badge: house, car, bulb
// and plug over the orange ribbon), cut out of the brand artwork with a
// transparent background so it sits on white screens. The lock-up beside it
// repeats the artwork's wordmark as live text — green "KIMU" over the navy
// "Transport & Multiservices" — so it stays crisp at header sizes where the
// painted letters would blur.
const EMBLEM = require('../assets/brand/logo-mark.png');
const NAVY = '#0C1536';

export const KimuLogo = memo(function KimuLogo({
  size = 40,
  withWordmark = true,
}: {
  /** Height (and width) of the emblem in points; the wordmark scales with it. */
  size?: number;
  withWordmark?: boolean;
}) {
  const nameSize = Math.max(14, Math.round(size * 0.34));
  const lineSize = Math.max(9, Math.round(size * 0.2));
  return (
    <View className="flex-row items-center" accessibilityRole="image" accessibilityLabel="Kimu Transport & Multiservices">
      <Image source={EMBLEM} style={{ width: size, height: size }} resizeMode="contain" accessibilityIgnoresInvertColors />
      {withWordmark ? (
        <View className="ml-2">
          <Text
            numberOfLines={1}
            className="font-display text-primary"
            style={{ fontSize: nameSize, lineHeight: Math.round(nameSize * 1.1), letterSpacing: 0.5 }}
          >
            KIMU
          </Text>
          <Text numberOfLines={1} className="font-bold" style={{ color: NAVY, fontSize: lineSize, lineHeight: Math.round(lineSize * 1.2) }}>
            Transport &
          </Text>
          <Text numberOfLines={1} className="font-bold" style={{ color: NAVY, fontSize: lineSize, lineHeight: Math.round(lineSize * 1.2) }}>
            Multiservices
          </Text>
        </View>
      ) : null}
    </View>
  );
});

KimuLogo.displayName = 'KimuLogo';
