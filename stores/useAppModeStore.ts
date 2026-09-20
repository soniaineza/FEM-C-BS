
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
export type AppMode = 'passenger' | 'driver';
const MODE_KEY = 'app_mode';

interface AppModeState {
  mode: AppMode;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  setMode: (mode: AppMode) => Promise<void>;
}

export const useAppModeStore = create<AppModeState>((set) => ({
  mode: 'passenger',
  isHydrated: false,

  hydrate: async () => {
    const stored = await AsyncStorage.getItem(MODE_KEY);
    set({ mode: stored === 'driver' ? 'driver' : 'passenger', isHydrated: true });
  },

  setMode: async (mode) => {
    await AsyncStorage.setItem(MODE_KEY, mode);
    set({ mode });
  },
}));
