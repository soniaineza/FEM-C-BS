import { ReactNode } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { Pressable } from './Pressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Elevation } from '../../constants/theme';
import { Text } from './Text';

/**
 * Modal bottom sheet with grabber, title and scrim. Use for pickers and
 * short choices (language, reasons) instead of centered custom modals.
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: Colors.overlay }]} />
        <View
          style={[
            {
              backgroundColor: Colors.surface,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              paddingHorizontal: 20,
              paddingTop: 10,
              paddingBottom: Math.max(insets.bottom, 16) + 8,
              width: '100%',
              maxWidth: 560,
              alignSelf: 'center',
            },
            Elevation[4],
          ]}
        >
          <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: Colors['border-strong'], marginBottom: 16 }} />
          {title ? <Text variant="title-3">{title}</Text> : null}
          {subtitle ? (
            <Text variant="subhead" tone="muted" style={{ marginTop: 4 }}>
              {subtitle}
            </Text>
          ) : null}
          <View style={{ marginTop: title ? 16 : 0 }}>{children}</View>
        </View>
      </View>
    </Modal>
  );
}

/** Single-select row for use inside a Sheet. */
export function SheetOption({ label, description, selected, onPress }: { label: string; description?: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 56,
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginBottom: 8,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: selected ? Colors.primary : Colors.border,
        backgroundColor: selected ? Colors['primary-soft'] : pressed ? Colors.canvas : Colors.surface,
      })}
    >
      <View style={{ flex: 1 }}>
        <Text variant="callout" weight={selected ? 'semibold' : 'medium'}>
          {label}
        </Text>
        {description ? (
          <Text variant="footnote" tone="muted" style={{ marginTop: 2 }}>
            {description}
          </Text>
        ) : null}
      </View>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: selected ? 7 : 2,
          borderColor: selected ? Colors.primary : Colors['border-strong'],
          backgroundColor: Colors.surface,
        }}
      />
    </Pressable>
  );
}
