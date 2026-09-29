import { ActivityIndicator, View } from 'react-native';
import { Pressable, PressableProps } from './ui/Pressable';
import { memo } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Elevation, Motion } from '../constants/theme';
import { Text } from './ui/Text';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'text';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  title: string;
  loading?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Legacy flag: soft red "delete account" style. Prefer variant="danger". */
  destructive?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  /** Stretch to container width (default true). */
  block?: boolean;
  className?: string;
}

const sizes: Record<ButtonSize, { height: number; px: number; radius: number; icon: number; text: 'headline' | 'callout' | 'subhead' }> = {
  lg: { height: 56, px: 24, radius: 16, icon: 20, text: 'headline' },
  md: { height: 48, px: 20, radius: 14, icon: 18, text: 'callout' },
  sm: { height: 36, px: 14, radius: 10, icon: 16, text: 'subhead' },
};

// Solid, flat surfaces (Uber Base / Bolt style): the brand fill carries the
// hierarchy, not gradients. Every variant presses to 97% scale with a
// darker fill; disabled dims instead of changing shape.
function palette(variant: ButtonVariant, destructive: boolean, pressed: boolean) {
  if (destructive && variant !== 'danger') {
    return { bg: pressed ? '#FEE4E2' : Colors['danger-soft'], border: Colors['danger-border'], fg: Colors.danger };
  }
  switch (variant) {
    case 'primary':
      return { bg: pressed ? Colors['primary-hover'] : Colors.primary, border: 'transparent', fg: Colors['primary-fg'] };
    case 'danger':
      return { bg: pressed ? '#B42318' : Colors.danger, border: 'transparent', fg: Colors['fg-inverse'] };
    case 'secondary':
      return { bg: pressed ? Colors['primary-tint'] : Colors['primary-soft'], border: 'transparent', fg: Colors['primary-text'] };
    case 'outline':
      return { bg: pressed ? Colors.canvas : Colors.surface, border: Colors['border-strong'], fg: Colors.fg };
    case 'ghost':
    case 'text':
    default:
      return { bg: pressed ? Colors['primary-soft'] : 'transparent', border: 'transparent', fg: Colors['primary-text'] };
  }
}

export const Button = memo(function Button({
  title,
  loading,
  variant = 'primary',
  size = 'lg',
  destructive = false,
  icon,
  iconRight,
  block = true,
  disabled,
  className,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const s = sizes[size];
  // Legacy className="bg-danger" meant a solid danger button.
  const effectiveVariant: ButtonVariant = (className?.includes('bg-error') || className?.includes('bg-danger')) ? 'danger' : variant;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: Boolean(isDisabled), busy: Boolean(loading) }}
      disabled={isDisabled}
      style={({ pressed }) => {
        const p = palette(effectiveVariant, destructive, pressed && !isDisabled);
        return [
          {
            minHeight: s.height,
            width: block ? '100%' : undefined,
            alignSelf: block ? undefined : 'flex-start',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: s.radius,
            borderWidth: p.border === 'transparent' ? 0 : 1,
            borderColor: p.border,
            paddingHorizontal: s.px,
            paddingVertical: 8,
            backgroundColor: p.bg,
            opacity: isDisabled ? 0.5 : 1,
            transform: [{ scale: pressed && !isDisabled ? Motion.pressScale : 1 }],
          },
          (effectiveVariant === 'primary' || effectiveVariant === 'danger') && !destructive && !isDisabled ? Elevation[1] : null,
        ];
      }}
      {...rest}
    >
      {({ pressed }) => {
        const p = palette(effectiveVariant, destructive, pressed && !isDisabled);
        if (loading) return <ActivityIndicator color={p.fg} />;
        return (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, flexShrink: 1 }}>
            {icon ? <Ionicons name={icon} size={s.icon} color={p.fg} /> : null}
            <Text variant={s.text} weight="semibold" align="center" style={{ color: p.fg, flexShrink: 1 }}>
              {title}
            </Text>
            {iconRight ? <Ionicons name={iconRight} size={s.icon} color={p.fg} /> : null}
          </View>
        );
      }}
    </Pressable>
  );
});

Button.displayName = 'Button';
