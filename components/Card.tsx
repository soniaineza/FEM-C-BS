import { ReactNode, useState } from 'react';
import { Pressable, View, ViewProps } from 'react-native';

import { Colors, Elevation, Motion } from '../constants/theme';

interface CardProps extends ViewProps {
  children: ReactNode;
  className?: string;
  // surface/white: default card. tint: soft brand wash for highlights (fares,
  // PINs, promos). muted: inset well inside another card. ink: dark hero.
  // primary: solid brand hero (balances, earnings).
  tone?: 'white' | 'surface' | 'tint' | 'muted' | 'ink' | 'primary';
  padded?: boolean;
  onPress?: () => void;
}

const tones = {
  white: { backgroundColor: Colors.surface, borderColor: Colors.border },
  surface: { backgroundColor: Colors.surface, borderColor: Colors.border },
  tint: { backgroundColor: Colors['primary-soft'], borderColor: Colors['primary-tint'] },
  muted: { backgroundColor: Colors['surface-muted'], borderColor: 'transparent' },
  ink: { backgroundColor: Colors['surface-inverse'], borderColor: 'transparent' },
  primary: { backgroundColor: Colors.primary, borderColor: 'transparent' },
} as const;

/** The one card surface: 20px radius, hairline border, level-1 elevation. */
export function Card({ children, className, style, tone = 'white', padded = true, onPress, ...rest }: CardProps) {
  const base = [
    tones[tone],
    tone === 'white' || tone === 'surface' ? Elevation[1] : tone === 'primary' || tone === 'ink' ? Elevation[2] : null,
    padded && { padding: 18 },
    { borderWidth: 1, borderRadius: 20 },
  ];
  if (onPress) {
    return (
      <PressableCard base={base} className={className} style={style} onPress={onPress} {...rest}>
        {children}
      </PressableCard>
    );
  }
  return (
    <View style={[...base, style]} className={className} {...rest}>
      {children}
    </View>
  );
}

// NativeWind drops a Pressable's function-style when a className is present,
// so press feedback is tracked in state and passed as a plain style array.
function PressableCard({ base, className, style, onPress, children, ...rest }: { base: unknown[]; className?: string; style: ViewProps['style']; onPress: () => void; children: ReactNode } & ViewProps) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      className={className}
      style={[...(base as object[]), { transform: [{ scale: pressed ? 0.985 : 1 }], opacity: pressed ? Motion.pressOpacity + 0.07 : 1 }, style]}
      {...(rest as object)}
    >
      {children}
    </Pressable>
  );
}
