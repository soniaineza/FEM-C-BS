import en from './en.json';
import fr from './fr.json';
import rw from './rw.json';

export type Locale = 'rw' | 'fr' | 'en';
export type TranslationKey = keyof typeof en;

export const dictionaries: Record<Locale, Record<string, string>> = { rw, fr, en };

export const supportedLocales: Locale[] = ['rw', 'fr', 'en'];

export const languageNames: Record<Locale, string> = {
  rw: 'Kinyarwanda',
  fr: 'Français',
  en: 'English',
};
