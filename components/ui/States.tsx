import { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '../../constants/theme';
import { Button } from '../Button';
import { toneColors, Tone } from './List';
import { Text } from './Text';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Empty / error / success placeholder: icon in a soft halo, title, one line
 * of guidance, and an optional action. Use instead of bare grey text.
 */
export function EmptyState({
  icon = 'file-tray-outline',
  title,
  message,
  actionLabel,
  onAction,
  tone = 'neutral',
  children,
  compact,
}: {
  icon?: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: Tone;
  children?: ReactNode;
  compact?: boolean;
}) {
  const c = toneColors[tone];
  const iconColor = tone === 'neutral' ? Colors['fg-muted'] : c.fg;
  return (
    <View style={{ alignItems: 'center', paddingVertical: compact ? 24 : 48, paddingHorizontal: 24 }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={32} color={iconColor} />
      </View>
      <Text variant="title-3" align="center" style={{ marginTop: 16 }}>
        {title}
      </Text>
      {message ? (
        <Text variant="subhead" tone="muted" align="center" style={{ marginTop: 6, maxWidth: 320 }}>
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: 20, minWidth: 180 }}>
          <Button title={actionLabel} variant="secondary" size="md" onPress={onAction} />
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Network-failure state with retry. */
export function ErrorState({ message, retryLabel, onRetry, title }: { message: string; retryLabel?: string; onRetry?: () => void; title?: string }) {
  return (
    <EmptyState
      icon="cloud-offline-outline"
      tone="danger"
      title={title ?? message}
      message={title ? message : undefined}
      actionLabel={retryLabel}
      onAction={onRetry}
    />
  );
}

/** Centered brand spinner with optional caption. */
export function LoadingState({ label, compact }: { label?: string; compact?: boolean }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: compact ? 24 : 56 }}>
      <ActivityIndicator size="large" color={Colors.primary} />
      {label ? (
        <Text variant="subhead" tone="muted" style={{ marginTop: 12 }}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

/** Rounded placeholder block for skeleton layouts. */
export function Skeleton({ width = '100%', height = 16, radius = 8 }: { width?: number | `${number}%`; height?: number; radius?: number }) {
  return <View style={{ width, height, borderRadius: radius, backgroundColor: Colors['surface-muted'] }} />;
}
