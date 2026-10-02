import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Locale } from '../locales';

const STORAGE_KEY = 'kimu_locale';
const CHOSEN_KEY = 'kimu_locale_chosen';

interface LocaleState {
  locale: Locale;
  // False until the rider explicitly picks a language on the first-launch
  // screen. Gates the (auth) welcome so language is chosen before login.
  hasChosenLanguage: boolean;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  setLocale: (locale: Locale) => Promise<void>;
}

// Default locale is rw (Kinyarwanda), matching the Flutter app's default.
export const useLocaleStore = create<LocaleState>((set) => ({
  locale: 'rw',
  hasChosenLanguage: false,
  isHydrated: false,
  hydrate: async () => {
    const [stored, chosen] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(CHOSEN_KEY),
    ]);
    set({
      locale: stored === 'rw' || stored === 'fr' || stored === 'en' ? stored : 'rw',
      hasChosenLanguage: chosen === '1',
      isHydrated: true,
    });
  },
  setLocale: async (locale) => {
    set({ locale, hasChosenLanguage: true });
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEY, locale),
      AsyncStorage.setItem(CHOSEN_KEY, '1'),
    ]);
  },
}));
