import { Alert, Platform, type AlertButton, type AlertOptions } from 'react-native';
import { create } from 'zustand';

// Drop-in for Alert.alert that also works on web. react-native-web's
// Alert.alert is an empty function, so on web "Log out?" confirmations and
// info pop-ups silently did nothing. Native keeps the system dialog; web
// shows the app-styled DialogHost (components/DialogHost.tsx), per the
// TypeSafe Jev decision (web-only custom modal, 0.86).

export interface DialogState {
  title: string;
  message?: string;
  buttons: AlertButton[];
}

export const useDialogStore = create<{ dialog: DialogState | null; set: (d: DialogState | null) => void }>((set) => ({
  dialog: null,
  set: (dialog) => set({ dialog }),
}));

// `options` is forwarded to the native dialog only (react-native-web has no
// equivalent). Callers awaiting a button press need `cancelable: false` there:
// on Android an outside tap otherwise dismisses the dialog without invoking
// any button, which would leave such a promise pending forever. On web
// DialogHost already routes a backdrop dismiss to the cancel button, so the
// same guarantee holds without the flag.
export function appAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: AlertOptions
) {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons, options);
    return;
  }
  useDialogStore.getState().set({ title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }] });
}
