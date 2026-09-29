import { Children, Fragment, isValidElement, ReactNode } from 'react';
import { View } from 'react-native';
import { Pressable } from './Pressable';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Elevation } from '../../constants/theme';
import { Text } from './Text';

type IconName = keyof typeof Ionicons.glyphMap;
export type Tone = 'neutral' | 'primary' | 'danger' | 'warning' | 'info';

export const toneColors: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: Colors.fg, bg: Colors['surface-muted'] },
  primary: { fg: Colors['primary-text'], bg: Colors['primary-soft'] },
  danger: { fg: Colors.danger, bg: Colors['danger-soft'] },
  warning: { fg: Colors.warning, bg: Colors['warning-soft'] },
  info: { fg: Colors.info, bg: Colors['info-soft'] },
};

/**
 * Inset grouped list (iOS Settings / Material list card): an optional
 * overline title, one rounded surface, hairline dividers inset past the
 * leading icon, and optional footnote.
 */
export function ListSection({
  title,
  footer,
  children,
  className,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
  className?: string;
}) {
  const items = Children.toArray(children).filter(isValidElement);
  return (
    <View className={`mt-6 ${className ?? ''}`}>
      {title ? (
        <Text variant="footnote" weight="semibold" tone="muted" style={{ marginBottom: 8, marginLeft: 4, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          {title}
        </Text>
      ) : null}
      <View style={[{ backgroundColor: Colors.surface, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }, Elevation[1]]}>
        {items.map((child, i) => (
          <Fragment key={child.key ?? i}>
            {i > 0 ? <View style={{ height: 1, backgroundColor: Colors.divider, marginLeft: 68 }} /> : null}
            {child}
          </Fragment>
        ))}
      </View>
      {footer ? (
        <Text variant="footnote" tone="subtle" style={{ marginTop: 8, marginHorizontal: 4 }}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

export interface ListItemProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  tone?: Tone;
  /** Trailing value text (e.g. current language). */
  value?: string;
  /** Custom trailing element (switch, badge…). Replaces value + chevron. */
  right?: ReactNode;
  onPress?: () => void;
  /** Show the disclosure chevron (default: when pressable and no `right`). */
  chevron?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
}

export function ListItem({ title, subtitle, icon, tone = 'primary', value, right, onPress, chevron, disabled, accessibilityLabel }: ListItemProps) {
  const c = toneColors[tone];
  const showChevron = chevron ?? (Boolean(onPress) && !right);
  const body = (
    <>
      {icon ? (
        <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg, marginRight: 14 }}>
          <Ionicons name={icon} size={19} color={c.fg} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text variant="callout" weight="medium" tone={tone === 'danger' ? 'danger' : 'default'}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="footnote" tone="muted" style={{ marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? (value ? (
        <Text variant="subhead" tone="muted" numberOfLines={1} style={{ marginLeft: 8, maxWidth: '45%' }}>
          {value}
        </Text>
      ) : null)}
      {showChevron ? <Ionicons name="chevron-forward" size={18} color={Colors['fg-disabled']} style={{ marginLeft: 6 }} /> : null}
    </>
  );
  const rowStyle = { minHeight: 56, flexDirection: 'row' as const, alignItems: 'center' as const, paddingHorizontal: 16, paddingVertical: 12 };

  if (!onPress) return <View style={rowStyle}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [rowStyle, { backgroundColor: pressed ? Colors.canvas : 'transparent', opacity: disabled ? 0.5 : 1 }]}
    >
      {body}
    </Pressable>
  );
}
