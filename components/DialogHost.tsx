import { Modal, Pressable, View } from 'react-native';

import { Colors, Elevation } from '../constants/theme';
import { useDialogStore } from '../utils/dialog';
import { Button } from './Button';
import { Text } from './ui/Text';

/** Renders appAlert() dialogs on web (native uses the system dialog). */
export function DialogHost() {
  const dialog = useDialogStore((s) => s.dialog);
  const close = useDialogStore((s) => s.set);
  if (!dialog) return null;
  const cancel = dialog.buttons.find((b) => b.style === 'cancel');
  const dismiss = () => {
    close(null);
    cancel?.onPress?.();
  };
  // Primary action last (rightmost / bottom), per platform convention.
  const buttons = [...dialog.buttons].sort((a, b) => Number(b.style === 'cancel') - Number(a.style === 'cancel'));
  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <Pressable
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.overlay, paddingHorizontal: 24 }}
        onPress={dismiss}
      >
        <Pressable
          accessibilityRole="alert"
          style={[{ width: '100%', maxWidth: 400, borderRadius: 24, backgroundColor: Colors.surface, padding: 24 }, Elevation[4]]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text variant="title-3">{dialog.title}</Text>
          {dialog.message ? (
            <Text variant="callout" tone="muted" style={{ marginTop: 8 }}>
              {dialog.message}
            </Text>
          ) : null}
          <View style={{ marginTop: 24, flexDirection: buttons.length > 2 ? 'column' : 'row', gap: 10 }}>
            {buttons.map((b, i) => (
              <View key={`${b.text}-${i}`} style={buttons.length > 2 ? undefined : { flex: 1 }}>
                <Button
                  title={b.text ?? 'OK'}
                  size="md"
                  variant={b.style === 'destructive' ? 'danger' : b.style === 'cancel' ? 'outline' : 'primary'}
                  onPress={() => {
                    close(null);
                    b.onPress?.();
                  }}
                />
              </View>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
