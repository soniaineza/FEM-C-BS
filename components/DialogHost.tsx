import { Modal, Pressable, Text, View } from 'react-native';

import { useDialogStore } from '../utils/dialog';

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
  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <Pressable className="flex-1 items-center justify-center bg-black/40 px-8" onPress={dismiss}>
        <Pressable
          accessibilityRole="alert"
          className="w-full max-w-sm rounded-2xl bg-white p-6"
          onPress={(e) => e.stopPropagation()}
        >
          <Text className="text-lg font-bold text-ink">{dialog.title}</Text>
          {dialog.message ? <Text className="mt-2 text-[15px] leading-5 text-text-secondary">{dialog.message}</Text> : null}
          <View className="mt-5 flex-row flex-wrap justify-end gap-2">
            {dialog.buttons.map((b, i) => (
              <Pressable
                key={`${b.text}-${i}`}
                accessibilityRole="button"
                className={`rounded-xl px-4 py-2.5 ${b.style === 'destructive' ? 'bg-error' : b.style === 'cancel' ? 'bg-gray-light' : 'bg-primary'}`}
                onPress={() => {
                  close(null);
                  b.onPress?.();
                }}
              >
                <Text className={`font-semibold ${b.style === 'cancel' ? 'text-ink' : 'text-white'}`}>{b.text}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
