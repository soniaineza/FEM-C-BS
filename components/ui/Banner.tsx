import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '../../constants/theme';
import { Text } from './Text';

type BannerTone = 'info' | 'success' | 'warning' | 'danger';

const styles: Record<BannerTone, { bg: string; border: string; fg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  info: { bg: Colors['info-soft'], border: '#B2DDFF', fg: Colors.info, icon: 'information-circle' },
  success: { bg: Colors['success-soft'], border: '#BBF7D0', fg: Colors['primary-text'], icon: 'checkmark-circle' },
  warning: { bg: Colors['warning-soft'], border: '#FEDF89', fg: Colors.warning, icon: 'warning' },
  danger: { bg: Colors['danger-soft'], border: Colors['danger-border'], fg: Colors.danger, icon: 'alert-circle' },
};

/** Inline callout for notices, warnings and form-level errors. */
export function Banner({
  tone = 'info',
  title,
  message,
  actionLabel,
  onAction,
  icon,
}: {
  tone?: BannerTone;
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const s = styles[tone];
  return (
    <View
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      style={{ flexDirection: 'row', alignItems: 'flex-start', backgroundColor: s.bg, borderColor: s.border, borderWidth: 1, borderRadius: 14, padding: 14, width: '100%' }}
    >
      <Ionicons name={icon ?? s.icon} size={20} color={s.fg} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        {title ? (
          <Text variant="subhead" weight="semibold">
            {title}
          </Text>
        ) : null}
        <Text variant="subhead" tone={title ? 'muted' : 'default'} style={title ? { marginTop: 2 } : undefined}>
          {message}
        </Text>
      </View>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={10} style={{ marginLeft: 10 }}>
          <Text variant="subhead" weight="semibold" style={{ color: s.fg }}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
