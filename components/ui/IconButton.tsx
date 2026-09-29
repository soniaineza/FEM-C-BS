import { View } from 'react-native';
import { Pressable, PressableProps } from './Pressable';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Elevation, Motion } from '../../constants/theme';

type IconName = keyof typeof Ionicons.glyphMap;

export interface IconButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  icon: IconName;
  accessibilityLabel: string;
  variant?: 'soft' | 'surface' | 'ghost' | 'primary' | 'glass';
  size?: 'sm' | 'md' | 'lg';
  badge?: boolean;
  color?: string;
}

const dims = { sm: { box: 36, icon: 18 }, md: { box: 44, icon: 22 }, lg: { box: 52, icon: 24 } };

/** Circular icon-only control with a 44pt minimum hit area. */
export function IconButton({ icon, variant = 'soft', size = 'md', badge, color, disabled, ...rest }: IconButtonProps) {
  const d = dims[size];
  const bg = {
    soft: Colors['surface-muted'],
    surface: Colors.surface,
    ghost: 'transparent',
    primary: Colors.primary,
    glass: 'rgba(255,255,255,0.18)',
  }[variant];
  const fg = color ?? (variant === 'primary' || variant === 'glass' ? Colors['fg-inverse'] : Colors.fg);
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={Math.max(0, (44 - d.box) / 2)}
      style={({ pressed }) => [
        {
          width: d.box,
          height: d.box,
          borderRadius: d.box / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bg,
          opacity: disabled ? 0.4 : pressed ? Motion.pressOpacity : 1,
          transform: [{ scale: pressed ? Motion.pressScale : 1 }],
        },
        variant === 'surface' ? Elevation[2] : null,
      ]}
      {...rest}
    >
      <Ionicons name={icon} size={d.icon} color={fg} />
      {badge ? (
        <View
          style={{
            position: 'absolute',
            top: d.box * 0.2,
            right: d.box * 0.2,
            width: 9,
            height: 9,
            borderRadius: 5,
            backgroundColor: Colors.danger,
            borderWidth: 1.5,
            borderColor: bg === 'transparent' ? Colors.surface : bg,
          }}
        />
      ) : null}
    </Pressable>
  );
}
