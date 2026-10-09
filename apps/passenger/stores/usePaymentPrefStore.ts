import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// The rider's default payment method, shown with a star on the Payments
// screen and pre-selected on every new booking. Persisted per device.
const KEY = 'kimu_default_payment_method';

export const usePaymentPrefStore = create<{
  defaultId: string;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  setDefault: (id: string) => Promise<void>;
}>((set) => ({
  defaultId: 'cash',
  isHydrated: false,
  hydrate: async () => {
    try {
      const v = await AsyncStorage.getItem(KEY);
      set({ defaultId: v || 'cash', isHydrated: true });
    } catch {
      set({ isHydrated: true });
    }
  },
  setDefault: async (id) => {
    set({ defaultId: id });
    try {
      await AsyncStorage.setItem(KEY, id);
    } catch {
      // A failed write just means the default resets next launch.
    }
  },
}));
