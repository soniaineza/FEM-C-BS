import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Locale } from '../locales';

const STORAGE_KEY = 'fem_locale';

interface LocaleState {
  locale: Locale;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  setLocale: (locale: Locale) => Promise<void>;
}

// Default locale is rw (Kinyarwanda), matching the Flutter app's default.
export const useLocaleStore = create<LocaleState>((set) => ({
  locale: 'rw',
  isHydrated: false,
  hydrate: async () => {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === 'rw' || stored === 'fr' || stored === 'en') {
      set({ locale: stored, isHydrated: true });
    } else {
      set({ isHydrated: true });
    }
  },
  setLocale: async (locale) => {
    set({ locale });
    await AsyncStorage.setItem(STORAGE_KEY, locale);
  },
}));
