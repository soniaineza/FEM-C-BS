import { View } from 'react-native';
import { Pressable } from './ui/Pressable';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '../constants/theme';
import { useTranslation } from '../hooks/useTranslation';
import { PAYMENT_METHOD_META, PaymentMethod } from '../types/payment';
import { Badge } from './ui/Badge';
import { Text } from './ui/Text';

/** A payment method as a brand tile + name + explainer, optionally selectable. */
export function PaymentMethodRow({
  method,
  selected,
  onPress,
  detail,
  demo,
}: {
  method: PaymentMethod;
  selected?: boolean;
  onPress?: () => void;
  /** Extra line, e.g. the wallet balance. */
  detail?: string;
  demo?: boolean;
}) {
  const { t } = useTranslation();
  const meta = PAYMENT_METHOD_META[method.id] ?? PAYMENT_METHOD_META.cash;
  const body = (
    <>
      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: meta.tile, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={meta.icon as keyof typeof Ionicons.glyphMap} size={22} color={meta.fg} />
      </View>
      <View style={{ flex: 1, marginLeft: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="callout" weight="semibold">{method.name}</Text>
          {demo ? <Badge label={t('demoLabel')} tone="info" /> : null}
        </View>
        <Text variant="footnote" tone="muted" style={{ marginTop: 2 }}>
          {detail ?? t(meta.description as never)}
        </Text>
      </View>
      {onPress ? (
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            borderWidth: selected ? 7 : 2,
            borderColor: selected ? Colors.primary : Colors['border-strong'],
            backgroundColor: Colors.surface,
            marginLeft: 8,
          }}
        />
      ) : null}
    </>
  );
  const style = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: selected ? Colors.primary : Colors.border,
    backgroundColor: selected ? Colors['primary-soft'] : Colors.surface,
    marginBottom: 10,
  };
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: Boolean(selected) }}
      aria-checked={Boolean(selected)}
      accessibilityLabel={method.name}
      onPress={onPress}
      style={({ pressed }) => [style, pressed && !selected ? { backgroundColor: Colors.canvas } : null]}
    >
      {body}
    </Pressable>
  );
}
