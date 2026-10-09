import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const PIN_KEY = 'kimu_driver_app_pin';
/** Re-lock after this long in the background. Short trips between apps (a
 *  map, a call, the dialer during an SOS) must not demand the PIN again. */
const RELOCK_AFTER_MS = 60_000;

export const PIN_LENGTH = 4;

interface AppLockState {
  /** Null until the stored PIN has been read back. */
  isHydrated: boolean;
  /** Whether the driver has set a PIN at all. */
  enabled: boolean;
  /** Whether the app is currently blocked behind the PIN. */
  locked: boolean;
  backgroundedAt: number | null;
  hydrate: () => Promise<void>;
  setPin: (pin: string) => Promise<void>;
  clearPin: (currentPin: string) => Promise<boolean>;
  verify: (pin: string) => Promise<boolean>;
  /** Called when the app leaves and returns to the foreground. */
  noteBackgrounded: () => void;
  noteForegrounded: () => void;
  lockNow: () => void;
}

/**
 * A PIN in front of the driver app.
 *
 * The point is a phone that is lost or taken: without this, whoever holds it
 * can go online, take rides and request a payout as the driver. The PIN lives
 * in SecureStore, which is backed by the Android keystore, so it is not
 * readable from the filesystem; it never leaves the device and never reaches
 * the server, because it guards this app rather than the account.
 */
export const useAppLockStore = create<AppLockState>((set, get) => ({
  isHydrated: false,
  enabled: false,
  locked: false,
  backgroundedAt: null,

  hydrate: async () => {
    try {
      const pin = await SecureStore.getItemAsync(PIN_KEY);
      // A PIN already set means the app opens locked.
      set({ enabled: !!pin, locked: !!pin, isHydrated: true });
    } catch {
      set({ enabled: false, locked: false, isHydrated: true });
    }
  },

  setPin: async (pin) => {
    await SecureStore.setItemAsync(PIN_KEY, pin);
    set({ enabled: true, locked: false });
  },

  clearPin: async (currentPin) => {
    const stored = await SecureStore.getItemAsync(PIN_KEY).catch(() => null);
    if (!stored || stored !== currentPin) return false;
    await SecureStore.deleteItemAsync(PIN_KEY).catch(() => {});
    set({ enabled: false, locked: false });
    return true;
  },

  verify: async (pin) => {
    const stored = await SecureStore.getItemAsync(PIN_KEY).catch(() => null);
    if (stored && stored === pin) {
      set({ locked: false, backgroundedAt: null });
      return true;
    }
    return false;
  },

  noteBackgrounded: () => {
    if (!get().enabled) return;
    set({ backgroundedAt: Date.now() });
  },

  noteForegrounded: () => {
    const { enabled, backgroundedAt } = get();
    if (!enabled || backgroundedAt == null) return;
    if (Date.now() - backgroundedAt >= RELOCK_AFTER_MS) set({ locked: true });
    set({ backgroundedAt: null });
  },

  lockNow: () => {
    if (get().enabled) set({ locked: true });
  },
}));
